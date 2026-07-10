# Wings — Patched for EcliPanel

Game server daemon with embedded security & anti-abuse.  
Upstream: [calagopus/wings](https://github.com/calagopus/wings)

## Folder Structure

```
wings/
├── source/       Clean upstream Wings (no .git — just the source)
├── patched/      Your working copy with security patches applied
├── output/       Build target (source + patches, run cargo here)
├── patches/      .patch files (diff between patched/ and source/)
├── manage.sh     One command for everything
├── target/       Built binary → target/release/wings-rs
└── README.md     This file
```

**No `.git` in subdirectories** — they're plain source trees. The `/v3` repo handles version control.

## Quick Start

```bash
cd /srv/samba/shared/EcliPanel/v3/wings
./manage.sh build        # Compile — binary at target/release/wings-rs
```

Panel serves the binary at: `https://ecli.app/api/wings/download`

## Edit Wings Code

Edit files directly in `patched/`:

```bash
vim patched/application/src/server/antiabuse.rs
# ... make changes ...
```

Then regenerate patches and rebuild:

```bash
./manage.sh regen       # Diff patched/ vs source/ → patches/*.patch
./manage.sh patch       # Apply patches to output/
./manage.sh build       # Compile
```

## Update from Upstream

When calagopus/wings has a new release:

```bash
# Download latest upstream source
rm -rf source
git clone --depth=1 https://github.com/calagopus/wings.git source
rm -rf source/.git source/.github

# Re-apply patches
./manage.sh regen
./manage.sh patch
./manage.sh build
```

## Commands

| Command | Does |
|---------|------|
| `./manage.sh regen` | Diff patched/ vs source/ → regenerate .patch files |
| `./manage.sh patch` | Apply patches to clean output/ directory |
| `./manage.sh build` | `cargo build --release` in output/ |
| `./manage.sh status` | Show versions/state of all directories |

## Deploy

```bash
# One-liner from any Wings node:
curl -fsSL https://ecli.app/api/wings/download -o /usr/local/bin/wings
chmod +x /usr/local/bin/wings
systemctl restart wings
```

## What's Patched

- `GET /api/servers/:id/security/processes` — container process listing
- `GET /api/servers/:id/security/connections` — network info + port bindings
- `GET /api/servers/:id/security/scan-files` — suspicious file scanner
- Embedded anti-abuse engine (CPU mining + DDoS detection)
- Panel rule polling (fetches detection rules every 5min)
- EcliPanel version branding
- License: EclipseSystems Community License v1.1
