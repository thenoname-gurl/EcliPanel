use super::ServerConfigurationFile;

pub struct YamlFileParser;

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for YamlFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(
            server = %server.uuid,
            "processing yaml file"
        );

        let mut json: serde_json::Value = if content.trim().is_empty() {
            serde_json::Value::Object(serde_json::Map::new())
        } else {
            serde_norway::from_str(content)
                .unwrap_or_else(|_| serde_json::Value::Object(serde_json::Map::new()))
        };

        for replacement in &config.replace {
            let resolved = super::ResolvedReplacement::new(server, replacement, true).await?;

            for path in super::json::expand_match_path(&json, &replacement.r#match) {
                let existing = super::json::get_nested_value(&json, &path);
                let existing_is_string = existing.is_some_and(serde_json::Value::is_string);
                let existing = existing.map(super::json::value_to_text);

                let Some(gate) = resolved.gate(existing.as_deref()) else {
                    continue;
                };

                super::json::set_nested_value(
                    &mut json,
                    &path,
                    super::json::coerce_value(
                        replacement,
                        &resolved.value,
                        gate,
                        existing_is_string,
                    ),
                    resolved.insert_new,
                    resolved.update_existing,
                );
            }
        }

        Ok(serde_norway::to_string(&json)?.into_bytes())
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
                file: "config.yml".into(),
                create_new: true,
                parser: ServerConfigurationFileParser::Yaml,
                replace,
            };
            let bytes = YamlFileParser::process_file(content, &config, &server)
                .await
                .unwrap();
            serde_norway::from_str(&String::from_utf8(bytes).unwrap()).unwrap()
        })
    }

    // YamlFileParser

    #[test]
    fn empty_content_starts_from_mapping() {
        assert_eq!(
            run("", vec![rep("server.port", json!(25565), None, true)]),
            json!({"server": {"port": 25565}})
        );
    }

    #[test]
    fn string_values_coerce_when_parseable() {
        let out = run(
            "",
            vec![
                rep("a", json!("true"), None, true),
                rep("b", json!("42"), None, true),
                rep("c", json!("text"), None, true),
            ],
        );
        assert_eq!(out, json!({"a": true, "b": 42, "c": "text"}));
    }

    #[test]
    fn updates_existing_mapping() {
        assert_eq!(
            run("name: old\n", vec![rep("name", json!("new"), None, true)]),
            json!({"name": "new"})
        );
    }

    #[test]
    fn respects_flags() {
        assert_eq!(
            run("a: 1\n", vec![rep("a", json!(2), None, false)]),
            json!({"a": 1})
        );
        assert_eq!(
            run("a: 1\n", vec![rep("b", json!(2), Some(false), true)]),
            json!({"a": 1})
        );
    }

    #[test]
    fn preserves_unrelated_keys() {
        assert_eq!(
            run("keep: 1\n", vec![rep("add", json!(2), None, true)]),
            json!({"keep": 1, "add": 2})
        );
    }

    #[test]
    fn wildcard_updates_every_listener() {
        let out = run(
            "listeners:\n  one:\n    host: 0.0.0.0\n  two:\n    host: 0.0.0.0\n",
            vec![rep("listeners.*.host", json!("10.0.0.1"), None, true)],
        );
        assert_eq!(
            out,
            json!({"listeners": {"one": {"host": "10.0.0.1"}, "two": {"host": "10.0.0.1"}}})
        );
    }

    #[test]
    fn if_value_gates_the_replacement() {
        let out = run(
            "host: 0.0.0.0\nother: 1.2.3.4\n",
            vec![
                gated("host", json!("10.0.0.1"), "0.0.0.0"),
                gated("other", json!("10.0.0.1"), "0.0.0.0"),
            ],
        );
        assert_eq!(out, json!({"host": "10.0.0.1", "other": "1.2.3.4"}));
    }

    #[test]
    fn regex_if_value_substitutes_within_the_existing_value() {
        let out = run(
            "url: http://127.0.0.1:8080/api\n",
            vec![gated("url", json!("10.0.0.1"), r"regex:127\.0\.0\.1")],
        );
        assert_eq!(out, json!({"url": "http://10.0.0.1:8080/api"}));
    }
}
