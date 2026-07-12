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
