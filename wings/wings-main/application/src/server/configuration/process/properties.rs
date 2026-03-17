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
                            match chars.next() {
                                Some(h) => hex_chars.push(h),
                                None => return None,
                            }
                        }

                        match u32::from_str_radix(&hex_chars, 16) {
                            Ok(code) => match std::char::from_u32(code) {
                                Some(u_char) => output.push(u_char),
                                None => return None,
                            },
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

        let key_raw = &trimmed_logical[..key_end_idx];
        let val_raw = if found_sep && (key_end_idx + sep_len < trimmed_logical.len()) {
            &trimmed_logical[key_end_idx + sep_len..]
        } else {
            ""
        };

        match (Self::unescape(key_raw), Self::unescape(val_raw)) {
            (Some(k), Some(v)) => Some(PropertyLine::Pair(k, v)),
            _ => Some(PropertyLine::Raw(compact_str::CompactString::from(
                raw_accumulator,
            ))),
        }
    }
}
