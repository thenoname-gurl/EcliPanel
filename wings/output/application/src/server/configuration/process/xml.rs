use super::ServerConfigurationFile;

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

        let mut root = xmltree::Element::parse(content.as_bytes())?;

        for replacement in &config.replace {
            let value = ServerConfigurationFile::replace_all_placeholders(
                server,
                &replacement.replace_with,
            )
            .await?;

            let path = replacement.r#match.replace('.', "/");
            let path_parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();

            if path.contains('*') {
                update_xml_wildcard(
                    &mut root,
                    &path_parts,
                    &value,
                    replacement.insert_new.unwrap_or(true),
                    replacement.update_existing,
                );
            } else {
                update_xml_element(
                    &mut root,
                    &path_parts,
                    &value,
                    replacement.insert_new.unwrap_or(true),
                    replacement.update_existing,
                );
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

fn apply_xml_leaf(
    element: &mut xmltree::Element,
    tag: &str,
    value: &str,
    insert_new: bool,
    update_existing: bool,
) {
    if let Some(attr_assignment) = value.strip_prefix('@') {
        let Some((attr_name, attr_val)) = attr_assignment.split_once('=') else {
            return;
        };

        if let Some(child) = element.get_mut_child(tag) {
            let exists = child.attributes.contains_key(attr_name);
            if (exists && update_existing) || (!exists && insert_new) {
                child
                    .attributes
                    .insert(attr_name.to_string(), attr_val.to_string());
            }
        } else if insert_new {
            let mut new_child = xmltree::Element::new(tag);
            new_child
                .attributes
                .insert(attr_name.to_string(), attr_val.to_string());
            element.children.push(xmltree::XMLNode::Element(new_child));
        }
        return;
    }

    if let Some(child) = element.get_mut_child(tag) {
        if update_existing {
            child.children.clear();
            child
                .children
                .push(xmltree::XMLNode::Text(value.to_string()));
        }
    } else if insert_new {
        let mut new_child = xmltree::Element::new(tag);
        new_child
            .children
            .push(xmltree::XMLNode::Text(value.to_string()));
        element.children.push(xmltree::XMLNode::Element(new_child));
    }
}

fn build_xml_chain(
    path: &[&str],
    value: &str,
    insert_new: bool,
    update_existing: bool,
) -> Option<xmltree::Element> {
    let (&last, parents) = path.split_last()?;
    let (&deepest_tag, ancestors) = parents.split_last()?;

    let mut current = xmltree::Element::new(deepest_tag);
    apply_xml_leaf(&mut current, last, value, insert_new, update_existing);

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
    value: &str,
    insert_new: bool,
    update_existing: bool,
) {
    let mut element = element;
    let mut path = path;

    loop {
        let (Some(&tag), Some(path_slice)) = (path.first(), path.get(1..)) else {
            return;
        };

        if path.len() == 1 {
            apply_xml_leaf(element, tag, value, insert_new, update_existing);
            return;
        }

        if element.get_mut_child(tag).is_none() {
            if insert_new
                && let Some(new_child) = build_xml_chain(path, value, insert_new, update_existing)
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
    value: &str,
    insert_new: bool,
    update_existing: bool,
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
            if tag != "*" && insert_new {
                let mut new_child = xmltree::Element::new(tag);
                if is_leaf {
                    new_child
                        .children
                        .push(xmltree::XMLNode::Text(value.to_string()));
                }
                element.children.push(xmltree::XMLNode::Element(new_child));
            } else {
                continue;
            }
        }

        for child in &mut element.children {
            let xmltree::XMLNode::Element(child_elem) = child else {
                continue;
            };

            if tag != "*" && child_elem.name != tag {
                continue;
            }

            if is_leaf {
                if update_existing {
                    child_elem.children.clear();
                    child_elem
                        .children
                        .push(xmltree::XMLNode::Text(value.to_string()));
                }
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
}
