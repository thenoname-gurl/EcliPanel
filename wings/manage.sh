#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

SOURCE_DIR="$SCRIPT_DIR/source"
PATCHED_DIR="$SCRIPT_DIR/patched"
OUTPUT_DIR="$SCRIPT_DIR/output"
PATCHES_DIR="$SCRIPT_DIR/patches"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[wings]${NC} $*"; }
warn() { echo -e "${YELLOW}[wings]${NC} $*"; }
err()  { echo -e "${RED}[wings]${NC} $*"; }

do_regen() {
    log "Regenerating patches from patched/ vs source/..."
    rm -f "$PATCHES_DIR"/*.patch 2>/dev/null || true
    local n=1
    diff -ruN "$SOURCE_DIR" "$PATCHED_DIR" > "$PATCHES_DIR/$(printf '%04d' $n)-wings-security.patch" 2>/dev/null || true
    local size=$(wc -c < "$PATCHES_DIR/0001-wings-security.patch" 2>/dev/null || echo 0)
    if [ "$size" -gt 10 ]; then
        log "Generated patch ($(du -h "$PATCHES_DIR/0001-wings-security.patch" | cut -f1))"
    else
        warn "No differences between patched/ and source/ — nothing to patch"
        rm -f "$PATCHES_DIR"/*.patch
    fi
}

do_patch() {
    log "Applying patches to output/..."
    rm -rf "$OUTPUT_DIR"
    cp -a "$SOURCE_DIR" "$OUTPUT_DIR"
    cd "$OUTPUT_DIR"
    local applied=0 failed=0
    for p in "$PATCHES_DIR"/*.patch; do
        [ -f "$p" ] || continue
        local name=$(basename "$p")
        if patch -p1 -s --dry-run < "$p" 2>/dev/null; then
            patch -p1 -s < "$p"
            log "  Applied: $name"
            ((applied++))
        else
            err "  FAILED: $name — patch doesn't apply cleanly"
            warn "  Resolve manually in output/, then run: ./manage.sh regen"
            ((failed++))
            break
        fi
    done
    if [ $failed -eq 0 ]; then
        log "All $applied patch(es) applied successfully to output/"
    else
        exit 1
    fi
}

do_build() {
    log "Building Wings from output/..."
    cd "$OUTPUT_DIR"
    cargo build --release 2>&1 | tail -5
    if [ -f target/release/wings-rs ]; then
        cp target/release/wings-rs "$SCRIPT_DIR/target/release/wings-rs" 2>/dev/null || true
        log "Binary: $SCRIPT_DIR/target/release/wings-rs"
        ls -lh "$OUTPUT_DIR/target/release/wings-rs"
    else
        err "Build failed"
        exit 1
    fi
}

do_status() {
    echo ""
    echo "  Wings Patch Manager"
    echo ""
    echo "  source/  — $(du -sh "$SOURCE_DIR" 2>/dev/null | cut -f1) upstream reference"
    echo "  patched/ — $(du -sh "$PATCHED_DIR" 2>/dev/null | cut -f1) working copy"
    echo "  output/  — $(du -sh "$OUTPUT_DIR" 2>/dev/null | cut -f1) build target"
    echo "  patches/ — $(ls "$PATCHES_DIR"/*.patch 2>/dev/null | wc -l) file(s)"
    echo ""
}

case "${1:-}" in
    regen)  do_regen ;;
    patch)  do_patch ;;
    build)  do_build ;;
    status) do_status ;;
    *)
        echo "Wings Patch Manager"
        echo "  ./manage.sh regen    Generate patches from patched/ vs source/"
        echo "  ./manage.sh patch    Apply patches to output/"
        echo "  ./manage.sh build    cargo build --release"
        echo "  ./manage.sh status   Show state"
        echo ""
        echo "Workflow: edit patched/ → regen → patch → build"
        ;;
esac
