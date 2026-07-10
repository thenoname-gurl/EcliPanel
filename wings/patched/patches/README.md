# Wings Patches

This directory contains patches for  Wings.

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

Please note that any patches done to original code is licensed under EclipseSystems Community License v1.1 while stock code is licensed under MIT License.