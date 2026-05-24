import { Md } from "../_components/md";

const content = `
# KVM & Linux beginner guide

## Templates and visibility

The server creation wizard shows only visible templates that are allowed for your plan and portal. Hidden templates exist in the panel but are not shown in the public apps view.

| Template | Description |
|---|---|
| AIO | Java 21, Node.js, Go, Rust, .NET SDK and other dev/runtime tools pre-installed. |
| BungeeCord | Minecraft proxy for connecting multiple servers together into a network. |
| Code-Server | Run VS Code in the browser for remote development from anywhere. |
| Garrys Mod | Sandbox game server template with workshop support. |
| Hytale | Template for Hytale server hosting when available. |
| MariaDB 10.3 | Open-source relational database server for MySQL-compatible workloads. |
| Minio S3 | S3-compatible object storage server for backups and file hosting. |
| Paper | High-performance Minecraft server fork with plugin support and optimizations. |
| phpMyAdmin | Web-based UI for managing MySQL and MariaDB databases. |
| QEMU - Debian 13 VM | Full Debian 13 (Trixie) virtual machine using QEMU/KVM with root access. |
| Velocity | Modern Minecraft proxy designed for speed and flexibility. |

Template availability depends on your plan. If a template you expect is missing, contact your panel administrator.

## Deploying the Debian 13 VM

The QEMU - Debian 13 VM provisions a Debian 13 (Trixie) cloud image, forwards SSH to the main allocation port, and gives you full root-level access. Unlike container-based templates, this VM runs its own kernel and provides complete isolation.

### Step-by-step deployment

1. Open **Servers** from the dashboard and click **New Server**.
2. Select the **QEMU - Debian 13 VM** template from the list.
3. Give your server a descriptive name so you can identify it later.
4. Choose an available node. Pick the one closest to your location or with the most free resources.
5. Set CPU cores, RAM, and disk space. For a basic web server, 2 CPU cores and 2 GB RAM is a good starting point.
6. Click **Deploy**. Provisioning typically takes 30–90 seconds.
7. Once the server shows as **Running**, open the server details page to find your primary allocation (IP and port) for SSH access.

### Panel features for KVM

- **Startup details** — The server info panel shows the primary allocation with IP address and SSH port.
- **Firewall** — Forward ports from the public IP to internal VM ports. Only forwarded ports are reachable from the internet.
- **Backups** — Create backups before making significant changes. Backups capture the full VM disk state.
- **Snapshots** — Not supported in this panel configuration. Use backups instead for point-in-time recovery.
- **Console access** — The web console provides direct access to the VM even when SSH is broken. Use it for recovery or network troubleshooting.
- **Power controls** — Start, stop, restart, and force stop your VM from the server card or detail page.

## First steps after deployment

### 1. Update the system

Always start with a full system update to get the latest security patches.

\`\`\`bash
apt update && apt upgrade -y
\`\`\`

### 2. Create a non-root user

Running as root is dangerous. Create a regular user with sudo access for daily operations.

\`\`\`bash
adduser myuser
usermod -aG sudo myuser
\`\`\`

Replace \`myuser\` with your preferred username.

### 3. Set up SSH key authentication

SSH keys are more secure than passwords. Generate a key pair on your local machine and add the public key to your VM.

\`\`\`bash
# On your local machine (not the VM):
ssh-keygen -t ed25519 -C "your@email.com"

# Copy the public key to your VM:
ssh-copy-id -p PORT myuser@YOUR_IP

# Or manually add it:
mkdir -p ~/.ssh && chmod 700 ~/.ssh
echo "your-public-key" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
\`\`\`

### 4. Harden SSH configuration

Disable password authentication and root login over SSH to prevent brute-force attacks.

\`\`\`bash
sudo nano /etc/ssh/sshd_config
\`\`\`

Set these values:

\`\`\`
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
\`\`\`

Then restart SSH:

\`\`\`bash
sudo systemctl restart sshd
\`\`\`

> Warning: Test your SSH key connection in a separate terminal before closing your current session. If something is wrong, you could lock yourself out.

### 5. Enable the firewall

UFW (Uncomplicated Firewall) is the easiest way to manage firewall rules on Debian.

\`\`\`bash
sudo apt install ufw -y
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status
\`\`\`

Only open ports you actually need. Remember to also configure port forwarding in the panel's Firewall tab for any services you want accessible from the internet.

## Networking and port forwarding

Your VM has an internal network, and the panel's firewall acts as a gateway.

- **Primary allocation** — The main port assigned to your server. SSH is forwarded here by default.
- **Additional allocations** — Add more ports from the Firewall tab. Each maps a public port to an internal VM port.
- **Protocol selection** — Choose TCP, UDP, or both depending on your service. Web servers use TCP. Some game servers need UDP.
- **Internal vs external** — The public port can differ from the internal port. For example, you can forward public port 8080 to internal port 80.

### Common port mappings

| Service | Mapping |
|---|---|
| Web server (HTTP/HTTPS) | Forward 80 → 80, 443 → 443 (TCP) |
| Minecraft server | Forward 25565 → 25565 (TCP) |
| SSH access | Forward primary allocation → 22 (TCP) |
| Database (remote) | Forward 3306 → 3306 (TCP) — use with caution |

## Essential Linux commands

### Directory navigation

\`\`\`bash
pwd              # show current directory
ls -la           # list all files with details
cd /path/to/dir  # change directory
cd ..            # go up one level
\`\`\`

### File operations

\`\`\`bash
cp source dest   # copy files
mv source dest   # move or rename
rm file          # delete a file
rm -rf dir       # delete a directory
\`\`\`

### File editing

\`\`\`bash
nano file        # simple text editor (beginner-friendly)
vim file         # powerful editor (steeper learning curve)
cat file         # display file contents
tail -f file     # follow log output in real time
\`\`\`

### Package management

\`\`\`bash
apt update       # refresh package lists
apt install pkg  # install a package
apt remove pkg   # remove a package
apt autoremove   # clean unused dependencies
\`\`\`

### Permissions

\`\`\`bash
chmod 755 file        # set file permissions
chown user:group file # change ownership
sudo command          # run as root
\`\`\`

### Process management

\`\`\`bash
ps aux                # list running processes
kill PID              # stop a process
top                   # live process monitor
htop                  # interactive CPU/RAM monitor
systemctl status svc  # check service status
\`\`\`

## Managing services with systemd

\`\`\`bash
sudo systemctl start nginx
sudo systemctl stop nginx
sudo systemctl restart nginx
sudo systemctl status nginx
sudo systemctl enable nginx   # start automatically on boot
sudo systemctl disable nginx  # prevent auto-start
\`\`\`

Always check status after starting a service to confirm it is running without errors.

## Monitoring and troubleshooting

| Tool | Use |
|---|---|
| \`htop\` | Interactive CPU/RAM monitor |
| \`df -h\` | Disk space usage |
| \`free -h\` | Memory usage |
| \`journalctl -u service\` | Service logs |
| \`journalctl -f\` | Follow all logs live |
| \`dmesg | tail\` | Kernel messages |
| \`ss -tlnp\` | List listening ports |
| \`curl -I http://localhost\` | Test HTTP response |
| \`ping host\` | Test connectivity |
| \`sudo apt --fix-broken install\` | Repair packages |
| \`sudo systemctl daemon-reload\` | Reload service configs |

## Example: Setting up a web server

1. SSH into your Debian 13 VM as your non-root user.
2. Install Nginx: \`sudo apt install nginx -y\`
3. Start and enable it: \`sudo systemctl enable --now nginx\`
4. Open the panel Firewall tab and forward port 80 to port 80 (TCP).
5. Test by visiting \`http://YOUR_IP\` in your browser. You should see the Nginx welcome page.
6. Place your website files in \`/var/www/html\` or configure a virtual host in \`/etc/nginx/sites-available/\`.

## Example: Installing Node.js for a custom app

1. Install NodeSource repository: \`curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -\`
2. Install Node.js: \`sudo apt install -y nodejs\`
3. Verify: \`node -v\` and \`npm -v\`
4. Clone your app: \`git clone https://github.com/your/repo.git && cd repo\`
5. Install dependencies: \`npm install\`
6. Start your app: \`npm start\` or use PM2 for process management: \`npm install -g pm2 && pm2 start app.js\`
7. Forward the app port in the panel Firewall tab so it is accessible from the internet.

---

For general server controls and troubleshooting, see [Server management](/docs/server-management). For all visible app templates and deployment workflows, see [Deploying apps](/docs/deploying-apps).
`;

export default function Page() {
  return <Md>{content}</Md>;
}
