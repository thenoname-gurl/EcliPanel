use super::ServerConfigurationFile;
use compact_str::ToCompactString;

pub struct IniFileParser;

struct PendingReplacement<'a> {
    section: Option<compact_str::CompactString>,
    key: compact_str::CompactString,
    resolved: super::ResolvedReplacement<'a>,
    insert_value: Option<compact_str::CompactString>,
    applied: bool,
}

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for IniFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(
            server = %server.uuid,
            "processing ini file"
        );

        let mut pending: Vec<PendingReplacement> = Vec::with_capacity(config.replace.len());
        for replacement in &config.replace {
            let resolved = super::ResolvedReplacement::new(server, replacement, true).await?;
            let insert_value = resolved.text(None);

            let (section, key) = parse_ini_path(&replacement.r#match);
            pending.push(PendingReplacement {
                section: if section.is_empty() {
                    None
                } else {
                    Some(section)
                },
                key,
                resolved,
                insert_value,
                applied: false,
            });
        }

        let newline = if content.contains("\r\n") {
            "\r\n"
        } else {
            "\n"
        };
        let mut out = String::with_capacity(content.len() + 64);
        let mut current_section = None;

        for item in ini_roundtrip::Parser::new(content) {
            match item {
                ini_roundtrip::Item::SectionEnd => {
                    for p in pending.iter_mut() {
                        if !p.applied
                            && p.section == current_section
                            && let Some(value) = &p.insert_value
                        {
                            out.push_str(&p.key);
                            out.push('=');
                            out.push_str(value);
                            out.push_str(newline);
                            p.applied = true;
                        }
                    }
                }
                ini_roundtrip::Item::Section { name, raw } => {
                    current_section = Some(name.to_compact_string());
                    out.push_str(raw);
                    out.push_str(newline);
                }
                ini_roundtrip::Item::Property { key, val, raw } => {
                    let matched = pending
                        .iter_mut()
                        .find(|p| !p.applied && p.section == current_section && p.key == key);

                    match matched {
                        Some(p) => {
                            p.applied = true;
                            let existing = strip_inline_comment(val.unwrap_or_default().trim());

                            match p.resolved.text(Some(existing)) {
                                Some(value) => {
                                    out.push_str(&rewrite_property(raw, key, &value));
                                }
                                None => out.push_str(raw),
                            }
                            out.push_str(newline);
                        }
                        None => {
                            out.push_str(raw);
                            out.push_str(newline);
                        }
                    }
                }
                ini_roundtrip::Item::Comment { raw }
                | ini_roundtrip::Item::Blank { raw }
                | ini_roundtrip::Item::Error(raw) => {
                    out.push_str(raw);
                    out.push_str(newline);
                }
            }
        }

        let mut seen_sections: Vec<&str> = Vec::new();
        for p in &pending {
            if let (false, Some(_), Some(section)) =
                (p.applied, p.insert_value.as_ref(), p.section.as_deref())
                && !seen_sections.contains(&section)
            {
                seen_sections.push(section);
            }
        }

        for section in seen_sections {
            if !out.is_empty() {
                out.push_str(newline);
            }
            out.push('[');
            out.push_str(section);
            out.push(']');
            out.push_str(newline);

            for p in &pending {
                if !p.applied
                    && p.section.as_deref() == Some(section)
                    && let Some(value) = &p.insert_value
                {
                    out.push_str(&p.key);
                    out.push('=');
                    out.push_str(value);
                    out.push_str(newline);
                }
            }
        }

        Ok(out.into_bytes())
    }
}

fn strip_inline_comment(value: &str) -> &str {
    let mut after_whitespace = false;

    for (index, ch) in value.char_indices() {
        if after_whitespace && (ch == ';' || ch == '#') {
            return value.get(..index).unwrap_or(value).trim_end();
        }

        after_whitespace = ch.is_whitespace();
    }

    value
}

fn rewrite_property(raw: &str, key: &str, new_value: &str) -> compact_str::CompactString {
    let Some((before, after)) = raw.split_once('=') else {
        return compact_str::format_compact!("{key}={new_value}");
    };

    let leading_ws = after
        .get(..after.len() - after.trim_start().len())
        .unwrap_or("");

    let mut s = compact_str::CompactString::with_capacity(
        before.len() + 1 + leading_ws.len() + new_value.len(),
    );
    s.push_str(before);
    s.push('=');
    s.push_str(leading_ws);
    s.push_str(new_value);
    s
}

fn parse_ini_path(path: &str) -> (compact_str::CompactString, compact_str::CompactString) {
    let mut section = compact_str::CompactString::default();
    let mut key = compact_str::CompactString::default();
    let mut bracket_depth = 0;
    let mut in_section = true;

    for ch in path.chars() {
        match ch {
            '[' => bracket_depth += 1,
            ']' => bracket_depth -= 1,
            '.' => {
                if bracket_depth > 0 {
                    section.push(ch);
                } else if in_section && !section.is_empty() {
                    in_section = false;
                } else {
                    key.push(ch);
                }
            }
            _ => {
                if in_section {
                    section.push(ch);
                } else {
                    key.push(ch);
                }
            }
        }
    }

    if in_section {
        (compact_str::CompactString::default(), section)
    } else {
        (section, key)
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
                file: "test.ini".into(),
                create_new: true,
                parser: ServerConfigurationFileParser::Ini,
                replace,
            };
            let bytes = IniFileParser::process_file(content, &config, &server)
                .await
                .unwrap();
            String::from_utf8(bytes).unwrap()
        })
    }

    // parse_ini_path

    #[test]
    fn parse_ini_path_splits() {
        assert_eq!(parse_ini_path("key"), ("".into(), "key".into()));
        assert_eq!(parse_ini_path("sec.key"), ("sec".into(), "key".into()));
        // brackets are stripped from the section
        assert_eq!(parse_ini_path("[sec].key"), ("sec".into(), "key".into()));
        // dots inside brackets stay in the section name
        assert_eq!(parse_ini_path("[a.b].key"), ("a.b".into(), "key".into()));
        // only the first unbracketed dot splits; the rest is the key
        assert_eq!(
            parse_ini_path("sec.sub.key"),
            ("sec".into(), "sub.key".into())
        );
    }

    // rewrite_property

    #[test]
    fn rewrite_property_preserves_layout() {
        assert_eq!(rewrite_property("key=old", "key", "new"), "key=new");
        // spacing around '=' is kept, old value and trailing content dropped
        assert_eq!(rewrite_property("  k  =  v ; c", "k", "new"), "  k  =  new");
        // no '=' falls back to a freshly formatted line
        assert_eq!(rewrite_property("noeq", "key", "new"), "key=new");
    }

    // IniFileParser

    #[test]
    fn updates_existing_value() {
        assert_eq!(
            run("[a]\nx=1\n", vec![rep("a.x", json!("9"), None, true)]),
            "[a]\nx=9\n"
        );
    }

    #[test]
    fn update_existing_false_leaves_value_and_skips_insert() {
        assert_eq!(
            run("[a]\nx=1\n", vec![rep("a.x", json!("9"), None, false)]),
            "[a]\nx=1\n"
        );
    }

    #[test]
    fn inserts_into_existing_section() {
        assert_eq!(
            run(
                "[a]\nx=1\n[b]\ny=2\n",
                vec![rep("a.z", json!("3"), Some(true), true)]
            ),
            "[a]\nx=1\nz=3\n[b]\ny=2\n"
        );
    }

    #[test]
    fn creates_missing_section() {
        assert_eq!(
            run("[a]\nx=1\n", vec![rep("b.y", json!("2"), Some(true), true)]),
            "[a]\nx=1\n\n[b]\ny=2\n"
        );
    }

    #[test]
    fn insert_new_false_does_nothing_when_absent() {
        assert_eq!(
            run(
                "[a]\nx=1\n",
                vec![rep("a.z", json!("3"), Some(false), true)]
            ),
            "[a]\nx=1\n"
        );
    }

    #[test]
    fn matches_only_target_section() {
        assert_eq!(
            run(
                "[a]\nx=1\n[b]\nx=1\n",
                vec![rep("b.x", json!("9"), None, true)]
            ),
            "[a]\nx=1\n[b]\nx=9\n"
        );
    }

    #[test]
    fn detects_crlf_newlines() {
        assert_eq!(
            run("[a]\r\nx=1\r\n", vec![rep("a.x", json!("9"), None, true)]),
            "[a]\r\nx=9\r\n"
        );
    }

    #[test]
    fn preserves_comments_and_blanks() {
        assert_eq!(
            run(
                "# hi\n[a]\n\nx=1\n",
                vec![rep("a.x", json!("9"), None, true)]
            ),
            "# hi\n[a]\n\nx=9\n"
        );
    }

    #[test]
    fn sectionless_key_updates_top_level() {
        assert_eq!(
            run("x=1\n", vec![rep("x", json!("9"), None, true)]),
            "x=9\n"
        );
    }

    #[test]
    fn sectionless_insert_goes_above_first_section() {
        assert_eq!(
            run("[a]\nx=1\n", vec![rep("g", json!("1"), Some(true), true)]),
            "g=1\n[a]\nx=1\n"
        );
    }

    #[test]
    fn if_value_gates_on_the_existing_value() {
        let out = run(
            "[net]\nhost=0.0.0.0\nother=1.2.3.4\n",
            vec![
                gated("net.host", json!("10.0.0.1"), "0.0.0.0"),
                gated("net.other", json!("10.0.0.1"), "0.0.0.0"),
            ],
        );
        assert!(out.contains("host=10.0.0.1"), "{out}");
        assert!(out.contains("other=1.2.3.4"), "{out}");
    }

    #[test]
    fn if_value_ignores_an_inline_comment() {
        let out = run(
            "[net]\nhost=0.0.0.0 ; bind address\n",
            vec![gated("net.host", json!("10.0.0.1"), "0.0.0.0")],
        );
        assert!(out.contains("host=10.0.0.1"), "{out}");
    }

    #[test]
    fn if_value_blocks_insertion_of_a_missing_key() {
        let out = run("[net]\n", vec![gated("net.host", json!("x"), "0.0.0.0")]);
        assert!(!out.contains("host"), "{out}");
    }

    #[test]
    fn regex_if_value_substitutes_within_the_existing_value() {
        let out = run(
            "[db]\nurl=mysql://127.0.0.1:3306/x\n",
            vec![gated("db.url", json!("10.0.0.1"), r"regex:127\.0\.0\.1")],
        );
        assert!(out.contains("url=mysql://10.0.0.1:3306/x"), "{out}");
    }
}
