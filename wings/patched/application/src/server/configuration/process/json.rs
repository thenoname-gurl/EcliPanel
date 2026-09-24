use super::ServerConfigurationFile;
use compact_str::ToCompactString;

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
            let resolved = super::ResolvedReplacement::new(server, replacement, true).await?;

            for path in expand_match_path(&json, &replacement.r#match) {
                // the shared borrow has to end before set_nested_value takes &mut json
                let existing = get_nested_value(&json, &path);
                let existing_is_string = existing.is_some_and(serde_json::Value::is_string);
                let existing = existing.map(value_to_text);

                let Some(gate) = resolved.gate(existing.as_deref()) else {
                    continue;
                };

                set_nested_value(
                    &mut json,
                    &path,
                    coerce_value(replacement, &resolved.value, gate, existing_is_string),
                    resolved.insert_new,
                    resolved.update_existing,
                );
            }
        }

        Ok(serde_json::to_vec_pretty(&json)?)
    }
}

#[derive(Debug, Clone)]
pub enum PathSegment<'a> {
    Key(std::borrow::Cow<'a, str>),
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
                out.push(PathSegment::Key(part.into()));
                continue;
            }
        };

        if !key.is_empty() {
            out.push(PathSegment::Key(key.into()));
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

pub fn coerce_value(
    replacement: &super::ServerConfigurationFileReplacement,
    value: &str,
    gate: super::Replacement,
    existing_is_string: bool,
) -> serde_json::Value {
    let text = match &gate {
        super::Replacement::Substituted(text) if existing_is_string => {
            return serde_json::Value::String(text.to_string());
        }
        super::Replacement::Substituted(text) => text.as_str(),
        super::Replacement::Value => match &replacement.replace_with {
            serde_json::Value::String(_) => value,
            other => return other.clone(),
        },
    };

    serde_json::from_str(text).unwrap_or_else(|_| serde_json::Value::String(text.to_string()))
}

pub fn get_nested_value<'a>(
    json: &'a serde_json::Value,
    path: &[PathSegment<'_>],
) -> Option<&'a serde_json::Value> {
    let mut current = json;

    for segment in path {
        current = match segment {
            PathSegment::Key(key) => current.get(key.as_ref())?,
            PathSegment::Index(index) => current.get(index)?,
        };
    }

    Some(current)
}

pub fn value_to_text(value: &serde_json::Value) -> compact_str::CompactString {
    match value {
        serde_json::Value::String(s) => s.as_str().into(),
        serde_json::Value::Null => compact_str::CompactString::default(),
        other => other.to_compact_string(),
    }
}

pub fn split_wildcard(raw: &str) -> Option<(&str, &str)> {
    match raw.strip_prefix('*') {
        Some(remaining) => Some(("", remaining)),
        None => raw.split_once(".*"),
    }
}

pub fn reject_leftover_wildcards<'a>(
    raw: &str,
    paths: Vec<Vec<PathSegment<'a>>>,
) -> Vec<Vec<PathSegment<'a>>> {
    paths
        .into_iter()
        .filter(|path| {
            let leftover = path
                .iter()
                .any(|segment| matches!(segment, PathSegment::Key(key) if key == "*"));

            if leftover {
                tracing::warn!(
                    "skipping match '{}': only one '*' wildcard is supported",
                    raw
                );
            }

            !leftover
        })
        .collect()
}

pub fn expand_match_path<'a>(json: &serde_json::Value, raw: &'a str) -> Vec<Vec<PathSegment<'a>>> {
    let Some((base, remaining)) = split_wildcard(raw) else {
        return reject_leftover_wildcards(raw, vec![parse_path(raw)]);
    };

    let base = parse_path(base.trim_matches('.'));
    let remaining = parse_path(remaining.trim_matches('.'));

    let Some(children) = get_nested_value(json, &base) else {
        return Vec::new();
    };

    let concrete = |segment: PathSegment<'a>| {
        let mut path = base.clone();
        path.push(segment);
        path.extend(remaining.iter().cloned());

        path
    };

    let expanded = match children {
        serde_json::Value::Array(items) => (0..items.len())
            .map(|index| concrete(PathSegment::Index(index)))
            .collect(),
        serde_json::Value::Object(map) => map
            .keys()
            .map(|key| concrete(PathSegment::Key(std::borrow::Cow::Owned(key.clone()))))
            .collect(),
        _ => Vec::new(),
    };

    reject_leftover_wildcards(raw, expanded)
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
                    let exists = map.contains_key(k.as_ref());

                    if (exists && update_existing) || (!exists && insert_new) {
                        map.insert(k.to_string(), value);
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

                map.entry(k.to_string()).or_insert_with(default_child)
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

    fn gated(
        m: &str,
        value: serde_json::Value,
        if_value: &str,
    ) -> ServerConfigurationFileReplacement {
        ServerConfigurationFileReplacement {
            r#match: m.into(),
            if_value: Some(if_value.into()),
            insert_new: None,
            update_existing: true,
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

    // wildcards

    #[test]
    fn wildcard_updates_every_object_child() {
        let out = run(
            r#"{"listeners": {"a": {"host": "0.0.0.0"}, "b": {"host": "0.0.0.0"}}}"#,
            vec![rep("listeners.*.host", json!("10.0.0.1"), None, true)],
        );
        assert_eq!(
            out,
            json!({"listeners": {"a": {"host": "10.0.0.1"}, "b": {"host": "10.0.0.1"}}})
        );
    }

    #[test]
    fn wildcard_updates_every_array_child() {
        let out = run(
            r#"{"listeners": [{"host": "a"}, {"host": "b"}]}"#,
            vec![rep("listeners.*.host", json!("10.0.0.1"), None, true)],
        );
        assert_eq!(
            out,
            json!({"listeners": [{"host": "10.0.0.1"}, {"host": "10.0.0.1"}]})
        );
    }

    #[test]
    fn trailing_wildcard_replaces_children_themselves() {
        let out = run(
            r#"{"ports": {"a": 1, "b": 2}}"#,
            vec![rep("ports.*", json!(25565), None, true)],
        );
        assert_eq!(out, json!({"ports": {"a": 25565, "b": 25565}}));
    }

    #[test]
    fn wildcard_over_missing_base_does_nothing() {
        let out = run(
            r#"{"keep": 1}"#,
            vec![rep("listeners.*.host", json!("x"), None, true)],
        );
        assert_eq!(out, json!({"keep": 1}));
    }

    #[test]
    fn leading_wildcard_addresses_root_children() {
        let out = run(
            r#"{"a": {"motd": "old"}, "b": {"motd": "old"}}"#,
            vec![rep("*.motd", json!("new"), None, true)],
        );
        assert_eq!(out, json!({"a": {"motd": "new"}, "b": {"motd": "new"}}));
    }

    #[test]
    fn a_second_wildcard_is_rejected_rather_than_written_literally() {
        let out = run(
            r#"{"a": {"b": {"c": 1}}}"#,
            vec![rep("a.*.b.*.c", json!(2), None, true)],
        );
        assert_eq!(out, json!({"a": {"b": {"c": 1}}}));
    }

    #[test]
    fn wildcard_creates_no_literal_star_key() {
        let out = run(
            r#"{"listeners": {"a": {}}}"#,
            vec![rep("listeners.*.host", json!("x"), None, true)],
        );
        assert_eq!(out, json!({"listeners": {"a": {"host": "x"}}}));
    }

    // if_value

    #[test]
    fn if_value_gates_on_the_existing_value() {
        let out = run(
            r#"{"host": "0.0.0.0", "other": "1.2.3.4"}"#,
            vec![
                gated("host", json!("10.0.0.1"), "0.0.0.0"),
                gated("other", json!("10.0.0.1"), "0.0.0.0"),
            ],
        );
        assert_eq!(out, json!({"host": "10.0.0.1", "other": "1.2.3.4"}));
    }

    #[test]
    fn if_value_compares_against_non_string_leaves() {
        let out = run(
            r#"{"port": 25565, "enabled": true}"#,
            vec![
                gated("port", json!(25566), "25565"),
                gated("enabled", json!(false), "true"),
            ],
        );
        assert_eq!(out, json!({"port": 25566, "enabled": false}));
    }

    #[test]
    fn if_value_blocks_insertion_of_a_missing_key() {
        let out = run(r#"{"keep": 1}"#, vec![gated("host", json!("x"), "0.0.0.0")]);
        assert_eq!(out, json!({"keep": 1}));
    }

    #[test]
    fn regex_if_value_substitutes_within_the_existing_value() {
        let out = run(
            r#"{"url": "jdbc:mysql://127.0.0.1:3306/db"}"#,
            vec![gated("url", json!("10.0.0.1"), r"regex:127\.0\.0\.1")],
        );
        assert_eq!(out, json!({"url": "jdbc:mysql://10.0.0.1:3306/db"}));
    }

    #[test]
    fn regex_if_value_expands_capture_groups() {
        let out = run(
            r#"{"bind": "0.0.0.0:25565"}"#,
            vec![gated(
                "bind",
                json!("10.0.0.1:$1"),
                r"regex:0\.0\.0\.0:(\d+)",
            )],
        );
        assert_eq!(out, json!({"bind": "10.0.0.1:25565"}));
    }

    #[test]
    fn regex_if_value_leaves_non_matching_values_alone() {
        let out = run(
            r#"{"url": "jdbc:mysql://db.internal:3306/db"}"#,
            vec![gated("url", json!("10.0.0.1"), r"regex:127\.0\.0\.1")],
        );
        assert_eq!(out, json!({"url": "jdbc:mysql://db.internal:3306/db"}));
    }

    #[test]
    fn invalid_regex_if_value_skips_rather_than_erroring() {
        let out = run(
            r#"{"url": "keep"}"#,
            vec![gated("url", json!("x"), "regex:[unclosed")],
        );
        assert_eq!(out, json!({"url": "keep"}));
    }

    #[test]
    fn wildcard_and_if_value_combine_per_child() {
        let out = run(
            r#"{"l": {"a": {"host": "0.0.0.0"}, "b": {"host": "1.2.3.4"}}}"#,
            vec![gated("l.*.host", json!("10.0.0.1"), "0.0.0.0")],
        );
        assert_eq!(
            out,
            json!({"l": {"a": {"host": "10.0.0.1"}, "b": {"host": "1.2.3.4"}}})
        );
    }
}
