import Link from "next/link"
import { Server, Info, Cpu, Terminal, Shield, Network, HardDrive, Eye } from "lucide-react"
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur"
import { Menu } from "@/app/landing/_components/_custom/Menu"

const TEMPLATE_CARDS = [
  { name: "AIO", description: "Java 21, Node.js, Go, Rust, .NET SDK and other dev/runtime tools pre-installed." },
  { name: "BungeeCord", description: "Minecraft proxy for connecting multiple servers together into a network." },
  { name: "Code-Server", description: "Run VS Code in the browser for remote development from anywhere." },
  { name: "Garrys Mod", description: "Sandbox game server template for Garry's Mod with workshop support." },
  { name: "Hytale", description: "Template for Hytale server hosting when available." },
  { name: "MariaDB 10.3", description: "Open-source relational database server for MySQL-compatible workloads." },
  { name: "Minio S3", description: "S3-compatible object storage server for backups and file hosting." },
  { name: "Paper", description: "High-performance Minecraft server fork with plugin support and optimizations." },
  { name: "phpMyAdmin", description: "Web-based UI for managing MySQL and MariaDB databases." },
  { name: "QEMU - Debian 13 VM", description: "Full Debian 13 (Trixie) virtual machine using QEMU/KVM with root access." },
  { name: "Velocity", description: "Modern Minecraft proxy designed for speed and flexibility in server networks." },
]

export default function KvmDocsPage() {
  return (
    <main className="px-auto w-full px-4 py-10 sm:px-6 lg:px-8 flex justify-center bg-black">
  
      <div className="space-y-8 max-w-6xl">
        <section className="text-center shadow-xl shadow-black/5">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-tight text-foreground">
              KVM & Linux beginner guide
            </p>
            <p className="max-w-3xl mx-auto text-sm leading-7 text-white/70 sm:text-base">
              Everything you need to know about the QEMU Debian 13 VM, from deployment to security hardening. This guide covers templates, SSH setup, system administration, and essential Linux commands.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" /> Templates and visibility
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The server creation wizard shows only visible templates that are allowed for your plan and portal. Hidden templates exist in the panel but are not shown in the public apps view. The template list below represents what you will see when creating a new server.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          {TEMPLATE_CARDS.map((template) => (
            <div key={template.name} className="bg-white/10 p-4">
              <p className="text-base font-semibold text-foreground">{template.name}</p>
              <p className="mt-1 text-[16px] leading-7 text-white/70">{template.description}</p>
            </div>
          ))}
        </section>

        <p className="text-sm text-white/50 mt-3">
          Template availability depends on your plan. Node administrators can hide or show templates per portal. If a template you expect is missing, contact your panel administrator.
        </p>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" /> Deploying the Debian 13 VM
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The QEMU - Debian 13 VM is the panel's full Linux virtual machine option. It provisions a Debian 13 (Trixie) cloud image, forwards SSH to the main allocation port, and gives you full root-level access. Unlike container-based templates, this VM runs its own kernel and provides complete isolation.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">Step-by-step deployment</h3>
          <ol className="mt-1 list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>Open <b>Servers</b> from the dashboard and click <b>New Server</b>.</li>
            <li>Select the <b>QEMU - Debian 13 VM</b> template from the list.</li>
            <li>Give your server a descriptive name so you can identify it later.</li>
            <li>Choose an available node. If multiple nodes exist, pick the one closest to your location or with the most free resources.</li>
            <li>Set CPU cores, RAM, and disk space. Do not exceed your plan limits. For a basic web server, 2 CPU cores and 2 GB RAM is a good starting point.</li>
            <li>Click <b>Deploy</b>. The panel will provision the VM, which typically takes 30-90 seconds depending on the node load.</li>
            <li>Once the server shows as <b>Running</b>, open the server details page to find your primary allocation (IP and port) for SSH access.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">Panel features for KVM</h3>
          <ul className="mt-1 text-[16px] leading-10 text-white/70">
            <li><b>Startup details:</b> The server info panel shows the primary allocation with IP address and SSH port. Use these to connect.</li>
            <li><b>Firewall:</b> Forward ports from the public IP to internal VM ports. For example, forward port 80 to your VM's port 80 for a web server. Only forwarded ports are reachable from the internet.</li>
            <li><b>Backups:</b> Create backups before making significant changes. Backups capture the full VM disk state and can be restored from the panel.</li>
            <li><b>Snapshots:</b> Snapshots are not supported in this panel configuration. Use backups instead for point-in-time recovery.</li>
            <li><b>Console access:</b> The web console provides direct access to the VM even when SSH is broken. Use it for recovery, password resets, or network troubleshooting.</li>
            <li><b>Power controls:</b> Start, stop, restart, and force stop your VM from the server card or detail page.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> First steps after deployment
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            When you first connect to your Debian 13 VM, follow these steps to secure it before installing any services.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">1. Update the system</h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Always start with a full system update to get the latest security patches.
          </p>
          <div className="bg-white/10 p-4 mt-3">
            <code className="text-sm text-white/90">apt update && apt upgrade -y</code>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">2. Create a non-root user</h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Running as root is dangerous. Create a regular user with sudo access for daily operations.
          </p>
          <div className="bg-white/10 p-4 mt-3 space-y-2">
            <code className="text-sm text-white/90 block">adduser myuser</code>
            <code className="text-sm text-white/90 block">usermod -aG sudo myuser</code>
          </div>
          <p className="mt-3 text-sm text-white/50">Replace <code>myuser</code> with your preferred username. You will be prompted to set a password and optional contact information.</p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">3. Set up SSH key authentication</h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            SSH keys are more secure than passwords. Generate a key pair on your local machine and add the public key to your VM.
          </p>
          <div className="bg-white/10 p-4 mt-3 space-y-2">
            <p className="text-sm text-white/50 mb-2">On your local machine (not the VM):</p>
            <code className="text-sm text-white/90 block">ssh-keygen -t ed25519 -C "your@email.com"</code>
            <p className="text-sm text-white/50 mb-2 mt-4">Copy the public key to your VM:</p>
            <code className="text-sm text-white/90 block">ssh-copy-id -p PORT myuser@YOUR_IP</code>
            <p className="text-sm text-white/50 mb-2 mt-4">Or manually add it:</p>
            <code className="text-sm text-white/90 block">mkdir -p ~/.ssh && chmod 700 ~/.ssh</code>
            <code className="text-sm text-white/90 block">{"echo \"your-public-key\" >> ~/.ssh/authorized_keys"}</code>
            <code className="text-sm text-white/90 block">chmod 600 ~/.ssh/authorized_keys</code>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">4. Harden SSH configuration</h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Disable password authentication and root login over SSH to prevent brute-force attacks.
          </p>
          <div className="bg-white/10 p-4 mt-3 space-y-2">
            <code className="text-sm text-white/90 block">sudo nano /etc/ssh/sshd_config</code>
            <p className="text-sm text-white/50 mt-3">Set these values:</p>
            <code className="text-sm text-white/90 block">PermitRootLogin no</code>
            <code className="text-sm text-white/90 block">PasswordAuthentication no</code>
            <code className="text-sm text-white/90 block">PubkeyAuthentication yes</code>
            <p className="text-sm text-white/50 mt-3">Then restart SSH:</p>
            <code className="text-sm text-white/90 block">sudo systemctl restart sshd</code>
          </div>
          <p className="mt-3 text-sm text-white/50">Warning: Test your SSH key connection in a separate terminal before closing your current session. If something is wrong, you could lock yourself out.</p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">5. Enable the firewall</h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            UFW (Uncomplicated Firewall) is the easiest way to manage firewall rules on Debian.
          </p>
          <div className="bg-white/10 p-4 mt-3 space-y-2">
            <code className="text-sm text-white/90 block">sudo apt install ufw -y</code>
            <code className="text-sm text-white/90 block">sudo ufw allow ssh</code>
            <code className="text-sm text-white/90 block">sudo ufw allow 80/tcp</code>
            <code className="text-sm text-white/90 block">sudo ufw allow 443/tcp</code>
            <code className="text-sm text-white/90 block">sudo ufw enable</code>
            <code className="text-sm text-white/90 block">sudo ufw status</code>
          </div>
          <p className="mt-3 text-sm text-white/50">Only open ports you actually need. Each open port is a potential attack surface. Remember to also configure port forwarding in the panel's Firewall tab for any services you want accessible from the internet.</p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Network className="h-5 w-5 text-primary" /> Networking and port forwarding
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Understanding how networking works in the panel is critical. Your VM has an internal network, and the panel's firewall acts as a gateway.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">How port forwarding works</h3>
          <ul className="mt-1 text-[16px] leading-10 text-white/70">
            <li><b>Primary allocation:</b> The main port assigned to your server. SSH is forwarded here by default.</li>
            <li><b>Additional allocations:</b> You can add more ports from the Firewall tab. Each maps a public port to an internal VM port.</li>
            <li><b>Protocol selection:</b> Choose TCP, UDP, or both depending on your service. Web servers use TCP. Some game servers need UDP.</li>
            <li><b>Internal vs external:</b> The public port (what users connect to) can differ from the internal port (what your service listens on). For example, you can forward public port 8080 to internal port 80.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">Common port mappings</h3>
          <div className="grid gap-4 sm:grid-cols-2 mt-3">
            <div className="bg-white/10 p-4">
              <p className="text-base font-semibold text-foreground">Web server (HTTP/HTTPS)</p>
              <p className="mt-1 text-[16px] leading-7 text-white/70">Forward 80 to 80, 443 to 443 (TCP)</p>
            </div>
            <div className="bg-white/10 p-4">
              <p className="text-base font-semibold text-foreground">Minecraft server</p>
              <p className="mt-1 text-[16px] leading-7 text-white/70">Forward 25565 to 25565 (TCP)</p>
            </div>
            <div className="bg-white/10 p-4">
              <p className="text-base font-semibold text-foreground">SSH access</p>
              <p className="mt-1 text-[16px] leading-7 text-white/70">Forward primary allocation to 22 (TCP)</p>
            </div>
            <div className="bg-white/10 p-4">
              <p className="text-base font-semibold text-foreground">Database (remote)</p>
              <p className="mt-1 text-[16px] leading-7 text-white/70">Forward 3306 to 3306 (TCP) — use with caution</p>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" /> Essential Linux commands
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            These are the commands you will use most often. Practice them until they become second nature.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Directory navigation</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>pwd</code> — show current directory</p>
            <p className="text-[16px] leading-7 text-white/70"><code>ls -la</code> — list all files with details</p>
            <p className="text-[16px] leading-7 text-white/70"><code>cd /path/to/dir</code> — change directory</p>
            <p className="text-[16px] leading-7 text-white/70"><code>cd ..</code> — go up one level</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">File operations</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>cp source dest</code> — copy files</p>
            <p className="text-[16px] leading-7 text-white/70"><code>mv source dest</code> — move or rename</p>
            <p className="text-[16px] leading-7 text-white/70"><code>rm file</code> — delete a file</p>
            <p className="text-[16px] leading-7 text-white/70"><code>rm -rf dir</code> — delete a directory</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">File editing</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>nano file</code> — simple text editor (beginner-friendly)</p>
            <p className="text-[16px] leading-7 text-white/70"><code>vim file</code> — powerful editor (steeper learning curve)</p>
            <p className="text-[16px] leading-7 text-white/70"><code>cat file</code> — display file contents</p>
            <p className="text-[16px] leading-7 text-white/70"><code>tail -f file</code> — follow log output in real time</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Package management</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>apt update</code> — refresh package lists</p>
            <p className="text-[16px] leading-7 text-white/70"><code>apt install pkg</code> — install a package</p>
            <p className="text-[16px] leading-7 text-white/70"><code>apt remove pkg</code> — remove a package</p>
            <p className="text-[16px] leading-7 text-white/70"><code>apt autoremove</code> — clean unused dependencies</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Permissions</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>chmod 755 file</code> — set file permissions</p>
            <p className="text-[16px] leading-7 text-white/70"><code>chown user:group file</code> — change ownership</p>
            <p className="text-[16px] leading-7 text-white/70"><code>sudo command</code> — run as root</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Process management</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>ps aux</code> — list running processes</p>
            <p className="text-[16px] leading-7 text-white/70"><code>kill PID</code> — stop a process</p>
            <p className="text-[16px] leading-7 text-white/70"><code>top</code> or <code>htop</code> — live process monitor</p>
            <p className="text-[16px] leading-7 text-white/70"><code>systemctl status svc</code> — check service status</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-primary" /> Managing services
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Most services on Debian are managed with systemd. Here is how to control them.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <div className="bg-white/10 p-4 mt-3 space-y-2">
            <code className="text-sm text-white/90 block">sudo systemctl start nginx</code>
            <code className="text-sm text-white/90 block">sudo systemctl stop nginx</code>
            <code className="text-sm text-white/90 block">sudo systemctl restart nginx</code>
            <code className="text-sm text-white/90 block">sudo systemctl status nginx</code>
            <code className="text-sm text-white/90 block">sudo systemctl enable nginx</code>
            <code className="text-sm text-white/90 block">sudo systemctl disable nginx</code>
          </div>
          <p className="mt-3 text-sm text-white/50">Use <code>enable</code> to start a service automatically on boot. Use <code>disable</code> to prevent auto-start. Always check status after starting a service to confirm it is running without errors.</p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" /> Monitoring and troubleshooting
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            When something goes wrong, these tools help you find the problem.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Check resource usage</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>htop</code> — interactive CPU/RAM monitor</p>
            <p className="text-[16px] leading-7 text-white/70"><code>df -h</code> — disk space usage</p>
            <p className="text-[16px] leading-7 text-white/70"><code>free -h</code> — memory usage</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Check logs</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>journalctl -u service</code> — service logs</p>
            <p className="text-[16px] leading-7 text-white/70"><code>journalctl -f</code> — follow all logs live</p>
            <p className="text-[16px] leading-7 text-white/70"><code>dmesg | tail</code> — kernel messages</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Network diagnostics</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>ss -tlnp</code> — list listening ports</p>
            <p className="text-[16px] leading-7 text-white/70"><code>curl -I http://localhost</code> — test HTTP response</p>
            <p className="text-[16px] leading-7 text-white/70"><code>ping host</code> — test connectivity</p>
          </div>
          <div className="bg-white/10 p-4">
            <p className="text-base font-semibold text-foreground">Common fixes</p>
            <p className="mt-1 text-[16px] leading-7 text-white/70"><code>sudo apt --fix-broken install</code> — repair packages</p>
            <p className="text-[16px] leading-7 text-white/70"><code>sudo systemctl daemon-reload</code> — reload service configs</p>
            <p className="text-[16px] leading-7 text-white/70"><code>sudo reboot</code> — restart the VM</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">Example: Setting up a web server</h2>
          <ol className="mt-1 list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>SSH into your Debian 13 VM as your non-root user.</li>
            <li>Install Nginx: <code>sudo apt install nginx -y</code></li>
            <li>Start and enable it: <code>sudo systemctl enable --now nginx</code></li>
            <li>Open the panel Firewall tab and forward port 80 to port 80 (TCP).</li>
            <li>Test by visiting <code>http://YOUR_IP</code> in your browser. You should see the Nginx welcome page.</li>
            <li>Place your website files in <code>/var/www/html</code> or configure a virtual host in <code>/etc/nginx/sites-available/</code>.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">Example: Installing Node.js for a custom app</h2>
          <ol className="mt-1 list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>Install NodeSource repository: <code>curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -</code></li>
            <li>Install Node.js: <code>sudo apt install -y nodejs</code></li>
            <li>Verify: <code>node -v</code> and <code>npm -v</code></li>
            <li>Clone your app: <code>git clone https://github.com/your/repo.git && cd repo</code></li>
            <li>Install dependencies: <code>npm install</code></li>
            <li>Start your app: <code>npm start</code> or use PM2 for process management: <code>npm install -g pm2 && pm2 start app.js</code></li>
            <li>Forward the app port in the panel Firewall tab so it is accessible from the internet.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-10 text-white/70">
            For general server controls and troubleshooting, see <Link href="/docs/server-management" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Server management</Link>. For all visible app templates and deployment workflows, see <Link href="/docs/deploying-apps" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Deploying apps</Link>.
          </p>
        </section>
      </div>
    </main>
  )
}
