use super::ServerConfigurationFile;
use std::{collections::HashSet, fmt::Write};

pub struct PlainFileParser;

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for PlainFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(
            server = %server.uuid,
            "processing plain file"
        );

        let mut result = String::new();
        let mut found_matches = HashSet::new();

        for line in content.lines() {
            let mut replaced = false;

            for replacement in &config.replace {
                if !line.starts_with(&*replacement.r#match) {
                    continue;
                }

                let value = ServerConfigurationFile::replace_all_placeholders(
                    server,
                    &replacement.replace_with,
                )
                .await?;

                if replacement.update_existing {
                    writeln!(result, "{}", value)?;
                    replaced = true;
                }
                found_matches.insert(&replacement.r#match);

                break;
            }

            if !replaced {
                writeln!(result, "{}", line)?;
            }
        }

        for replacement in &config.replace {
            let insert_new = replacement.insert_new.unwrap_or(false);

            if found_matches.contains(&replacement.r#match) || !insert_new {
                continue;
            }

            let value = ServerConfigurationFile::replace_all_placeholders(
                server,
                &replacement.replace_with,
            )
            .await?;

            writeln!(result, "{}", value)?;
        }

        Ok(result.into_bytes())
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

    fn run(content: &str, replace: Vec<ServerConfigurationFileReplacement>) -> String {
        tokio_test::block_on(async {
            let state = crate::routes::AppState::mock();
            let server = crate::server::Server::mock(uuid::Uuid::new_v4(), state);
            let config = ServerConfigurationFile {
                file: "config.txt".into(),
                create_new: true,
                parser: ServerConfigurationFileParser::File,
                replace,
            };
            let bytes = PlainFileParser::process_file(content, &config, &server)
                .await
                .unwrap();
            String::from_utf8(bytes).unwrap()
        })
    }

    // PlainFileParser

    #[test]
    fn replaces_whole_line_by_prefix() {
        assert_eq!(
            run("foo bar\nbaz\n", vec![rep("foo", json!("NEW"), None, true)]),
            "NEW\nbaz\n"
        );
    }

    #[test]
    fn update_existing_false_keeps_line() {
        assert_eq!(
            run("foo bar\n", vec![rep("foo", json!("NEW"), None, false)]),
            "foo bar\n"
        );
    }

    #[test]
    fn insert_new_defaults_to_false() {
        // unlike the structured parsers, plain does not append unless told to
        assert_eq!(run("a\n", vec![rep("zzz", json!("x"), None, true)]), "a\n");
        assert_eq!(
            run("a\n", vec![rep("zzz", json!("x"), Some(true), true)]),
            "a\nx\n"
        );
    }

    #[test]
    fn first_matching_replacement_wins() {
        let out = run(
            "hello world\n",
            vec![
                rep("hello", json!("FIRST"), None, true),
                rep("hello", json!("SECOND"), None, true),
            ],
        );
        assert_eq!(out, "FIRST\n");
    }

    #[test]
    fn prefix_is_not_word_anchored() {
        assert_eq!(
            run("abcdef\n", vec![rep("ab", json!("X"), None, true)]),
            "X\n"
        );
    }
}
