import Link from "next/link"
import { Rocket, Info, Server, Code, Database, Globe } from "lucide-react"
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur"
import { Menu } from "@/app/landing/_components/_custom/Menu"

const TEMPLATES = [
  { name: "AIO", description: "Java 21, Node.js, Go, Rust, .NET SDK and other dev/runtime tools pre-installed. Ideal for developers who need multiple languages available.", category: "Developer" },
  { name: "BungeeCord", description: "Minecraft proxy for connecting multiple servers into a single network. Players connect to BungeeCord and are routed to backend servers.", category: "Game Server" },
  { name: "Code-Server", description: "Run VS Code in the browser for remote development. Access your code from anywhere with a full IDE experience.", category: "Developer" },
  { name: "Minio S3", description: "S3-compatible object storage server. Use it for backups, file hosting, or as storage for applications that support the S3 API.", category: "Service" },
  { name: "Paper", description: "High-performance Minecraft server fork with plugin support, optimizations, and a large ecosystem. The most popular choice for Minecraft servers.", category: "Game Server" },
  { name: "QEMU - Debian 13 VM", description: "Full Debian 13 (Trixie) virtual machine using QEMU/KVM. Complete isolation, root access, and the ability to run anything. See the KVM guide for setup details.", category: "Virtual Machine" },
  { name: "Velocity", description: "Modern Minecraft proxy designed for speed and flexibility. Faster than BungeeCord with better security and a modern plugin API.", category: "Game Server" },
]

export default function DeployingAppsDocsPage() {
  return (
    <main className="px-auto w-full px-4 py-10 sm:px-6 lg:px-8 flex justify-center bg-black">
      <GradualBlurMemo
        target="page"
        position="top"
        height="13rem"
        strength={2}
        divCount={5}
        curve="bezier"
        exponential
        opacity={1}
      />
      <Menu
        customMenu={[
          { label: "Getting Started", href: "/docs/getting-started" },
          { label: "Server Management", href: "/docs/server-management" },
          { label: "KVM Guide", href: "/docs/kvm" },
          { label: "Deploying Apps", href: "/docs/deploying-apps" },
          { label: "Sunset Policy", href: "/docs/sunset" },
          { label: "Support", href: "/docs/support" },
        ]}
        customCTA={{ label: "Back", href: "/docs" }}
      />
      <div className="space-y-8 max-w-6xl mt-20">
        <section className="text-center shadow-xl shadow-black/5 mt-10">
          <div className="">
            <p className="text-[clamp(2.5rem,8vw,6.5rem)] leading-[0.95] font-semibold tracking-tight text-foreground">
              Deploy applications and game servers
            </p>
            <p className="max-w-3xl mx-auto text-sm leading-7 text-white/70 sm:text-base">
              A complete guide to every visible template in the app wizard, how to choose the right one for your needs, and step-by-step deployment workflows for common use cases.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" /> Available templates
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The panel shows only visible templates that are allowed by your plan and portal configuration. Hidden templates exist in the system but are not shown in the public apps view. Template availability is controlled by node administrators and may vary between instances.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" /> Game server templates
          </h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            These templates are pre-configured for specific game servers. They include the correct startup commands, default configurations, and required dependencies.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          {TEMPLATES.filter(t => t.category === "Game Server").map((template) => (
            <div key={template.name} className="bg-white/10 p-4">
              <p className="text-base font-semibold text-foreground">{template.name}</p>
              <p className="mt-1 text-[16px] leading-7 text-white/70">{template.description}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Code className="h-5 w-5 text-primary" /> Developer tools
          </h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Templates designed for development work, testing, and running custom applications.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          {TEMPLATES.filter(t => t.category === "Developer").map((template) => (
            <div key={template.name} className="bg-white/10 p-4">
              <p className="text-base font-semibold text-foreground">{template.name}</p>
              <p className="mt-1 text-[16px] leading-7 text-white/70">{template.description}</p>
            </div>
          ))}
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" /> Service templates
          </h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Infrastructure services you can deploy alongside your applications.
          </p>
        </section>

        <section className="bg-white/10 p-4 mt-15">
          <p className="text-base font-semibold text-foreground">Minio S3</p>
          <p className="mt-1 text-[16px] leading-7 text-white/70">S3-compatible object storage server. Use it for backups, file hosting, or as storage for applications that support the S3 API.</p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" /> Virtual machine
          </h3>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Full VM template for when you need complete control over the operating system.
          </p>
        </section>

        <section className="bg-white/10 p-4 mt-15">
          <p className="text-base font-semibold text-foreground">QEMU - Debian 13 VM</p>
          <p className="mt-1 text-[16px] leading-7 text-white/70">Full Debian 13 (Trixie) virtual machine using QEMU/KVM. Complete isolation, root access, SSH, and the ability to install and run anything. This is the most flexible option but requires more Linux knowledge. See the <Link href="/docs/kvm" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">KVM guide</Link> for deployment, security hardening, and essential commands.</p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Choosing the right template
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Not sure which template to pick? Use this decision guide.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">I want a Minecraft server</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Use <b>Paper</b> for a single server with plugins. Use <b>BungeeCord</b> or <b>Velocity</b> if you want to connect multiple servers into a network. Velocity is the modern choice with better performance.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">I need a database</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Use the built-in <b>Databases</b> tab on any server for MySQL/MariaDB. For a standalone database server, deploy the <b>MariaDB 10.3</b> template. For web-based management, add <b>phpMyAdmin</b>.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">I want to code remotely</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Deploy <b>Code-Server</b> for a browser-based VS Code experience. Or use <b>AIO</b> if you prefer SSH-based development with multiple languages pre-installed.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">I need full control</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Deploy the <b>QEMU - Debian 13 VM</b>. This gives you a complete Linux machine where you can install anything, configure networking, run custom services, and manage everything via SSH.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">I need object storage</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Deploy <b>Minio S3</b> for S3-compatible storage. Use it for backups, media files, or as a storage backend for applications that support the S3 API.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">I want to host a Garry's Mod or Hytale server</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Use the <b>Garrys Mod</b> or <b>Hytale</b> template respectively. These are pre-configured with the correct startup commands and default settings.</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Deployment workflow
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The deployment process is the same for all templates. Here is the standard workflow.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ol className="list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>Open <b>Servers</b> from the dashboard and click <b>New Server</b>.</li>
            <li>Select your desired template from the wizard. If you do not see the template you need, it may be hidden for your plan or not available on your selected node.</li>
            <li>Choose an available node. If multiple nodes exist, pick the one with the most free resources or closest to your location.</li>
            <li>Set a descriptive server name. This helps you identify the server later.</li>
            <li>Allocate resources (CPU, RAM, disk). Stay within your plan limits. When in doubt, start small and increase later if needed.</li>
            <li>Click <b>Deploy</b> and wait for provisioning. The status will show "Installing" and then change to "Running" when complete.</li>
            <li>Open the server details to access the console, files, startup settings, and other tabs.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Environment and startup configuration
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            After deployment, the Startup tab is where you customize how your server launches. This is critical for getting your server to work correctly.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li><b>Startup command:</b> The command that runs when the server starts. For game servers, this is usually pre-configured. For custom apps, you set it yourself.</li>
            <li><b>Environment variables:</b> Key-value pairs that configure your server at launch. Common variables include MAX_PLAYERS, SERVER_PORT, JAVA_VERSION, and memory limits. Each template exposes different variables.</li>
            <li><b>Docker image:</b> The base image used to run your server. Most templates use a specific image optimized for that workload. Changing the image may break your server unless you know what you are doing.</li>
            <li><b>Changes take effect on restart:</b> After modifying startup settings, you must restart the server for changes to apply. Use the Restart button on the server card or detail page.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Example: Deploying a Node.js web app
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            This walkthrough shows how to deploy a custom Node.js application using the Debian 13 VM.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ol className="list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>Deploy the <b>QEMU - Debian 13 VM</b> template with at least 2 CPU cores and 2 GB RAM.</li>
            <li>SSH into the VM using the primary allocation port shown in the server details.</li>
            <li>Update the system: <code>sudo apt update && sudo apt upgrade -y</code></li>
            <li>Install Node.js from NodeSource: <code>curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -</code> then <code>sudo apt install -y nodejs</code></li>
            <li>Verify the installation: <code>node -v</code> and <code>npm -v</code></li>
            <li>Clone your application: <code>git clone https://github.com/your/repo.git && cd repo</code></li>
            <li>Install dependencies: <code>npm install</code></li>
            <li>Set environment variables if needed: <code>export PORT=3000</code> or create a <code>.env</code> file.</li>
            <li>Start the app: <code>npm start</code> or use PM2 for production: <code>npm install -g pm2 && pm2 start app.js --name myapp</code></li>
            <li>Go to the panel Firewall tab and forward a public port to port 3000 (or whatever port your app uses).</li>
            <li>Test by visiting <code>http://YOUR_IP:FORWARDED_PORT</code> in your browser.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Example: Setting up a Minecraft server network
          </h2>
          <ol className="mt-1 list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>Deploy a <b>Velocity</b> server as your proxy. This will be the entry point for players.</li>
            <li>Deploy one or more <b>Paper</b> servers as your backend game servers.</li>
            <li>On each Paper server, note the primary allocation port from the server details.</li>
            <li>Edit the Velocity configuration (<code>velocity.toml</code>) to add each Paper server as a backend. Use the internal IP and port of each Paper server.</li>
            <li>Configure player forwarding between Velocity and Paper servers by copying the <code>forwarding.secret</code> file.</li>
            <li>Start all servers. Players should connect to the Velocity proxy port, and Velocity will route them to the appropriate backend server.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-10 text-white/70">
            For Linux VM setup, SSH configuration, and security hardening, see the <Link href="/docs/kvm" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">KVM guide</Link>. For server controls, file management, and troubleshooting, see <Link href="/docs/server-management" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Server management</Link>.
          </p>
        </section>
      </div>
    </main>
  )
}
