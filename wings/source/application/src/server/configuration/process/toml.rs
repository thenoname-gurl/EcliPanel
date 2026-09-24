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
            let resolved = super::ResolvedReplacement::new(server, replacement, true).await?;

            for path in expand_match_path(doc.as_table(), &replacement.r#match) {
                let existing = Node::at(doc.as_table(), &path);
                let existing_is_string = existing.as_ref().is_some_and(Node::is_string);
                let existing = existing.map(|node| node.text());

                let Some(gate) = resolved.gate(existing.as_deref()) else {
                    continue;
                };

                set_nested_value(
                    doc.as_table_mut(),
                    &path,
                    coerce_value(replacement, &resolved.value, gate, existing_is_string),
                    resolved.insert_new,
                    resolved.update_existing,
                );
            }
        }

        Ok(doc.to_string().into_bytes())
    }
}

enum Node<'a> {
    Table(&'a dyn TableLike),
    Array(&'a Array),
    Tables(&'a ArrayOfTables),
    Leaf(&'a Value),
}

impl<'a> Node<'a> {
    fn of_value(value: &'a Value) -> Self {
        match value {
            Value::Array(array) => Self::Array(array),
            Value::InlineTable(table) => Self::Table(table),
            leaf => Self::Leaf(leaf),
        }
    }

    fn at(table: &'a dyn TableLike, path: &[super::json::PathSegment<'_>]) -> Option<Self> {
        use super::json::PathSegment::{Index, Key};

        let mut node = Self::Table(table);

        for segment in path {
            node = match (node, segment) {
                (Self::Table(table), Key(key)) => match table.get(key.as_ref())? {
                    Item::Table(table) => Self::Table(table),
                    Item::ArrayOfTables(tables) => Self::Tables(tables),
                    Item::Value(value) => Self::of_value(value),
                    Item::None => return None,
                },
                (Self::Array(array), Index(index)) => Self::of_value(array.get(*index)?),
                (Self::Tables(tables), Index(index)) => Self::Table(tables.get(*index)?),
                _ => return None,
            };
        }

        Some(node)
    }

    fn text(&self) -> compact_str::CompactString {
        match self {
            Self::Leaf(Value::String(v)) => v.value().as_str().into(),
            Self::Leaf(Value::Integer(v)) => v.value().to_string().into(),
            Self::Leaf(Value::Float(v)) => v.value().to_string().into(),
            Self::Leaf(Value::Boolean(v)) => v.value().to_string().into(),
            Self::Leaf(Value::Datetime(v)) => v.value().to_string().into(),
            _ => compact_str::CompactString::default(),
        }
    }

    fn is_string(&self) -> bool {
        matches!(self, Self::Leaf(Value::String(_)))
    }

    fn child_segments<'s>(&self) -> Vec<super::json::PathSegment<'s>> {
        use super::json::PathSegment::{Index, Key};

        match self {
            Self::Table(table) => table
                .iter()
                .map(|(key, _)| Key(std::borrow::Cow::Owned(key.to_string())))
                .collect(),
            Self::Array(array) => (0..array.len()).map(Index).collect(),
            Self::Tables(tables) => (0..tables.len()).map(Index).collect(),
            Self::Leaf(_) => Vec::new(),
        }
    }
}

fn expand_match_path<'a>(
    table: &dyn TableLike,
    raw: &'a str,
) -> Vec<Vec<super::json::PathSegment<'a>>> {
    let Some((base, remaining)) = super::json::split_wildcard(raw) else {
        return super::json::reject_leftover_wildcards(raw, vec![super::json::parse_path(raw)]);
    };

    let base = super::json::parse_path(base.trim_matches('.'));
    let remaining = super::json::parse_path(remaining.trim_matches('.'));

    let Some(node) = Node::at(table, &base) else {
        return Vec::new();
    };

    let expanded = node
        .child_segments()
        .into_iter()
        .map(|segment| {
            let mut path = base.clone();
            path.push(segment);
            path.extend(remaining.iter().cloned());

            path
        })
        .collect();

    super::json::reject_leftover_wildcards(raw, expanded)
}

fn coerce_value(
    replacement: &super::ServerConfigurationFileReplacement,
    value: &str,
    gate: super::Replacement,
    existing_is_string: bool,
) -> Value {
    let text = match &gate {
        super::Replacement::Substituted(text) if existing_is_string => {
            return Value::from(text.as_str());
        }
        super::Replacement::Substituted(text) => text.as_str(),
        super::Replacement::Value => match &replacement.replace_with {
            serde_json::Value::String(_) => value,
            other => return json_to_toml_value(other),
        },
    };

    text.parse::<Item>()
        .ok()
        .and_then(|item| item.into_value().ok())
        .unwrap_or_else(|| Value::from(text))
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

    #[test]
    fn wildcard_updates_every_table_child() {
        let doc = run(
            "[servers.a]\nhost = \"0.0.0.0\"\n[servers.b]\nhost = \"0.0.0.0\"\n",
            vec![rep("servers.*.host", json!("10.0.0.1"), None, true)],
        );
        assert_eq!(doc["servers"]["a"]["host"].as_str(), Some("10.0.0.1"));
        assert_eq!(doc["servers"]["b"]["host"].as_str(), Some("10.0.0.1"));
    }

    #[test]
    fn wildcard_over_missing_base_does_nothing() {
        let doc = run(
            "keep = 1\n",
            vec![rep("servers.*.host", json!("x"), None, true)],
        );
        assert!(doc.get("servers").is_none());
    }

    #[test]
    fn if_value_gates_on_the_existing_value() {
        let doc = run(
            "host = \"0.0.0.0\"\nother = \"1.2.3.4\"\n",
            vec![
                gated("host", json!("10.0.0.1"), "0.0.0.0"),
                gated("other", json!("10.0.0.1"), "0.0.0.0"),
            ],
        );
        assert_eq!(doc["host"].as_str(), Some("10.0.0.1"));
        assert_eq!(doc["other"].as_str(), Some("1.2.3.4"));
    }

    #[test]
    fn if_value_compares_integers_without_toml_decor() {
        let doc = run(
            "port =  25565\n",
            vec![gated("port", json!(25566), "25565")],
        );
        assert_eq!(doc["port"].as_integer(), Some(25566));
    }

    #[test]
    fn regex_if_value_keeps_a_string_leaf_a_string() {
        let doc = run(
            "version = \"1.20\"\n",
            vec![gated("version", json!("2."), r"regex:^1\.")],
        );
        assert_eq!(doc["version"].as_str(), Some("2.20"));
    }
}
