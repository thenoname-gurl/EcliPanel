# Wings Security Patches

This directory contains patches that add security and anti-abuse features to Wings.

## Applied patches (built into the current `wings-security` branch)

1. **Docker in AppState** — Adds `docker: Arc<bollard::Docker>` to `AppState` for direct Docker API access
2. **Security REST endpoints** — `GET /api/servers/:id/security/processes`, `/connections`, `/scan-files`
3. **Embedded anti-abuse engine** — Background CPU/network monitoring with panel incident reporting

## Applying patches

```bash
# Apply all patches in order
./apply.sh

# Or manually
git am patches/0001-*.patch
git am patches/0002-*.patch
```

## Updating from upstream

```bash
# Fetch latest upstream
git fetch upstream

# Create a new branch from upstream/main
git checkout -b wings-security-v2 upstream/main

# Apply patches
git am patches/*.patch

# Resolve any conflicts and continue
git am --continue
```

## Generating patches

After making changes on the `wings-security` branch:

```bash
# Generate patches against upstream/main
git format-patch upstream/main -o patches/ --numbered
```
