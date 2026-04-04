use once_cell::sync::Lazy;
use regex::Regex;

static TCPDUMP_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"IP (\d{1,3}(?:\.\d{1,3}){3})\.(\d+) > (\d{1,3}(?:\.\d{1,3}){3})\.(\d+):")
        .expect("invalid tcpdump regex")
});

pub fn parse_tcpdump_line(line: &str) -> Option<(String, u16, String, u16)> {
    let caps = TCPDUMP_RE.captures(line)?;
    let src_ip = caps.get(1)?.as_str().to_string();
    let src_port = caps.get(2)?.as_str().parse::<u16>().ok()?;
    let dest_ip = caps.get(3)?.as_str().to_string();
    let dest_port = caps.get(4)?.as_str().parse::<u16>().ok()?;
    Some((src_ip, src_port, dest_ip, dest_port))
}