use super::ServerConfigurationFile;
use std::{collections::HashSet, io::BufRead};

pub struct PropertiesFileParser;

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for PropertiesFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(
            server = %server.uuid,
            "processing properties file"
        );

        let mut result = Vec::new();
        let property_iter = PropertiesParser::new(content.as_bytes());
        let mut found_keys = HashSet::new();

        for line in property_iter {
            match line {
                PropertyLine::Comment(comment) => {
                    result.extend_from_slice(comment.as_bytes());
                    result.extend_from_slice(b"\n");
                }
                PropertyLine::Pair(key, mut existing_value) => {
                    for replacement in &config.replace {
                        if replacement.r#match != key || !replacement.update_existing {
                            continue;
                        }

                        let value = ServerConfigurationFile::replace_all_placeholders(
                            server,
                            &replacement.replace_with,
                        )
                        .await?;

                        if let Some(if_value) = &replacement.if_value
                            && existing_value != if_value
                        {
                            tracing::debug!(
                                server = %server.uuid,
                                "skipping replacement for '{}': value '{}' != '{}'",
                                replacement.r#match, existing_value, if_value
                            );
                            continue;
                        }

                        existing_value = value;
                    }

                    result.extend_from_slice(key.as_bytes());
                    result.extend_from_slice(b"=");
                    result.extend_from_slice(quote_to_ascii(&existing_value).as_bytes());
                    result.extend_from_slice(b"\n");
                    found_keys.insert(key);
                }
                PropertyLine::Blank => {
                    result.extend_from_slice(b"\n");
                }
                PropertyLine::Raw(raw) => {
                    tracing::debug!(
                        server = %server.uuid,
                        line = %raw,
                        "encountered raw line in properties file, preserving as-is",
                    );

                    result.extend_from_slice(raw.as_bytes());
                    result.extend_from_slice(b"\n");
                }
                PropertyLine::Error(err) => {
                    return Err(err.into());
                }
            }
        }

        for replacement in &config.replace {
            let insert_new = replacement.insert_new.unwrap_or(true);
            if found_keys.contains(&replacement.r#match) || !insert_new {
                continue;
            }

            let value = ServerConfigurationFile::replace_all_placeholders(
                server,
                &replacement.replace_with,
            )
            .await?;

            result.extend_from_slice(replacement.r#match.as_bytes());
            result.extend_from_slice(b"=");
            result.extend_from_slice(quote_to_ascii(&value).as_bytes());
            result.extend_from_slice(b"\n");
        }

        Ok(result)
    }
}

fn quote_to_ascii(s: &str) -> String {
    let mut out = String::with_capacity(s.len());

    for c in s.chars() {
        match c {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '\x08' => out.push_str("\\b"),
            '\x0C' => out.push_str("\\f"),
            '\x07' => out.push_str("\\a"),
            '\x0B' => out.push_str("\\v"),
            ' '..='~' => out.push(c),
            _ => {
                let cp = c as u32;
                if cp < 128 {
                    out.push_str(&format!("\\x{:02x}", cp));
                } else if cp < 0x10000 {
                    out.push_str(&format!("\\u{:04x}", cp));
                } else {
                    out.push_str(&format!("\\U{:08x}", cp));
                }
            }
        }
    }

    out
}

pub enum PropertyLine {
    Pair(compact_str::CompactString, compact_str::CompactString),
    Comment(compact_str::CompactString),
    Blank,
    Raw(compact_str::CompactString),
    Error(std::io::Error),
}

pub struct PropertiesParser<R: std::io::Read> {
    lines: std::iter::Peekable<std::io::Lines<std::io::BufReader<R>>>,
}

impl<R: std::io::Read> PropertiesParser<R> {
    pub fn new(reader: R) -> Self {
        Self {
            lines: std::io::BufReader::new(reader).lines().peekable(),
        }
    }

    fn is_continuation(line: &str) -> bool {
        let mut backslashes = 0;
        for c in line.chars().rev() {
            if c == '\\' {
                backslashes += 1;
            } else {
                break;
            }
        }
        backslashes % 2 == 1
    }

    fn unescape(input: &str) -> Option<compact_str::CompactString> {
        let mut output = compact_str::CompactString::with_capacity(input.len());
        let mut chars = input.chars().peekable();

        while let Some(c) = chars.next() {
            if c == '\\' {
                match chars.next() {
                    Some('u') => {
                        let mut hex_chars = String::new();
                        for _ in 0..4 {
                            {
                                let h = chars.next()?;
                                hex_chars.push(h)
                            }
                        }

                        match u32::from_str_radix(&hex_chars, 16) {
                            Ok(code) => {
                                let u_char = std::char::from_u32(code)?;
                                output.push(u_char)
                            }
                            Err(_) => return None,
                        }
                    }
                    Some('n') => output.push('\n'),
                    Some('r') => output.push('\r'),
                    Some('t') => output.push('\t'),
                    Some('f') => output.push('\x0c'),
                    Some('\\') => output.push('\\'),
                    Some('"') => output.push('"'),
                    Some('\'') => output.push('\''),
                    Some(' ') => output.push(' '),
                    Some(':') => output.push(':'),
                    Some('=') => output.push('='),
                    Some(other) => output.push(other),
                    None => output.push('\\'),
                }
            } else {
                output.push(c);
            }
        }
        Some(output)
    }
}

impl<R: std::io::Read> Iterator for PropertiesParser<R> {
    type Item = PropertyLine;

    fn next(&mut self) -> Option<Self::Item> {
        let mut logical_line = String::new();
        let mut raw_accumulator = String::new();

        let first_line = match self.lines.next() {
            Some(Ok(l)) => l,
            Some(Err(e)) => return Some(PropertyLine::Error(e)),
            None => return None,
        };

        logical_line.push_str(&first_line);
        raw_accumulator.push_str(&first_line);

        while Self::is_continuation(&logical_line) {
            logical_line.pop();

            match self.lines.peek() {
                Some(Ok(_)) => {
                    if let Some(Ok(next_line)) = self.lines.next() {
                        raw_accumulator.push('\n');
                        raw_accumulator.push_str(&next_line);

                        let trimmed = next_line.trim_start();
                        logical_line.push_str(trimmed);
                    }
                }
                Some(Err(_)) => break,
                None => break,
            }
        }

        let trimmed_logical = logical_line.trim_start();

        if trimmed_logical.is_empty() {
            return Some(PropertyLine::Blank);
        }

        if trimmed_logical.starts_with('#') || trimmed_logical.starts_with('!') {
            return Some(PropertyLine::Comment(compact_str::CompactString::from(
                raw_accumulator,
            )));
        }

        let mut key_end_idx = 0;
        let mut sep_len = 0;
        let mut chars = trimmed_logical.char_indices().peekable();
        let mut found_sep = false;

        while let Some((idx, c)) = chars.next() {
            if c == '\\' {
                chars.next();
                continue;
            }

            if c == '=' || c == ':' || c.is_whitespace() {
                key_end_idx = idx;
                found_sep = true;
                sep_len = 1;

                if c.is_whitespace() {
                    while let Some((_, next_c)) = chars.peek() {
                        if *next_c != '=' && *next_c != ':' && !next_c.is_whitespace() {
                            break;
                        }

                        let is_strict_char = *next_c == '=' || *next_c == ':';
                        chars.next();
                        sep_len += 1;

                        if is_strict_char {
                            while let Some((_, next_after)) = chars.peek() {
                                if !next_after.is_whitespace() {
                                    break;
                                }
                                chars.next();
                                sep_len += 1;
                            }
                            break;
                        }
                    }
                } else {
                    while let Some((_, next_c)) = chars.peek() {
                        if !next_c.is_whitespace() {
                            break;
                        }
                        chars.next();
                        sep_len += 1;
                    }
                }
                break;
            }
        }

        if !found_sep {
            key_end_idx = trimmed_logical.len();
        }

        let key_raw = trimmed_logical.get(..key_end_idx).unwrap_or("");
        let val_raw = trimmed_logical
            .get(key_end_idx.saturating_add(sep_len)..)
            .unwrap_or("");

        match (Self::unescape(key_raw), Self::unescape(val_raw)) {
            (Some(k), Some(v)) => Some(PropertyLine::Pair(k, v)),
            _ => Some(PropertyLine::Raw(compact_str::CompactString::from(
                raw_accumulator,
            ))),
        }
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

    fn rep_if(
        m: &str,
        value: serde_json::Value,
        if_value: &str,
        update_existing: bool,
    ) -> ServerConfigurationFileReplacement {
        ServerConfigurationFileReplacement {
            r#match: m.into(),
            if_value: Some(if_value.into()),
            insert_new: None,
            update_existing,
            replace_with: value,
        }
    }

    fn run(content: &str, replace: Vec<ServerConfigurationFileReplacement>) -> String {
        tokio_test::block_on(async {
            let state = crate::routes::AppState::mock();
            let server = crate::server::Server::mock(uuid::Uuid::new_v4(), state);
            let config = ServerConfigurationFile {
                file: "server.properties".into(),
                create_new: true,
                parser: ServerConfigurationFileParser::Properties,
                replace,
            };
            let bytes = PropertiesFileParser::process_file(content, &config, &server)
                .await
                .unwrap();
            String::from_utf8(bytes).unwrap()
        })
    }

    fn lines(content: &str) -> Vec<String> {
        PropertiesParser::new(content.as_bytes())
            .map(|l| match l {
                PropertyLine::Pair(k, v) => format!("P {k}={v}"),
                PropertyLine::Comment(c) => format!("C {c}"),
                PropertyLine::Blank => "B".to_string(),
                PropertyLine::Raw(r) => format!("R {r}"),
                PropertyLine::Error(_) => "E".to_string(),
            })
            .collect()
    }

    // PropertiesParser

    #[test]
    fn parses_each_separator_form() {
        assert_eq!(lines("a=b"), ["P a=b"]);
        assert_eq!(lines("a:b"), ["P a=b"]);
        assert_eq!(lines("a b"), ["P a=b"]);
        assert_eq!(lines("a = b"), ["P a=b"]);
        assert_eq!(lines("key   =   value"), ["P key=value"]);
    }

    #[test]
    fn classifies_comments_and_blanks() {
        assert_eq!(lines("# c"), ["C # c"]);
        assert_eq!(lines("! c"), ["C ! c"]);
        assert_eq!(lines("\n"), ["B"]);
        assert_eq!(lines("   "), ["B"]);
    }

    #[test]
    fn joins_line_continuations() {
        assert_eq!(lines("a=b\\\nc"), ["P a=bc"]);
    }

    #[test]
    fn unescapes_values() {
        assert_eq!(lines("a=\\u00e9"), ["P a=\u{00e9}"]);
        assert_eq!(lines("a=x\\ty"), ["P a=x\ty"]);
    }

    // quote_to_ascii

    #[test]
    fn quote_to_ascii_escapes_specials_and_unicode() {
        assert_eq!(quote_to_ascii("plain text"), "plain text");
        assert_eq!(quote_to_ascii("a\"b\\c"), "a\\\"b\\\\c");
        assert_eq!(quote_to_ascii("x\ny\tz"), "x\\ny\\tz");
        assert_eq!(quote_to_ascii("caf\u{00e9}"), "caf\\u00e9");
        // astral plane (e.g. an emoji in a MOTD) uses \U with 8 hex digits
        assert_eq!(quote_to_ascii("\u{1F3AE}"), "\\U0001f3ae");
    }

    // PropertiesFileParser

    #[test]
    fn replaces_existing_value() {
        assert_eq!(
            run(
                "max-players=20\n",
                vec![rep("max-players", json!("100"), None, true)]
            ),
            "max-players=100\n"
        );
    }

    #[test]
    fn if_value_gates_replacement() {
        // current value does not match the guard, so nothing changes
        assert_eq!(
            run(
                "difficulty=easy\n",
                vec![rep_if("difficulty", json!("peaceful"), "hard", true)]
            ),
            "difficulty=easy\n"
        );
        // guard matches, replacement applies
        assert_eq!(
            run(
                "difficulty=easy\n",
                vec![rep_if("difficulty", json!("peaceful"), "easy", true)]
            ),
            "difficulty=peaceful\n"
        );
    }

    #[test]
    fn appends_missing_keys() {
        assert_eq!(
            run("a=1\n", vec![rep("b", json!("2"), None, true)]),
            "a=1\nb=2\n"
        );
    }

    #[test]
    fn update_existing_false_keeps_value_and_skips_append() {
        assert_eq!(
            run("a=1\n", vec![rep("a", json!("2"), Some(true), false)]),
            "a=1\n"
        );
    }

    #[test]
    fn normalizes_pair_spacing_but_keeps_comments() {
        assert_eq!(run("# note\na = 1\n", vec![]), "# note\na=1\n");
    }

    #[test]
    fn round_trips_unicode_through_escapes() {
        // value is decoded on read and re-encoded canonically on write
        assert_eq!(run("motd=Caf\\u00e9\n", vec![]), "motd=Caf\\u00e9\n");
    }
}
