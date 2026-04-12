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

echo "══════════════════════════════════════════════"
echo " EclipseSystems QEMU - Debian 13 (Trixie) VM  "
echo "══════════════════════════════════════════════"
echo "  Memory:   ${VM_MEMORY}MB"
echo "  Cores:    ${VM_CORES}"
echo "  Disk:     ${VM_DISK_SIZE}"
echo "  SSH Port: ${VM_SSH_PORT} (forwarded from host)"
echo "══════════════════════════════════════════════"
echo "  Developed by Maksym H. (noname@ecli.app)    "
echo "  Licensed under ecli.app/license             "
echo "══════════════════════════════════════════════"

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
  - echo "VM_READY" > /dev/ttyS0

package_update: true
packages:
  - openssh-server
  - curl
  - wget
  - nano
  - htop
  - cloud-guest-utils

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
        if [[ -z "$ip" ]]; then
            return 1
        fi
        if [[ $ip =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
            IFS='.' read -r a b c d <<< "$ip"
            for oct in $a $b $c $d; do
                if ((oct < 0 || oct > 255)); then
                    return 1
                fi
            done
            return 0
        fi
        return 1
    }

    is_valid_portnum() {
        local p=$1
        if [[ $p =~ ^[0-9]+$ ]]; then
            if ((p >= 1 && p <= 65535)); then
                return 0
            fi
        fi
        return 1
    }

    if [ -n "${VM_HOSTADDR}" ]; then
        if ! is_valid_ip "${VM_HOSTADDR}" && [ "${VM_HOSTADDR}" != "0.0.0.0" ]; then
            echo "[!] VM_HOSTADDR '${VM_HOSTADDR}' is invalid; ignoring."
            VM_HOSTADDR=""
        fi
    fi

    if [ -n "${VM_PORTS}" ]; then
        IFS=','
        for raw in ${VM_PORTS}; do
            p=$(echo "${raw}" | tr -d '[:space:]')
            proto="tcp"
            if [[ "${p}" == */udp ]]; then
                proto="udp"
                p="${p%/udp}"
            elif [[ "${p}" == */tcp ]]; then
                p="${p%/tcp}"
            fi
            if [[ "${p}" == *:* ]]; then
                hostport="${p%%:*}"
                guestport="${p##*:}"
            else
                hostport="${p}"
                guestport="${p}"
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

    KVM_ARR=()
    if [ -n "${KVM_FLAG}" ]; then
        read -r -a KVM_ARR <<< "${KVM_FLAG}"
    fi

    QEMU_CMD=(qemu-system-x86_64)
    QEMU_CMD+=("${KVM_ARR[@]}")
    QEMU_CMD+=(-m "${VM_MEMORY}" -smp "${VM_CORES}")
    QEMU_CMD+=(-drive "file=${DISK_IMAGE},format=qcow2,if=virtio,cache=writeback")
    if [ -n "${CLOUD_INIT_ARGS}" ]; then
        read -r -a CLOUD_ARR <<< "${CLOUD_INIT_ARGS}"
        QEMU_CMD+=("${CLOUD_ARR[@]}")
    fi
    QEMU_CMD+=(-netdev "user,id=net0,${NET_HOSTFWD}" -device "virtio-net-pci,netdev=net0" -nographic -serial mon:stdio)

    exec "${QEMU_CMD[@]}"

else
    echo "[!] Cloud image mode enabled but no image available"
    exit 1
fi