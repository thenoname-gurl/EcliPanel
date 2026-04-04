use serde_json::Value;
use std::collections::{HashMap, HashSet, VecDeque};
use std::time::Instant;
use tokio::sync::RwLock;

#[derive(Debug, Clone)]
pub struct ConnectionEvent {
    pub src_ip: String,
    pub src_port: u16,
    pub dest_ip: String,
    pub dest_port: u16,
    pub server_id: String,
    pub server_is_source: bool,
    pub suspected_server_ids: Vec<String>,
}

#[derive(Debug)]
pub struct ServerState {
    pub big_hits: usize,
    pub unique_ips: HashSet<String>,
    pub ports_per_dest: HashMap<String, HashSet<u16>>,
    pub recent_ports_per_dest: HashMap<String, VecDeque<u16>>,
    pub recent_events: VecDeque<Value>,
    pub mining_hits: usize,
    pub mining_unique_ips: HashSet<String>,
    pub last_detection_at: HashMap<String, Instant>,
    pub last_reset: Instant,
}

impl ServerState {
    pub fn fresh(now: Instant) -> Self {
        Self {
            big_hits: 0,
            unique_ips: HashSet::new(),
            ports_per_dest: HashMap::new(),
            recent_ports_per_dest: HashMap::new(),
            recent_events: VecDeque::new(),
            mining_hits: 0,
            mining_unique_ips: HashSet::new(),
            last_detection_at: HashMap::new(),
            last_reset: now,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EnforcementAction {
    Alert,
    Throttle,
    Suspend,
}

impl EnforcementAction {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Alert => "alert",
            Self::Throttle => "throttle",
            Self::Suspend => "suspend",
        }
    }
}

#[derive(Debug, Clone)]
pub struct DetectionTrigger {
    pub detection_type: String,
    pub reason: String,
    pub metrics: Value,
    pub recent_events: Vec<Value>,
}

#[derive(Debug, Clone)]
pub struct StrikeState {
    pub count: u32,
    pub last_at: Instant,
}

#[derive(Debug)]
pub struct SharedState {
    pub ip_to_server: RwLock<HashMap<String, String>>,
    pub source_port_to_server: RwLock<HashMap<u16, String>>,
    pub ip_to_servers: RwLock<HashMap<String, Vec<String>>>,
    pub source_port_to_servers: RwLock<HashMap<u16, Vec<String>>>,
    pub server_name: RwLock<HashMap<String, String>>,
    pub containers: RwLock<HashMap<String, ServerState>>,
    pub last_suspended: RwLock<HashMap<String, Instant>>,
    pub strikes: RwLock<HashMap<String, StrikeState>>,
}

impl SharedState {
    pub fn new() -> Self {
        Self {
            ip_to_server: RwLock::new(HashMap::new()),
            source_port_to_server: RwLock::new(HashMap::new()),
            ip_to_servers: RwLock::new(HashMap::new()),
            source_port_to_servers: RwLock::new(HashMap::new()),
            server_name: RwLock::new(HashMap::new()),
            containers: RwLock::new(HashMap::new()),
            last_suspended: RwLock::new(HashMap::new()),
            strikes: RwLock::new(HashMap::new()),
        }
    }
}