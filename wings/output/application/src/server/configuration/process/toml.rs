use super::ServerConfigurationFile;
use toml_edit::{Array, ArrayOfTables, DocumentMut, InlineTable, Item, Table, TableLike, Value};

pub struct TomlFileParser;

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for TomlFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(server = %server.uuid, "processing toml file");

        let mut doc = if content.trim().is_empty() {
            DocumentMut::new()
        } else {
            content.parse::<DocumentMut>().unwrap_or_default()
        };

        for replacement in &config.replace {
            let value: Value = match &replacement.replace_with {
                serde_json::Value::String(_) => {
                    let resolved = ServerConfigurationFile::replace_all_placeholders(
                        server,
                        &replacement.replace_with,
                    )
                    .await?;

                    resolved
                        .parse::<Item>()
                        .ok()
                        .and_then(|item| item.into_value().ok())
                        .unwrap_or_else(|| Value::from(resolved.into_string()))
                }
                other => json_to_toml_value(other),
            };

            let path = super::json::parse_path(&replacement.r#match);
            set_nested_value(
                doc.as_table_mut(),
                &path,
                value,
                replacement.insert_new.unwrap_or(true),
                replacement.update_existing,
            );
        }

        Ok(doc.to_string().into_bytes())
    }
}

fn json_to_toml_value(json: &serde_json::Value) -> Value {
    match json {
        serde_json::Value::Null => Value::from("null"),
        serde_json::Value::Bool(b) => Value::from(*b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Value::from(i)
            } else if let Some(f) = n.as_f64() {
                Value::from(f)
            } else {
                Value::from(n.to_string())
            }
        }
        serde_json::Value::String(s) => Value::from(s.clone()),
        serde_json::Value::Array(arr) => {
            let mut a = Array::new();
            for v in arr {
                a.push(json_to_toml_value(v));
            }
            Value::Array(a)
        }
        serde_json::Value::Object(map) => {
            let mut t = InlineTable::new();
            for (k, v) in map {
                t.insert(k, json_to_toml_value(v));
            }
            Value::InlineTable(t)
        }
    }
}

pub fn set_nested_value(
    table: &mut dyn TableLike,
    path: &[super::json::PathSegment<'_>],
    value: Value,
    insert_new: bool,
    update_existing: bool,
) {
    let mut table = table;
    let mut path = path;

    loop {
        let Some((head, tail)) = path.split_first() else {
            return;
        };
        let super::json::PathSegment::Key(k) = head else {
            return;
        };

        let (Some(tail_first), Some(tail_slice)) = (tail.first(), tail.get(1..)) else {
            let exists = table.contains_key(k);
            if (exists && update_existing) || (!exists && insert_new) {
                table.insert(k, Item::Value(value));
            }
            return;
        };

        match tail_first {
            super::json::PathSegment::Key(_) => {
                let child = table.entry(k).or_insert(Item::Table(Table::new()));
                let Some(child_table) = child.as_table_like_mut() else {
                    return;
                };

                table = child_table;
                path = tail;
            }
            super::json::PathSegment::Index(i) => {
                let i = *i;

                let Some(rest_first) = tail.get(1) else {
                    let child = table
                        .entry(k)
                        .or_insert(Item::Value(Value::Array(Array::new())));
                    let Some(arr) = child.as_array_mut() else {
                        return;
                    };

                    if i < arr.len() {
                        if update_existing {
                            arr.remove(i);
                            arr.insert(i, value);
                        }
                    } else if insert_new {
                        while arr.len() < i {
                            arr.push(Value::InlineTable(InlineTable::new()));
                        }
                        arr.push(value);
                    }

                    return;
                };

                if !matches!(rest_first, super::json::PathSegment::Key(_)) {
                    return;
                }

                let child = table
                    .entry(k)
                    .or_insert(Item::ArrayOfTables(ArrayOfTables::new()));
                let Some(aot) = child.as_array_of_tables_mut() else {
                    return;
                };

                if i >= aot.len() {
                    if !insert_new {
                        return;
                    }
                    while aot.len() <= i {
                        aot.push(Table::new());
                    }
                }

                let Some(elem) = aot.get_mut(i) else {
                    return;
                };

                table = elem;
                path = tail_slice;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{super::*, *};
    use serde_json::json;
    use toml_edit::DocumentMut;

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

    fn run(content: &str, replace: Vec<ServerConfigurationFileReplacement>) -> DocumentMut {
        tokio_test::block_on(async {
            let state = crate::routes::AppState::mock();
            let server = crate::server::Server::mock(uuid::Uuid::new_v4(), state);
            let config = ServerConfigurationFile {
                file: "config.toml".into(),
                create_new: true,
                parser: ServerConfigurationFileParser::Toml,
                replace,
            };
            let bytes = TomlFileParser::process_file(content, &config, &server)
                .await
                .unwrap();
            String::from_utf8(bytes)
                .unwrap()
                .parse::<DocumentMut>()
                .unwrap()
        })
    }

    // TomlFileParser

    #[test]
    fn sets_top_level_string() {
        let doc = run("", vec![rep("name", json!("lobby"), None, true)]);
        assert_eq!(doc["name"].as_str(), Some("lobby"));
    }

    #[test]
    fn string_values_coerce_to_toml_scalars() {
        let doc = run(
            "",
            vec![
                rep("a", json!("100"), None, true),
                rep("b", json!("true"), None, true),
                rep("c", json!("text"), None, true),
            ],
        );
        assert_eq!(doc["a"].as_integer(), Some(100));
        assert_eq!(doc["b"].as_bool(), Some(true));
        assert_eq!(doc["c"].as_str(), Some("text"));
    }

    #[test]
    fn creates_nested_table() {
        let doc = run("", vec![rep("server.port", json!(25565), None, true)]);
        assert_eq!(doc["server"]["port"].as_integer(), Some(25565));
    }

    #[test]
    fn sets_array_value_leaf() {
        let doc = run("", vec![rep("ports[0]", json!(25565), None, true)]);
        assert_eq!(doc["ports"][0].as_integer(), Some(25565));
    }

    #[test]
    fn builds_array_of_tables() {
        let doc = run("", vec![rep("servers[0].name", json!("lobby"), None, true)]);
        let aot = doc["servers"].as_array_of_tables().unwrap();
        assert_eq!(
            aot.get(0).unwrap().get("name").and_then(|i| i.as_str()),
            Some("lobby")
        );
    }

    #[test]
    fn respects_flags() {
        let doc = run(
            "name = \"old\"\n",
            vec![rep("name", json!("new"), Some(true), false)],
        );
        assert_eq!(doc["name"].as_str(), Some("old"));

        let doc = run("", vec![rep("missing", json!("x"), Some(false), true)]);
        assert!(doc.get("missing").is_none());
    }
}
