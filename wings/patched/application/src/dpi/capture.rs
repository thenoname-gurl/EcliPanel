use std::os::fd::{FromRawFd, OwnedFd};
use std::os::unix::io::AsRawFd;
use std::time::{Duration, Instant};
use std::fs;

fn enter_netns(sandbox_key: &str) -> Option<OwnedFd> {
    let current_ns = fs::File::open("/proc/self/ns/net").ok()?;
    let target_ns = fs::File::open(sandbox_key).ok()?;

    if let Err(e) = nix::sched::setns(
        &target_ns,
        nix::sched::CloneFlags::CLONE_NEWNET,
    ) {
        tracing::warn!("setns({}) failed: {}", sandbox_key, e);
        return None;
    }

    let saved_fd = unsafe { OwnedFd::from_raw_fd(current_ns.as_raw_fd()) };
    std::mem::forget(current_ns);

    Some(saved_fd)
}

fn restore_netns(saved_fd: Option<OwnedFd>) {
    if let Some(fd) = saved_fd {
        let _ = nix::sched::setns(&fd, nix::sched::CloneFlags::CLONE_NEWNET);
    }
}

fn open_raw_socket() -> i32 {
    unsafe {
        libc::socket(
            libc::AF_PACKET,
            libc::SOCK_RAW | libc::SOCK_NONBLOCK,
            (libc::ETH_P_ALL as u16).to_be() as i32,
        )
    }
}

fn set_socket_timeout(fd: i32, timeout: Duration) {
    let tv = libc::timeval {
        tv_sec: timeout.as_secs() as libc::time_t,
        tv_usec: timeout.subsec_micros() as libc::suseconds_t,
    };
    unsafe {
        libc::setsockopt(
            fd,
            libc::SOL_SOCKET,
            libc::SO_RCVTIMEO,
            &tv as *const _ as *const libc::c_void,
            std::mem::size_of::<libc::timeval>() as u32,
        );
    }
}

fn strip_to_ip(frame: &[u8]) -> Option<&[u8]> {
    if frame.len() < 14 { return None; }
    let ethertype = u16::from_be_bytes([frame[12], frame[13]]);

    let ip_start = 14;
    let ip_data = frame.get(ip_start..)?;

    match ethertype {
        0x0800 => {
            let total_len = u16::from_be_bytes([ip_data[2], ip_data[3]]) as usize;
            Some(ip_data.get(..total_len.min(ip_data.len()))?)
        }
        0x86DD => {
            let payload_len = u16::from_be_bytes([ip_data[4], ip_data[5]]) as usize;
            let total = 40 + payload_len;
            Some(ip_data.get(..total.min(ip_data.len()))?)
        }
        _ => None,
    }
}

pub fn capture_sample(sandbox_key: &str, duration: Duration) -> Vec<Vec<u8>> {
    let saved_ns = enter_netns(sandbox_key);
    if saved_ns.is_none() {
        return Vec::new();
    }

    let sock = open_raw_socket();
    if sock < 0 {
        restore_netns(saved_ns);
        return Vec::new();
    }

    set_socket_timeout(sock, Duration::from_secs(1));

    let mut packets = Vec::new();
    let mut buf = vec![0u8; 65535];
    let deadline = Instant::now() + duration;

    while Instant::now() < deadline {
        let n = unsafe {
            libc::recvfrom(
                sock,
                buf.as_mut_ptr() as *mut libc::c_void,
                buf.len(),
                0,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
            )
        };

        if n <= 0 {
            continue;
        }

        let frame = &buf[..n as usize];
        if let Some(ip_pkt) = strip_to_ip(frame) {
            packets.push(ip_pkt.to_vec());
        }

        if packets.len() >= 10000 {
            break;
        }
    }

    unsafe { libc::close(sock) };
    restore_netns(saved_ns);
    packets
}

pub fn get_sandbox_key(
    network_settings: &serde_json::Value,
) -> Option<String> {
    network_settings
        .get("SandboxKey")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn is_tcp_syn(ip_data: &[u8]) -> bool {
    if ip_data.len() < 20 { return false; }
    let ihl = (ip_data[0] & 0x0F) as usize * 4;
    if ip_data.len() < ihl + 20 { return false; }
    ip_data[9] == 6 && ip_data.get(ihl + 13).copied().unwrap_or(0) & 0x02 != 0
}

#[derive(Debug, Clone, Default)]
pub struct PacketProfile {
    pub total: u32,
    pub tcp_syn: u32,
    pub tcp_other: u32,
    pub udp: u32,
    pub icmp: u32,
    pub dns: u32,
    pub http: u32,
    pub ssh: u32,
    pub ntp: u32,
    pub ssdp: u32,
    pub memcached: u32,
}

fn dst_port(pkt: &[u8]) -> u16 {
    let ihl = (pkt[0] & 0x0F) as usize * 4;
    if pkt.len() >= ihl + 4 {
        u16::from_be_bytes([pkt[ihl + 2], pkt[ihl + 3]])
    } else {
        0
    }
}

pub fn analyze_packets(packets: &[Vec<u8>]) -> PacketProfile {
    let mut p = PacketProfile::default();
    for pkt in packets {
        if pkt.len() < 20 { continue; }
        p.total += 1;
        let proto = pkt[9];
        match proto {
            1 => p.icmp += 1,
            6 => {
                if is_tcp_syn(pkt) { p.tcp_syn += 1; } else { p.tcp_other += 1; }
                let dp = dst_port(pkt);
                if dp == 80 || dp == 443 || dp == 8080 || dp == 8443 { p.http += 1; }
                if dp == 22 { p.ssh += 1; }
            }
            17 => {
                p.udp += 1;
                let ihl = (pkt[0] & 0x0F) as usize * 4;
                if pkt.len() >= ihl + 4 {
                    let src = u16::from_be_bytes([pkt[ihl], pkt[ihl + 1]]);
                    let dst = u16::from_be_bytes([pkt[ihl + 2], pkt[ihl + 3]]);
                    if src == 53 || dst == 53 { p.dns += 1; }
                    if src == 123 || dst == 123 { p.ntp += 1; }
                    if src == 1900 || dst == 1900 { p.ssdp += 1; }
                    if src == 11211 || dst == 11211 { p.memcached += 1; }
                }
            }
            _ => {}
        }
    }
    p
}

pub fn extract_connections(packets: &[Vec<u8>]) -> std::collections::HashMap<u32, std::collections::HashSet<u16>> {
    let mut map: std::collections::HashMap<u32, std::collections::HashSet<u16>> = std::collections::HashMap::new();
    for pkt in packets {
        if pkt.len() < 20 { continue; }
        let ihl = (pkt[0] & 0x0F) as usize * 4;
        if pkt.len() < ihl + 4 { continue; }
        let dst_ip = u32::from_be_bytes([pkt[16], pkt[17], pkt[18], pkt[19]]);
        if is_tcp_syn(pkt) {
            let dst_port = u16::from_be_bytes([pkt[ihl], pkt[ihl + 1]]);
            map.entry(dst_ip).or_default().insert(dst_port);
        }
        if pkt[9] == 17 && pkt.len() >= ihl + 4 {
            let dst_port = u16::from_be_bytes([pkt[ihl], pkt[ihl + 1]]);
            map.entry(dst_ip).or_default().insert(dst_port);
        }
    }
    map
}
