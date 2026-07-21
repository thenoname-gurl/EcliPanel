# Wings (Patched for EcliPanel)

Game server daemon with embedded security & anti-abuse.  
Upstream: [calagopus/wings](https://github.com/calagopus/wings)

## Folder Structure

```
wings/
├── source/       Clean upstream Wings
├── patched/      Your working copy with security patches applied
├── output/       Build target (source + patches, run cargo here)
├── patches/      .patch files (diff between patched/ and source/)
├── manage.sh     One command for everything
├── target/       Built binary → target/release/wings-rs
└── README.md     This file
```

## Quick Start

```bash
cd /srv/samba/shared/EcliPanel/v3/wings
./manage.sh build
```

Panel serves the binary at: `https://ecli.app/api/wings/download`

## Edit Wings Code

Edit files directly in `patched/`,
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
curl -fsSL https://ecli.app/api/wings/download -o /usr/local/bin/wings
chmod +x /usr/local/bin/wings
systemctl restart wings
```