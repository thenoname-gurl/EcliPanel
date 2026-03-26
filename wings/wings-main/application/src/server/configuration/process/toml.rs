use super::ServerConfigurationFile;
use serde::Deserialize;

pub struct TomlFileParser;

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for TomlFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(
            server = %server.uuid,
            "processing toml file"
        );

        let mut toml = if content.trim().is_empty() {
            toml::Value::Table(toml::map::Map::new())
        } else {
            toml::from_str(content).unwrap_or_else(|_| toml::Value::Table(toml::map::Map::new()))
        };

        for replacement in &config.replace {
            let value = match &replacement.replace_with {
                serde_json::Value::String(_) => {
                    let resolved = ServerConfigurationFile::replace_all_placeholders(
                        server,
                        &replacement.replace_with,
                    )
                    .await?;

                    toml::de::ValueDeserializer::parse(&resolved).map_or_else(
                        |_| toml::Value::String(resolved.to_string()),
                        |v| {
                            toml::Value::deserialize(v)
                                .unwrap_or_else(|_| toml::Value::String(resolved.to_string()))
                        },
                    )
                }
                other => toml::Value::try_from(other.clone())
                    .unwrap_or_else(|_| toml::Value::String(other.to_string())),
            };

            let path: Vec<&str> = replacement.r#match.split('.').collect();
            set_nested_value(
                &mut toml,
                &path,
                value,
                replacement.insert_new.unwrap_or(true),
                replacement.update_existing,
            );
        }

        Ok(toml::to_string_pretty(&toml)?.into_bytes())
    }
}

pub fn set_nested_value(
    toml: &mut toml::Value,
    path: &[&str],
    value: toml::Value,
    insert_new: bool,
    update_existing: bool,
) {
    if path.is_empty() {
        return;
    }

    if !toml.is_table() {
        *toml = toml::Value::Table(toml::map::Map::new());
    }

    let map = toml.as_table_mut().unwrap();

    if path.len() == 1 {
        let key = path[0].to_string();
        let exists = map.contains_key(&key);

        if (exists && update_existing) || (!exists && insert_new) {
            map.insert(key, value);
        }
        return;
    }

    let child = map
        .entry(path[0].to_string())
        .or_insert_with(|| toml::Value::Table(toml::map::Map::new()));

    set_nested_value(child, &path[1..], value, insert_new, update_existing);
}
