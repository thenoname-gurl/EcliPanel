use super::ServerConfigurationFile;

const MAX_NESTING_DEPTH: usize = 256;

fn check_nesting_depth(content: &str) -> Result<(), anyhow::Error> {
    let mut reader = xml::reader::EventReader::new(content.as_bytes());
    let mut depth = 0;

    loop {
        match reader.next() {
            Ok(xml::reader::XmlEvent::StartElement { .. }) => {
                depth += 1;

                if depth > MAX_NESTING_DEPTH {
                    return Err(anyhow::anyhow!(
                        "xml nesting exceeds the maximum depth of {MAX_NESTING_DEPTH}"
                    ));
                }
            }
            Ok(xml::reader::XmlEvent::EndElement { .. }) => depth = depth.saturating_sub(1),
            Ok(xml::reader::XmlEvent::EndDocument) => break,
            Err(_) => break,
            _ => {}
        }
    }

    Ok(())
}

pub struct XmlFileParser;

#[async_trait::async_trait]
impl super::ProcessConfigurationFileParser for XmlFileParser {
    async fn process_file(
        content: &str,
        config: &ServerConfigurationFile,
        server: &crate::server::Server,
    ) -> Result<Vec<u8>, anyhow::Error> {
        tracing::debug!(
            server = %server.uuid,
            "processing xml file"
        );

        let content = if content.trim().is_empty() {
            r#"<?xml version="1.0" encoding="UTF-8"?><root></root>"#
        } else {
            content
        };

        check_nesting_depth(content)?;

        let mut root = xmltree::Element::parse(content.as_bytes())?;

        for replacement in &config.replace {
            let resolved = super::ResolvedReplacement::new(server, replacement, true).await?;

            let path = replacement.r#match.replace('.', "/");
            let path_parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();

            if path.contains('*') {
                update_xml_wildcard(&mut root, &path_parts, &resolved);
            } else {
                update_xml_element(&mut root, &path_parts, &resolved);
            }
        }

        let mut result = Vec::new();
        root.write_with_config(
            &mut result,
            xmltree::EmitterConfig::new()
                .perform_indent(true)
                .indent_string("  "),
        )?;

        Ok(result)
    }
}

fn element_text(element: &xmltree::Element) -> compact_str::CompactString {
    element.get_text().unwrap_or_default().as_ref().into()
}

fn write_xml_leaf(
    element: &mut xmltree::Element,
    resolved: &super::ResolvedReplacement<'_>,
    exists: bool,
) -> bool {
    if let Some(attr_assignment) = resolved.value.strip_prefix('@') {
        let Some((attr_name, attr_val)) = attr_assignment.split_once('=') else {
            return false;
        };

        let existing = exists
            .then(|| element.attributes.get(attr_name).cloned())
            .flatten();
        let Some(value) = resolved.text_with(existing.as_deref(), attr_val) else {
            return false;
        };

        element
            .attributes
            .insert(attr_name.to_string(), value.to_string());

        return true;
    }

    let existing = exists.then(|| element_text(element));
    let Some(value) = resolved.text(existing.as_deref()) else {
        return false;
    };

    element.children.clear();
    element
        .children
        .push(xmltree::XMLNode::Text(value.to_string()));

    true
}

fn apply_xml_leaf(
    element: &mut xmltree::Element,
    tag: &str,
    resolved: &super::ResolvedReplacement<'_>,
) -> bool {
    if let Some(child) = element.get_mut_child(tag) {
        return write_xml_leaf(child, resolved, true);
    }

    let mut new_child = xmltree::Element::new(tag);
    if !write_xml_leaf(&mut new_child, resolved, false) {
        return false;
    }

    element.children.push(xmltree::XMLNode::Element(new_child));

    true
}

fn build_xml_chain(
    path: &[&str],
    resolved: &super::ResolvedReplacement<'_>,
) -> Option<xmltree::Element> {
    let (&last, parents) = path.split_last()?;
    let (&deepest_tag, ancestors) = parents.split_last()?;

    let mut current = xmltree::Element::new(deepest_tag);
    if !apply_xml_leaf(&mut current, last, resolved) {
        return None;
    }

    for &tag in ancestors.iter().rev() {
        let mut parent = xmltree::Element::new(tag);
        parent.children.push(xmltree::XMLNode::Element(current));
        current = parent;
    }

    Some(current)
}

fn update_xml_element(
    element: &mut xmltree::Element,
    path: &[&str],
    resolved: &super::ResolvedReplacement<'_>,
) {
    let mut element = element;
    let mut path = path;

    loop {
        let (Some(&tag), Some(path_slice)) = (path.first(), path.get(1..)) else {
            return;
        };

        if path.len() == 1 {
            apply_xml_leaf(element, tag, resolved);
            return;
        }

        if element.get_mut_child(tag).is_none() {
            if resolved.insert_new
                && let Some(new_child) = build_xml_chain(path, resolved)
            {
                element.children.push(xmltree::XMLNode::Element(new_child));
            }
            return;
        }

        let Some(child) = element.get_mut_child(tag) else {
            return;
        };

        element = child;
        path = path_slice;
    }
}

fn update_xml_wildcard(
    element: &mut xmltree::Element,
    path: &[&str],
    resolved: &super::ResolvedReplacement<'_>,
) {
    let mut stack: Vec<(&mut xmltree::Element, &[&str])> = vec![(element, path)];

    while let Some((element, path)) = stack.pop() {
        let Some((&tag, rest)) = path.split_first() else {
            continue;
        };
        let is_leaf = rest.is_empty();

        let found_match = element.children.iter().any(
            |child| matches!(child, xmltree::XMLNode::Element(e) if tag == "*" || e.name == tag),
        );

        if !found_match {
            if tag == "*" || !resolved.insert_new {
                continue;
            }

            let mut new_child = xmltree::Element::new(tag);

            if is_leaf {
                if write_xml_leaf(&mut new_child, resolved, false) {
                    element.children.push(xmltree::XMLNode::Element(new_child));
                }

                continue;
            }

            element.children.push(xmltree::XMLNode::Element(new_child));
        }

        for child in &mut element.children {
            let xmltree::XMLNode::Element(child_elem) = child else {
                continue;
            };

            if tag != "*" && child_elem.name != tag {
                continue;
            }

            if is_leaf {
                write_xml_leaf(child_elem, resolved, true);
            } else {
                stack.push((child_elem, rest));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{super::*, *};
    use serde_json::json;

    // check_nesting_depth

    fn nested(depth: usize) -> String {
        let mut xml = String::new();
        for _ in 0..depth {
            xml.push_str("<a>");
        }
        for _ in 0..depth {
            xml.push_str("</a>");
        }

        xml
    }

    #[test]
    fn depth_accepts_ordinary_configs() {
        assert!(check_nesting_depth("<root><a><b>x</b></a></root>").is_ok());
        assert!(check_nesting_depth(&nested(MAX_NESTING_DEPTH)).is_ok());
    }

    #[test]
    fn depth_rejects_beyond_the_limit() {
        assert!(check_nesting_depth(&nested(MAX_NESTING_DEPTH + 1)).is_err());
    }

    #[test]
    fn depth_rejects_the_unclosed_overflow_payload() {
        // the exploit shape: unclosed elements, ~5KiB is enough to abort the process unguarded
        let mut xml = String::new();
        for _ in 0..5000 {
            xml.push_str("<a>");
        }

        assert!(check_nesting_depth(&xml).is_err());
    }

    #[test]
    fn depth_counts_siblings_separately_from_nesting() {
        let mut xml = String::from("<root>");
        for _ in 0..(MAX_NESTING_DEPTH * 4) {
            xml.push_str("<a>x</a>");
        }
        xml.push_str("</root>");

        assert!(check_nesting_depth(&xml).is_ok());
    }

    #[test]
    fn depth_leaves_malformed_content_to_the_parser() {
        // not our error to report - shallow enough to parse, xmltree gives the real message
        assert!(check_nesting_depth("<a></b>").is_ok());
        assert!(check_nesting_depth("not xml at all").is_ok());
    }

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

    fn run(content: &str, replace: Vec<ServerConfigurationFileReplacement>) -> xmltree::Element {
        tokio_test::block_on(async {
            let state = crate::routes::AppState::mock();
            let server = crate::server::Server::mock(uuid::Uuid::new_v4(), state);
            let config = ServerConfigurationFile {
                file: "config.xml".into(),
                create_new: true,
                parser: ServerConfigurationFileParser::Xml,
                replace,
            };
            let bytes = XmlFileParser::process_file(content, &config, &server)
                .await
                .unwrap();
            xmltree::Element::parse(bytes.as_slice()).unwrap()
        })
    }

    fn text<'a>(el: &'a xmltree::Element, child: &str) -> Option<String> {
        el.get_child(child)
            .and_then(|c| c.get_text())
            .map(|c| c.into_owned())
    }

    // XmlFileParser

    #[test]
    fn updates_element_text() {
        let root = run(
            "<server><port>25565</port></server>",
            vec![rep("port", json!("25577"), None, true)],
        );
        assert_eq!(text(&root, "port").as_deref(), Some("25577"));
    }

    #[test]
    fn inserts_missing_child() {
        let root = run(
            "<server></server>",
            vec![rep("motd", json!("Hello"), Some(true), true)],
        );
        assert_eq!(text(&root, "motd").as_deref(), Some("Hello"));
    }

    #[test]
    fn sets_attribute_with_at_syntax() {
        let root = run(
            "<server></server>",
            vec![rep("feature", json!("@enabled=true"), Some(true), true)],
        );
        let feature = root.get_child("feature").unwrap();
        assert_eq!(
            feature.attributes.get("enabled").map(String::as_str),
            Some("true")
        );
    }

    #[test]
    fn creates_nested_chain() {
        let root = run(
            "<server></server>",
            vec![rep("db.host", json!("localhost"), Some(true), true)],
        );
        let db = root.get_child("db").unwrap();
        assert_eq!(
            db.get_child("host")
                .and_then(|h| h.get_text())
                .map(|c| c.into_owned())
                .as_deref(),
            Some("localhost")
        );
    }

    #[test]
    fn update_existing_false_keeps_text() {
        let root = run(
            "<server><port>1</port></server>",
            vec![rep("port", json!("2"), Some(false), false)],
        );
        assert_eq!(text(&root, "port").as_deref(), Some("1"));
    }

    #[test]
    fn wildcard_updates_matching_leaves() {
        let root = run(
            "<servers><server><motd>a</motd></server><server><motd>b</motd></server></servers>",
            vec![rep("*.motd", json!("z"), None, true)],
        );
        for node in &root.children {
            if let xmltree::XMLNode::Element(server) = node {
                assert_eq!(
                    server
                        .get_child("motd")
                        .and_then(|m| m.get_text())
                        .map(|c| c.into_owned())
                        .as_deref(),
                    Some("z")
                );
            }
        }
    }

    #[test]
    fn if_value_gates_element_text() {
        let root = run(
            "<server><host>0.0.0.0</host><other>1.2.3.4</other></server>",
            vec![
                gated("host", json!("10.0.0.1"), "0.0.0.0"),
                gated("other", json!("10.0.0.1"), "0.0.0.0"),
            ],
        );
        assert_eq!(
            root.get_child("host").unwrap().get_text().unwrap(),
            "10.0.0.1"
        );
        assert_eq!(
            root.get_child("other").unwrap().get_text().unwrap(),
            "1.2.3.4"
        );
    }

    #[test]
    fn if_value_blocks_creating_the_ancestor_chain() {
        let root = run(
            "<server></server>",
            vec![gated("a.b.c", json!("x"), "something")],
        );
        assert!(root.get_child("a").is_none());
    }

    #[test]
    fn if_value_gates_on_the_attribute_not_the_element_text() {
        let root = run(
            "<server><bind enabled=\"false\">text</bind></server>",
            vec![gated("bind", json!("@enabled=true"), "false")],
        );
        let bind = root.get_child("bind").unwrap();
        assert_eq!(
            bind.attributes.get("enabled").map(String::as_str),
            Some("true")
        );
        assert_eq!(bind.get_text().unwrap(), "text");
    }

    #[test]
    fn wildcard_sets_attributes_on_matching_leaves() {
        let root = run(
            "<server><l><a p=\"0\"/><b p=\"0\"/></l></server>",
            vec![rep("l.*", json!("@p=1"), None, true)],
        );
        let l = root.get_child("l").unwrap();
        assert_eq!(
            l.get_child("a")
                .unwrap()
                .attributes
                .get("p")
                .map(String::as_str),
            Some("1")
        );
        assert_eq!(
            l.get_child("b")
                .unwrap()
                .attributes
                .get("p")
                .map(String::as_str),
            Some("1")
        );
    }
}
