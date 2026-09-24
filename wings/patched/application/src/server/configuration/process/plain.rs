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

        let mut replacements = Vec::with_capacity(config.replace.len());
        for replacement in &config.replace {
            replacements.push(super::ResolvedReplacement::new(server, replacement, false).await?);
        }

        let mut result = String::new();
        let mut found_matches = HashSet::new();

        for line in content.lines() {
            let mut replaced = false;

            for resolved in &replacements {
                if !line.starts_with(&*resolved.replacement.r#match) {
                    continue;
                }

                if let Some(value) = resolved.text(Some(line)) {
                    writeln!(result, "{}", value)?;
                    replaced = true;
                }
                found_matches.insert(&resolved.replacement.r#match);

                break;
            }

            if !replaced {
                writeln!(result, "{}", line)?;
            }
        }

        for resolved in &replacements {
            if found_matches.contains(&resolved.replacement.r#match) {
                continue;
            }

            let Some(value) = resolved.text(None) else {
                continue;
            };

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

    #[test]
    fn if_value_gates_on_the_whole_line() {
        assert_eq!(
            run("foo bar\n", vec![gated("foo", json!("NEW"), "foo bar")]),
            "NEW\n"
        );
        assert_eq!(
            run("foo baz\n", vec![gated("foo", json!("NEW"), "foo bar")]),
            "foo baz\n"
        );
    }

    #[test]
    fn regex_if_value_edits_the_line_in_place() {
        assert_eq!(
            run(
                "java -Xmx1024M -jar server.jar\n",
                vec![gated("java", json!("-Xmx2048M"), r"regex:-Xmx\d+M")],
            ),
            "java -Xmx2048M -jar server.jar\n"
        );
    }
}
