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
            let value = match &replacement.replace_with {
                serde_json::Value::String(_) => {
                    let resolved = ServerConfigurationFile::replace_all_placeholders(
                        server,
                        &replacement.replace_with,
                    )
                    .await?;
                    serde_json::from_str(&resolved)
                        .unwrap_or(serde_json::Value::String(resolved.into()))
                }
                other => other.clone(),
            };

            let path = super::json::parse_path(&replacement.r#match);
            super::json::set_nested_value(
                &mut json,
                &path,
                value,
                replacement.insert_new.unwrap_or(true),
                replacement.update_existing,
            );
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
}
