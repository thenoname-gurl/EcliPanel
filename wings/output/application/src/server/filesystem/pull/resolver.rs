use hickory_resolver::{
    TokioResolver,
    config::LookupIpStrategy,
    lookup_ip::{LookupIp, LookupIpIter},
};
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use std::{net::SocketAddr, sync::Arc};

#[derive(Clone)]
pub struct DnsResolver {
    config: Arc<crate::config::Config>,
    state: Arc<TokioResolver>,
}

impl DnsResolver {
    pub fn new(config: &Arc<crate::config::Config>) -> Self {
        let mut builder =
            TokioResolver::builder_tokio().expect("failed to create TokioResolver builder");
        builder.options_mut().ip_strategy = LookupIpStrategy::Ipv4AndIpv6;

        Self {
            config: Arc::clone(config),
            state: Arc::new(builder.build().expect("failed to build TokioResolver")),
        }
    }
}

impl Resolve for DnsResolver {
    fn resolve(&self, name: Name) -> Resolving {
        let resolver = self.clone();

        Box::pin(async move {
            let lookup = resolver.state.lookup_ip(name.as_str()).await?;
            let addrs: Addrs = Box::new(SocketAddrs::new(
                Arc::clone(&resolver.config),
                lookup,
                |l| l.iter(),
            ));

            Ok(addrs)
        })
    }
}

#[ouroboros::self_referencing]
struct SocketAddrs {
    config: Arc<crate::config::Config>,
    lookup: LookupIp,

    #[borrows(mut lookup)]
    #[covariant]
    iter: LookupIpIter<'this>,
}

impl Iterator for SocketAddrs {
    type Item = SocketAddr;

    fn next(&mut self) -> Option<Self::Item> {
        let next = self
            .with_iter_mut(|iter| iter.next())
            .map(|ip_addr| SocketAddr::new(ip_addr, 0))?;

        if super::is_blocked_ip(&self.borrow_config().load(), &next.ip()) {
            tracing::warn!("blocking internal IP address in pull: {}", next.ip());
            return self.next();
        }

        Some(next)
    }
}
