use crate::remote::AuthenticationType;
use std::{
    collections::HashMap,
    sync::{Arc, atomic::AtomicUsize},
};
use tokio::sync::Mutex;

struct Ratelimit {
    password_attempts: usize,
    pubkey_attempts: usize,
    last_attempt: std::time::Instant,
}

impl Default for Ratelimit {
    fn default() -> Self {
        Self {
            password_attempts: 0,
            pubkey_attempts: 0,
            last_attempt: std::time::Instant::now(),
        }
    }
}

pub struct SshLimiter {
    config: Arc<crate::config::Config>,
    ratelimits: Arc<Mutex<HashMap<std::net::IpAddr, Ratelimit>>>,
    user_sessions: Arc<parking_lot::Mutex<HashMap<uuid::Uuid, usize>>>,
    open_handles: Arc<AtomicUsize>,

    task: tokio::task::JoinHandle<()>,
}

impl SshLimiter {
    pub fn new(config: Arc<crate::config::Config>) -> Self {
        let ratelimits = Arc::new(Mutex::new(HashMap::<std::net::IpAddr, Ratelimit>::new()));
        let user_sessions = Arc::new(parking_lot::Mutex::new(HashMap::<uuid::Uuid, usize>::new()));

        let task = tokio::spawn({
            let config = Arc::clone(&config);
            let ratelimits = Arc::clone(&ratelimits);
            let user_sessions = Arc::clone(&user_sessions);

            async move {
                loop {
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;

                    let mut ratelimits = ratelimits.lock().await;
                    let now = std::time::Instant::now();
                    ratelimits.retain(|_, ratelimit| {
                        now.duration_since(ratelimit.last_attempt).as_secs()
                            < config.load().system.sftp.limits.authentication_cooldown
                    });
                    drop(ratelimits);

                    let mut user_sessions = user_sessions.lock();
                    user_sessions.retain(|_, session_count| *session_count > 0);
                }
            }
        });

        Self {
            config,
            ratelimits,
            user_sessions,
            open_handles: Arc::new(AtomicUsize::new(0)),
            task,
        }
    }

    pub async fn check_attempt(
        &self,
        ip: std::net::IpAddr,
        authentication_type: AuthenticationType,
    ) -> Result<(), russh::Error> {
        if self
            .config
            .load()
            .system
            .sftp
            .limits
            .authentication_cooldown
            == 0
        {
            return Ok(());
        }

        let mut ratelimits = self.ratelimits.lock().await;
        let entry = ratelimits.entry(ip).or_default();

        if match authentication_type {
            AuthenticationType::Password => {
                entry.password_attempts += 1;
                entry.last_attempt = std::time::Instant::now();
                entry.password_attempts
                    > self
                        .config
                        .load()
                        .system
                        .sftp
                        .limits
                        .authentication_password_attempts
            }
            AuthenticationType::PublicKey => {
                entry.pubkey_attempts += 1;
                entry.last_attempt = std::time::Instant::now();
                entry.pubkey_attempts
                    > self
                        .config
                        .load()
                        .system
                        .sftp
                        .limits
                        .authentication_pubkey_attempts
            }
        } {
            Err(russh::Error::Disconnect)
        } else {
            Ok(())
        }
    }

    pub async fn finish_attempt(
        &self,
        ip: &std::net::IpAddr,
        authentication_type: AuthenticationType,
    ) {
        if self
            .config
            .load()
            .system
            .sftp
            .limits
            .authentication_cooldown
            == 0
        {
            return;
        }

        let mut ratelimits = self.ratelimits.lock().await;
        if let Some(entry) = ratelimits.get_mut(ip) {
            match authentication_type {
                AuthenticationType::Password => {
                    if entry.password_attempts > 0 {
                        entry.password_attempts -= 1;
                    }
                }
                AuthenticationType::PublicKey => {
                    if entry.pubkey_attempts > 0 {
                        entry.pubkey_attempts -= 1;
                    }
                }
            }
        }
    }

    pub fn increment_sessions(&self, user_uuid: uuid::Uuid) -> Result<(), russh::Error> {
        let mut user_sessions = self.user_sessions.lock();
        let count = user_sessions.entry(user_uuid).or_default();

        if *count
            >= self
                .config
                .load()
                .system
                .sftp
                .limits
                .max_connections_per_user
        {
            Err(russh::Error::Disconnect)
        } else {
            *count += 1;
            Ok(())
        }
    }

    pub fn decrement_sessions(&self, user_uuid: uuid::Uuid) {
        let mut user_sessions = self.user_sessions.lock();
        if let Some(count) = user_sessions.get_mut(&user_uuid)
            && *count > 0
        {
            *count -= 1;
        }
    }

    pub fn open_handle(&self) -> Result<SshLimiterHandleGuard, russh_sftp::server::StatusReply> {
        if self.config.load().system.sftp.limits.max_handles_total == 0 {
            self.open_handles
                .fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            return Ok(SshLimiterHandleGuard(Arc::clone(&self.open_handles)));
        }

        let current = self
            .open_handles
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if current >= self.config.load().system.sftp.limits.max_handles_total {
            self.open_handles
                .fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
            Err(
                russh_sftp::server::StatusReply::new(russh_sftp::protocol::StatusCode::Failure)
                    .with_language_tag("en-US")
                    .with_message("Maximum open handles reached."),
            )
        } else {
            Ok(SshLimiterHandleGuard(Arc::clone(&self.open_handles)))
        }
    }
}

impl Drop for SshLimiter {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub struct SshLimiterHandleGuard(Arc<AtomicUsize>);

impl Drop for SshLimiterHandleGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        net::{IpAddr, Ipv4Addr},
        sync::atomic::Ordering,
    };

    fn limiter_with(
        cooldown: u64,
        password_attempts: usize,
        pubkey_attempts: usize,
        max_connections_per_user: usize,
        max_handles_total: usize,
    ) -> SshLimiter {
        let state = Arc::new(crate::routes::AppState::mock());
        let config = state.config.clone();
        {
            let limits = &mut config.mutate_in_place_for_testing().system.sftp.limits;
            limits.authentication_cooldown = cooldown;
            limits.authentication_password_attempts = password_attempts;
            limits.authentication_pubkey_attempts = pubkey_attempts;
            limits.max_connections_per_user = max_connections_per_user;
            limits.max_handles_total = max_handles_total;
        }

        SshLimiter::new(config)
    }

    fn ip(last: u8) -> IpAddr {
        IpAddr::V4(Ipv4Addr::new(127, 0, 0, last))
    }

    // SshLimiter

    #[test]
    fn check_attempt_disabled_when_cooldown_zero() {
        tokio_test::block_on(async {
            let limiter = limiter_with(0, 1, 1, 5, 5);
            for _ in 0..10 {
                assert!(
                    limiter
                        .check_attempt(ip(1), AuthenticationType::Password)
                        .await
                        .is_ok()
                );
            }
            // the disabled path returns before ever touching the map
            assert!(limiter.ratelimits.lock().await.is_empty());
        });
    }

    #[test]
    fn check_attempt_blocks_password_over_limit() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 3, 3, 5, 5);
            let addr = ip(1);
            for _ in 0..3 {
                assert!(
                    limiter
                        .check_attempt(addr, AuthenticationType::Password)
                        .await
                        .is_ok()
                );
            }
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_err()
            );
        });
    }

    #[test]
    fn check_attempt_counts_password_and_pubkey_separately() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 2, 2, 5, 5);
            let addr = ip(1);
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_ok()
            );
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_ok()
            );
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_err()
            );
            // pubkey has its own independent budget
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::PublicKey)
                    .await
                    .is_ok()
            );
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::PublicKey)
                    .await
                    .is_ok()
            );
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::PublicKey)
                    .await
                    .is_err()
            );
        });
    }

    #[test]
    fn check_attempt_tracks_ips_independently() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 1, 1, 5, 5);
            assert!(
                limiter
                    .check_attempt(ip(1), AuthenticationType::Password)
                    .await
                    .is_ok()
            );
            assert!(
                limiter
                    .check_attempt(ip(1), AuthenticationType::Password)
                    .await
                    .is_err()
            );
            assert!(
                limiter
                    .check_attempt(ip(2), AuthenticationType::Password)
                    .await
                    .is_ok()
            );
        });
    }

    #[test]
    fn finish_attempt_releases_an_in_flight_attempt() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 2, 2, 5, 5);
            let addr = ip(1);
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_ok()
            );
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_ok()
            );
            limiter
                .finish_attempt(&addr, AuthenticationType::Password)
                .await;
            // the released slot can be used again, the one after that is over the limit
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_ok()
            );
            assert!(
                limiter
                    .check_attempt(addr, AuthenticationType::Password)
                    .await
                    .is_err()
            );
        });
    }

    #[test]
    fn finish_attempt_does_not_underflow() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 5, 5);
            let addr = ip(1);
            limiter
                .check_attempt(addr, AuthenticationType::Password)
                .await
                .unwrap();
            limiter
                .finish_attempt(&addr, AuthenticationType::Password)
                .await;
            limiter
                .finish_attempt(&addr, AuthenticationType::Password)
                .await;
            let map = limiter.ratelimits.lock().await;
            assert_eq!(map.get(&addr).unwrap().password_attempts, 0);
        });
    }

    #[test]
    fn finish_attempt_on_unknown_ip_is_noop() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 5, 5);
            limiter
                .finish_attempt(&ip(9), AuthenticationType::Password)
                .await;
            assert!(limiter.ratelimits.lock().await.is_empty());
        });
    }

    #[test]
    fn sessions_blocked_over_per_user_limit() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 2, 5);
            let user = uuid::Uuid::new_v4();
            assert!(limiter.increment_sessions(user).is_ok());
            assert!(limiter.increment_sessions(user).is_ok());
            assert!(limiter.increment_sessions(user).is_err());
        });
    }

    #[test]
    fn decrement_sessions_frees_a_slot() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 1, 5);
            let user = uuid::Uuid::new_v4();
            assert!(limiter.increment_sessions(user).is_ok());
            assert!(limiter.increment_sessions(user).is_err());
            limiter.decrement_sessions(user);
            assert!(limiter.increment_sessions(user).is_ok());
        });
    }

    #[test]
    fn decrement_sessions_saturates_and_ignores_unknown_user() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 2, 5);
            let user = uuid::Uuid::new_v4();
            limiter.decrement_sessions(user);
            limiter.increment_sessions(user).unwrap();
            limiter.decrement_sessions(user);
            limiter.decrement_sessions(user);
            let map = limiter.user_sessions.lock();
            assert_eq!(*map.get(&user).unwrap(), 0);
        });
    }

    #[test]
    fn sessions_tracked_per_user() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 1, 5);
            let a = uuid::Uuid::new_v4();
            let b = uuid::Uuid::new_v4();
            assert!(limiter.increment_sessions(a).is_ok());
            assert!(limiter.increment_sessions(a).is_err());
            assert!(limiter.increment_sessions(b).is_ok());
        });
    }

    #[test]
    fn open_handle_blocks_over_total_limit() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 5, 2);
            let _h1 = limiter.open_handle().unwrap();
            let _h2 = limiter.open_handle().unwrap();
            assert!(limiter.open_handle().is_err());
        });
    }

    #[test]
    fn open_handle_freed_on_guard_drop() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 5, 1);
            {
                let _h = limiter.open_handle().unwrap();
                assert!(limiter.open_handle().is_err());
            }
            assert!(limiter.open_handle().is_ok());
        });
    }

    // SshLimiterHandleGuard

    #[test]
    fn guard_drop_balances_open_handle() {
        tokio_test::block_on(async {
            let limiter = limiter_with(60, 5, 5, 5, 4);
            let before = limiter.open_handles.load(Ordering::SeqCst);
            {
                let _h = limiter.open_handle().unwrap();
            }
            assert_eq!(limiter.open_handles.load(Ordering::SeqCst), before);
        });
    }

    #[test]
    fn guard_drop_does_not_underflow_when_handles_disabled() {
        tokio_test::block_on(async {
            // max_handles_total == 0 disables the limit, so the guard must not
            // decrement a counter it never incremented
            let limiter = limiter_with(60, 5, 5, 5, 0);
            {
                let _h = limiter.open_handle().unwrap();
            }
            assert_eq!(limiter.open_handles.load(Ordering::SeqCst), 0);
        });
    }
}
