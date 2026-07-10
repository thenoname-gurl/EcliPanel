use super::ServerConfigurationFile;

pub struct JsonFileParser;

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for JsonFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(
            server = %server.uuid,
            "processing json file"
        );

        let mut json = if content.trim().is_empty() {
            serde_json::Value::Object(serde_json::Map::new())
        } else {
            serde_json::from_str(content)
                .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()))
        };

        for replacement in &config.replace {
            let value = match &replacement.replace_with {
                serde_json::Value::String(_) => {
                    let resolved = ServerConfigurationFile::replace_all_placeholders(
                        server,
                        &replacement.replace_with,
                    )
                    .await?;

                    serde_json::from_str(&resolved)
                        .unwrap_or_else(|_| serde_json::Value::String(resolved.into()))
                }
                other => other.clone(),
            };

            let path = parse_path(&replacement.r#match);
            set_nested_value(
                &mut json,
                &path,
                value,
                replacement.insert_new.unwrap_or(true),
                replacement.update_existing,
            );
        }

        Ok(serde_json::to_vec_pretty(&json)?)
    }
}

#[derive(Debug, Clone)]
pub enum PathSegment<'a> {
    Key(&'a str),
    Index(usize),
}

pub fn parse_path(raw: &str) -> Vec<PathSegment<'_>> {
    let mut out = Vec::new();

    for part in raw.split('.') {
        if part.is_empty() {
            continue;
        }

        let (key, mut rest) = match part.find('[') {
            Some(bracket) => part.split_at(bracket),
            None => {
                out.push(PathSegment::Key(part));
                continue;
            }
        };

        if !key.is_empty() {
            out.push(PathSegment::Key(key));
        }

        while let Some((head, tail)) = rest.split_once(']') {
            if let Some(idx_str) = head.strip_prefix('[')
                && let Ok(idx) = idx_str.parse::<usize>()
            {
                out.push(PathSegment::Index(idx));
            }
            rest = tail;
        }
    }

    out
}

pub fn set_nested_value(
    json: &mut serde_json::Value,
    path: &[PathSegment<'_>],
    value: serde_json::Value,
    insert_new: bool,
    update_existing: bool,
) {
    let mut current = json;
    let mut path = path;

    loop {
        let Some((head, tail)) = path.split_first() else {
            return;
        };

        match head {
            PathSegment::Key(_) if !current.is_object() => {
                *current = serde_json::Value::Object(serde_json::Map::new());
            }
            PathSegment::Index(_) if !current.is_array() => {
                *current = serde_json::Value::Array(Vec::new());
            }
            _ => {}
        }

        let Some(tail_first) = tail.first() else {
            match head {
                PathSegment::Key(k) => {
                    let Some(map) = current.as_object_mut() else {
                        return;
                    };
                    let exists = map.contains_key(*k);

                    if (exists && update_existing) || (!exists && insert_new) {
                        map.insert((*k).to_string(), value);
                    }
                }
                PathSegment::Index(i) => {
                    let Some(arr) = current.as_array_mut() else {
                        return;
                    };
                    let mut arr_element = arr.get_mut(*i);

                    if let Some(el) = arr_element.as_mut()
                        && update_existing
                    {
                        **el = value;
                    } else if arr_element.is_none() && insert_new {
                        while arr.len() < *i {
                            arr.push(serde_json::Value::Null);
                        }
                        arr.push(value);
                    }
                }
            }
            return;
        };

        let default_child = || {
            if matches!(tail_first, PathSegment::Index(_)) {
                serde_json::Value::Array(Vec::new())
            } else {
                serde_json::Value::Object(serde_json::Map::new())
            }
        };

        current = match head {
            PathSegment::Key(k) => {
                let Some(map) = current.as_object_mut() else {
                    return;
                };

                map.entry((*k).to_string()).or_insert_with(default_child)
            }
            PathSegment::Index(i) => {
                let Some(arr) = current.as_array_mut() else {
                    return;
                };

                while arr.len() <= *i {
                    arr.push(default_child());
                }
                let Some(el) = arr.get_mut(*i) else {
                    return;
                };

                el
            }
        };
        path = tail;
    }
}

#[cfg(test)]
mod tests {
    use super::{super::*, *};
    use serde_json::json;

    fn rep(
        m: &str,
        value: serde_json::Value,
        insert_new: Option<bool>,
        update_existing: bool,
    ) -> ServerConfigurationFileReplacement {
        ServerConfigurationFileReplacement {
            r#match: m.into(),
            if_value: None,
            insert_new,
            update_existing,
            replace_with: value,
        }
    }

    fn run(content: &str, replace: Vec<ServerConfigurationFileReplacement>) -> serde_json::Value {
        tokio_test::block_on(async {
            let state = crate::routes::AppState::mock();
            let server = crate::server::Server::mock(uuid::Uuid::new_v4(), state);
            let config = ServerConfigurationFile {
                file: "test.json".into(),
                create_new: true,
                parser: ServerConfigurationFileParser::Json,
                replace,
            };
            let bytes = JsonFileParser::process_file(content, &config, &server)
                .await
                .unwrap();
            serde_json::from_slice(&bytes).unwrap()
        })
    }

    fn segs(raw: &str) -> Vec<String> {
        parse_path(raw)
            .into_iter()
            .map(|s| match s {
                PathSegment::Key(k) => k.to_string(),
                PathSegment::Index(i) => format!("#{i}"),
            })
            .collect()
    }

    fn set(
        json: &mut serde_json::Value,
        path: &str,
        value: serde_json::Value,
        insert_new: bool,
        update_existing: bool,
    ) {
        set_nested_value(json, &parse_path(path), value, insert_new, update_existing);
    }

    // parse_path

    #[test]
    fn parse_path_keys_and_indices() {
        assert_eq!(segs("a.b.c"), ["a", "b", "c"]);
        assert_eq!(segs("a[0]"), ["a", "#0"]);
        assert_eq!(segs("a[0][1]"), ["a", "#0", "#1"]);
        assert_eq!(segs("a.b[2].c"), ["a", "b", "#2", "c"]);
        // empty segments from leading or doubled dots are skipped
        assert_eq!(segs("a..b"), ["a", "b"]);
        assert_eq!(segs("[3]"), ["#3"]);
        // non-numeric bracket content is dropped, the key survives
        assert_eq!(segs("a[x]"), ["a"]);
    }

    // set_nested_value

    #[test]
    fn set_nested_value_inserts_then_updates() {
        let mut j = json!({});
        set(&mut j, "a.b", json!(1), true, true);
        assert_eq!(j, json!({"a": {"b": 1}}));
        set(&mut j, "a.b", json!(2), true, true);
        assert_eq!(j, json!({"a": {"b": 2}}));
    }

    #[test]
    fn set_nested_value_respects_flags() {
        let mut j = json!({"a": 1});
        set(&mut j, "a", json!(2), true, false);
        assert_eq!(j, json!({"a": 1}));
        set(&mut j, "b", json!(2), false, true);
        assert_eq!(j, json!({"a": 1}));
    }

    #[test]
    fn set_nested_value_grows_array_with_nulls() {
        let mut j = json!({});
        set(&mut j, "a[0]", json!("x"), true, true);
        set(&mut j, "a[2]", json!("z"), true, true);
        assert_eq!(j, json!({"a": ["x", null, "z"]}));
    }

    #[test]
    fn set_nested_value_updates_array_index() {
        let mut j = json!({"a": [1, 2, 3]});
        set(&mut j, "a[1]", json!(9), true, true);
        assert_eq!(j, json!({"a": [1, 9, 3]}));
    }

    #[test]
    fn set_nested_value_overwrites_incompatible_scalar() {
        // descending a key into a non-object clobbers it with a fresh object
        let mut j = json!({"a": 5});
        set(&mut j, "a.b", json!(1), true, true);
        assert_eq!(j, json!({"a": {"b": 1}}));
    }

    // JsonFileParser

    #[test]
    fn empty_content_starts_from_object() {
        let out = run(
            "",
            vec![rep("settings.max-players", json!(100), None, true)],
        );
        assert_eq!(out, json!({"settings": {"max-players": 100}}));
    }

    #[test]
    fn string_values_are_parsed_as_json_when_possible() {
        let out = run(
            "{}",
            vec![
                rep("a", json!("true"), None, true),
                rep("b", json!("42"), None, true),
                rep("c", json!("hello"), None, true),
            ],
        );
        assert_eq!(out, json!({"a": true, "b": 42, "c": "hello"}));
    }

    #[test]
    fn non_string_values_are_used_verbatim() {
        let out = run("{}", vec![rep("a", json!({"nested": [1, 2]}), None, true)]);
        assert_eq!(out, json!({"a": {"nested": [1, 2]}}));
    }

    #[test]
    fn preserves_unrelated_keys() {
        let out = run(r#"{"keep": 1}"#, vec![rep("add", json!(2), None, true)]);
        assert_eq!(out, json!({"keep": 1, "add": 2}));
    }
}
