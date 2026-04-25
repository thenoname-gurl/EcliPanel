#!/bin/bash

cd /home/container || exit 1

VM_MEMORY="${VM_MEMORY:-2048}"
VM_CORES="${VM_CORES:-2}"
VM_DISK_SIZE="${VM_DISK_SIZE:-20G}"
VM_SSH_PORT="${SERVER_PORT:-2022}"
ROOT_PASSWORD="${ROOT_PASSWORD:-changeme}"
DISK_IMAGE="debian13.qcow2"
CLOUD_IMAGE_URL="${CLOUD_IMAGE_URL:-https://cloud.debian.org/images/cloud/trixie/daily/latest/debian-13-generic-amd64-daily.qcow2}"
CLOUD_IMAGE_FILE="debian-13-cloud-base.qcow2"
USE_CLOUD_IMAGE="${USE_CLOUD_IMAGE:-1}"
ENABLE_BALLOON="${ENABLE_BALLOON:-1}"
VM_MEMORY_MIN="${VM_MEMORY_MIN:-$(( VM_MEMORY / 2 ))}"
BALLOON_CHECK_INTERVAL="${BALLOON_CHECK_INTERVAL:-10}"
BALLOON_HOST_THRESHOLD="${BALLOON_HOST_THRESHOLD:-80}"
BALLOON_AGGRESSIVE="${BALLOON_AGGRESSIVE:-0}"
BALLOON_RECLAIM_STEP="${BALLOON_RECLAIM_STEP:-10}"
BALLOON_HOST_RECOVERY="${BALLOON_HOST_RECOVERY:-90}"

echo "══════════════════════════════════════════════"
echo " EclipseSystems QEMU - Debian 13 (Trixie) VM  "
echo "══════════════════════════════════════════════"
echo "  Memory:       ${VM_MEMORY}MB"
echo "  Cores:        ${VM_CORES}"
echo "  Disk:         ${VM_DISK_SIZE}"
echo "  SSH Port:     ${VM_SSH_PORT} (forwarded from host)"
echo "  Balloon:      ${ENABLE_BALLOON}"
if [ "${ENABLE_BALLOON}" = "1" ]; then
echo "  Min Floor:    ${VM_MEMORY_MIN}MB"
echo "  Check Int:    ${BALLOON_CHECK_INTERVAL}s"
echo "  Host Thresh:  ${BALLOON_HOST_THRESHOLD}%"
echo "  Reclaim Step: ${BALLOON_RECLAIM_STEP}%"
fi
echo "══════════════════════════════════════════════"
echo "  Developed by Maksym H. (noname@ecli.app)    "
echo "  Licensed under ecli.app/license             "
echo "══════════════════════════════════════════════"

check_balloon_support() {
    qemu-system-x86_64 -device help 2>&1 | grep -q "virtio-balloon"
}

KVM_FLAG=""
if [ -e /dev/kvm ]; then
    echo "[*] /dev/kvm exists, checking permissions..."
    if dd if=/dev/kvm count=0 2>/dev/null; then
        echo "[✓] KVM acceleration available and accessible"
        KVM_FLAG="-enable-kvm -cpu host"
    else
        echo "[✗] /dev/kvm not accessible, using TCG (slow)"
        KVM_FLAG="-cpu qemu64"
    fi
else
    echo "[✗] /dev/kvm not found, using TCG (slow)"
    KVM_FLAG="-cpu qemu64"
fi

if [ "$USE_CLOUD_IMAGE" = "1" ]; then
    echo "[*] Using cloud image method..."
    if [ ! -f "$CLOUD_IMAGE_FILE" ]; then
        echo "[*] Downloading Debian 13 cloud image..."
        wget -q --show-progress -O "$CLOUD_IMAGE_FILE" "$CLOUD_IMAGE_URL"
        if [ $? -ne 0 ]; then
            echo "[!] Cloud image download failed."
            rm -f "$CLOUD_IMAGE_FILE"
            exit 1
        fi
    fi
fi

if [ "$USE_CLOUD_IMAGE" = "1" ] && [ -f "$CLOUD_IMAGE_FILE" ]; then
    if [ ! -f "$DISK_IMAGE" ]; then
        echo "[*] Creating VM disk from cloud image..."
        cp "$CLOUD_IMAGE_FILE" "$DISK_IMAGE"
        qemu-img resize "$DISK_IMAGE" "$VM_DISK_SIZE"
    fi

    SEED_DIR="/tmp/cloud-init"
    rm -rf "$SEED_DIR"
    mkdir -p "$SEED_DIR"

    cat > "$SEED_DIR/meta-data" <<METADATA
instance-id: pterodactyl-vm-001
local-hostname: debian
METADATA

    PASS_HASH=$(echo "${ROOT_PASSWORD}" | openssl passwd -6 -stdin)

    BALLOON_PACKAGE=""
    if [ "${ENABLE_BALLOON}" = "1" ]; then
        BALLOON_PACKAGE="  - qemu-guest-agent"
    fi

    cat > "$SEED_DIR/user-data" <<USERDATA
#cloud-config
hostname: debian
fqdn: debian.local
manage_etc_hosts: true

users:
  - name: root
    lock_passwd: false
    hashed_passwd: ${PASS_HASH}
    shell: /bin/bash
  - name: debian
    lock_passwd: false
    hashed_passwd: ${PASS_HASH}
    shell: /bin/bash
    sudo: ALL=(ALL) NOPASSWD:ALL
    groups: sudo

ssh_pwauth: true
disable_root: false

runcmd:
  - systemctl enable ssh
  - systemctl start ssh
  - sed -i 's/#PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
  - sed -i 's/PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config
  - sed -i 's/#PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
  - sed -i 's/PasswordAuthentication.*/PasswordAuthentication yes/' /etc/ssh/sshd_config
  - systemctl restart ssh
  - growpart /dev/vda 1 || growpart /dev/sda 1 || true
  - resize2fs /dev/vda1 || resize2fs /dev/sda1 || true
  - modprobe virtio_balloon || true
  - systemctl enable qemu-guest-agent || true
  - systemctl start qemu-guest-agent || true
  - echo "VM_READY" > /dev/ttyS0

package_update: true
packages:
  - openssh-server
  - curl
  - wget
  - nano
  - htop
  - cloud-guest-utils
${BALLOON_PACKAGE}

final_message: "Debian 13 VM is ready! SSH available."
USERDATA

    if command -v cloud-localds &> /dev/null; then
        cloud-localds "$SEED_DIR/seed.iso" "$SEED_DIR/user-data" "$SEED_DIR/meta-data"
    else
        if ! command -v genisoimage &> /dev/null; then
            apt-get update -qq && apt-get install -y -qq genisoimage > /dev/null 2>&1
        fi
        genisoimage -output "$SEED_DIR/seed.iso" -volid cidata -joliet -rock \
            "$SEED_DIR/user-data" "$SEED_DIR/meta-data" 2>/dev/null
    fi

    CLOUD_INIT_ARGS="-drive file=${SEED_DIR}/seed.iso,format=raw,if=virtio,media=cdrom"

    echo "[*] Starting Debian 13 VM..."
    echo "[*] SSH: ssh root@<node-ip> -p ${VM_SSH_PORT}"
    echo "[*] Password: ${ROOT_PASSWORD}"
    echo "[*] First boot takes 2-3 minutes for cloud-init"
    echo ""

    NET_HOSTFWD="hostfwd=tcp::${VM_SSH_PORT}-:22"

    is_valid_ip() {
        local ip=$1
        [[ -z "$ip" ]] && return 1
        [[ $ip =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || return 1
        IFS='.' read -r a b c d <<< "$ip"
        for oct in $a $b $c $d; do
            ((oct < 0 || oct > 255)) && return 1
        done
        return 0
    }

    is_valid_portnum() {
        local p=$1
        [[ $p =~ ^[0-9]+$ ]] && ((p >= 1 && p <= 65535))
    }

    [ -n "${VM_HOSTADDR}" ] && ! is_valid_ip "${VM_HOSTADDR}" && [ "${VM_HOSTADDR}" != "0.0.0.0" ] && {
        echo "[!] VM_HOSTADDR '${VM_HOSTADDR}' is invalid; ignoring."
        VM_HOSTADDR=""
    }

    if [ -n "${VM_PORTS}" ]; then
        IFS=','
        for raw in ${VM_PORTS}; do
            p=$(echo "${raw}" | tr -d '[:space:]')
            proto="tcp"
            [[ "${p}" == */udp ]] && { proto="udp"; p="${p%/udp}"; }
            [[ "${p}" == */tcp ]] && { p="${p%/tcp}"; }
            if [[ "${p}" == *:* ]]; then
                hostport="${p%%:*}"; guestport="${p##*:}"
            else
                hostport="${p}"; guestport="${p}"
            fi
            if ! is_valid_portnum "${hostport}" || ! is_valid_portnum "${guestport}"; then
                echo "[!] Ignoring invalid port entry: ${raw}"
                continue
            fi
            if [ -n "${VM_HOSTADDR}" ]; then
                NET_ENTRY="hostfwd=${proto}:${VM_HOSTADDR}:${hostport}-:${guestport}"
            else
                NET_ENTRY="hostfwd=${proto}::${hostport}-:${guestport}"
            fi
            NET_HOSTFWD="${NET_HOSTFWD},${NET_ENTRY}"
        done
        unset IFS
        echo "[*] Forwarding additional ports: ${VM_PORTS}"
    fi

    balloon_manager() {
        local monitor_sock="/tmp/qemu-monitor.sock"
        local current_balloon="${VM_MEMORY}"
        local in_reclaim=0

        qmp_cmd() {
            echo "$1" | socat - "UNIX-CONNECT:${monitor_sock}" 2>/dev/null
        }

        get_host_free_pct() {
            if [ -f /proc/meminfo ]; then
                local avail total
                avail=$(awk '/MemAvailable/ {print $2}' /proc/meminfo)
                total=$(awk '/MemTotal/ {print $2}' /proc/meminfo)
                if [ -n "$avail" ] && [ -n "$total" ] && [ "$total" -gt 0 ]; then
                    echo $(( avail * 100 / total ))
                    return
                fi
            fi
            free -m | awk 'NR==2 {printf "%.0f", $4/$2*100}'
        }

        echo "[balloon] Waiting for QEMU monitor socket..."
        for i in $(seq 1 30); do
            [ -S "$monitor_sock" ] && break
            sleep 1
        done

        if [ ! -S "$monitor_sock" ]; then
            echo "[balloon] Monitor socket not found after 30s; exiting."
            return 1
        fi

        qmp_greeting='{"execute":"qmp_capabilities"}'
        qmp_cmd "$qmp_greeting" > /dev/null

        echo "[balloon] Manager active — monitoring every ${BALLOON_CHECK_INTERVAL}s"
        echo "           Host threshold: ${BALLOON_HOST_THRESHOLD}% | Recovery: ${BALLOON_HOST_RECOVERY}%"

        while true; do
            sleep "${BALLOON_CHECK_INTERVAL}"

            host_free=$(get_host_free_pct)
            used_mem=$(( VM_MEMORY - current_balloon ))
            reclaim_target=$(( VM_MEMORY_MIN ))

            if (( host_free < BALLOON_HOST_THRESHOLD )); then
                shrink_by=$(( current_balloon * BALLOON_RECLAIM_STEP / 100 ))
                if [ "${BALLOON_AGGRESSIVE}" = "1" ]; then
                    shrink_by=$(( shrink_by * 2 ))
                fi

                new_target=$(( current_balloon - shrink_by ))
                [ $new_target -lt $reclaim_target ] && new_target=$reclaim_target

                if [ $new_target -lt $current_balloon ]; then
                    echo "[balloon] Host free RAM low (${host_free}%) — reclaiming ${shrink_by}MB"
                    echo "{ \"execute\": \"balloon\", \"arguments\": { \"value\": $(( new_target * 1024 * 1024 )) } }" \
                        | socat - "UNIX-CONNECT:${monitor_sock}" > /dev/null 2>&1
                    current_balloon=$new_target
                    in_reclaim=1
                fi

            elif (( host_free > BALLOON_HOST_RECOVERY )) && [ $in_reclaim -eq 1 ]; then
                grow_by=$(( VM_MEMORY * BALLOON_RECLAIM_STEP / 100 / 2 ))
                new_target=$(( current_balloon + grow_by ))
                [ $new_target -gt $VM_MEMORY ] && new_target=$VM_MEMORY

                if [ $new_target -gt $current_balloon ]; then
                    echo "[balloon] Host RAM recovered (${host_free}%) — returning ${grow_by}MB"
                    echo "{ \"execute\": \"balloon\", \"arguments\": { \"value\": $(( new_target * 1024 * 1024 )) } }" \
                        | socat - "UNIX-CONNECT:${monitor_sock}" > /dev/null 2>&1
                    current_balloon=$new_target
                    [ $current_balloon -ge $VM_MEMORY ] && in_reclaim=0
                fi
            fi
        done
    }

    BALLOON_ARGS=()
    if [ "${ENABLE_BALLOON}" = "1" ]; then
        if check_balloon_support; then
            echo "[✓] Memory ballooning supported"
            echo "    Max: ${VM_MEMORY}MB  |  Min floor: ${VM_MEMORY_MIN}MB"
            BALLOON_ARGS+=(
                -device "virtio-balloon-pci,id=balloon0,deflate-on-oom=on"
            )
            BALLOON_ARGS+=("-qmp" "unix:/tmp/qemu-monitor.sock,server,nowait")
        else
            echo "[!] virtio-balloon not available; skipping."
        fi
    else
        echo "[*] Memory ballooning disabled."
    fi

    KVM_ARR=()
    [ -n "${KVM_FLAG}" ] && read -r -a KVM_ARR <<< "${KVM_FLAG}"

    QEMU_CMD=(qemu-system-x86_64)
    QEMU_CMD+=("${KVM_ARR[@]}")
    QEMU_CMD+=(-m "${VM_MEMORY}" -smp "${VM_CORES}")
    QEMU_CMD+=(-drive "file=${DISK_IMAGE},format=qcow2,if=virtio,cache=writeback")
    if [ -n "${CLOUD_INIT_ARGS}" ]; then
        read -r -a CLOUD_ARR <<< "${CLOUD_INIT_ARGS}"
        QEMU_CMD+=("${CLOUD_ARR[@]}")
    fi
    [ "${#BALLOON_ARGS[@]}" -gt 0 ] && QEMU_CMD+=("${BALLOON_ARGS[@]}")
    QEMU_CMD+=(-netdev "user,id=net0,${NET_HOSTFWD}" -device "virtio-net-pci,netdev=net0" -nographic -serial mon:stdio)

    if [ "${ENABLE_BALLOON}" = "1" ] && [ "${#BALLOON_ARGS[@]}" -gt 0 ]; then
        rm -f /tmp/qemu-monitor.sock
        balloon_manager &
        BALLOON_PID=$!
        echo "[*] Balloon manager started (PID: ${BALLOON_PID})"
    fi

    cleanup() {
        echo "[*] Shutting down balloon manager..."
        [ -n "$BALLOON_PID" ] && kill "$BALLOON_PID" 2>/dev/null
    }
    trap cleanup EXIT

    exec "${QEMU_CMD[@]}"

else
    echo "[!] Cloud image mode enabled but no image available"
    exit 1
fi