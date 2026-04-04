# EcliPanel Anti-Abuse (Rust)

This service runs alongside wings, watches outbound TCP SYN traffic, detects suspicious behavior (port scanning / DDoS-like bursts), and then:

1. Suspends the offending server via backend API.
2. Reports the incident to backend anti-abuse ingestion.
3. Lets backend send email and expose the incident in admin panel.

## Quick start

1. Configure env:

```bash
cp .env.example .env
```

2. Build:

```bash
cargo build --release
```

3. Deploy using systemd as root:

Unit file is provided in `../systemd/eclipanel-antiabuse.service`.
Install it:

```bash
sudo cp ./EcliPanel/systemd/eclipanel-antiabuse.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eclipanel-antiabuse
sudo systemctl status eclipanel-antiabuse
```

## Notes
Signature folder and .env.example were heavily modified to avoid abusers understanding out patterns!