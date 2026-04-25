import Link from "next/link"
import { Server, ArrowLeft, Info, Cpu, Terminal } from "lucide-react"

const TEMPLATE_CARDS = [
  { name: "AIO", description: "Java 21, Node.js, Go, Rust, .NET SDK and other dev/runtime tools." },
  { name: "BungeeCord", description: "Minecraft proxy for connecting multiple servers together." },
  { name: "Code-Server", description: "Run VS Code in the browser for remote development." },
  { name: "Garrys Mod", description: "Sandbox game server template for Garry's Mod." },
  { name: "Hytale", description: "Template for Hytale server hosting." },
  { name: "MariaDB 10.3", description: "Open-source database server for MySQL-compatible workloads." },
  { name: "Minio S3", description: "S3-compatible object storage server." },
  { name: "Paper", description: "High-performance Minecraft server fork." },
  { name: "phpMyAdmin", description: "Web UI for managing MySQL/MariaDB databases." },
  { name: "QEMU - Debian 13 VM", description: "Full Debian 13 (Trixie) virtual machine using QEMU/KVM." },
  { name: "Velocity", description: "Modern Minecraft proxy for server networks." },
]

export default function KvmDocsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Cpu className="h-4 w-4" /> KVM & Linux beginner guide
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Debian 13 VMs and the available templates</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              This page explains how the panel uses templates, how the QEMU Debian 13 VM works, and how to get started with Linux in the panel.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Info className="h-5 w-5 text-primary" /> Templates and visibility</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              The server creation wizard shows only visible templates that are allowed for your plan and portal. Hidden templates are not shown in the apps view.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {TEMPLATE_CARDS.map((template) => (
              <div key={template.name} className="rounded-3xl border border-border bg-background/80 p-4">
                <p className="text-sm font-semibold text-foreground">{template.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground mt-2">
            The list above reflects the visible templates available in the current panel. Hidden templates are intentionally excluded from the public app list.
          </p>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Server className="h-5 w-5 text-primary" /> Deploying the Debian 13 VM</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              The QEMU - Debian 13 VM is the panel’s full Linux virtual machine option. It provisions a Debian 13 (Trixie) cloud image, forwards SSH to the main allocation port, and gives you full root-level access.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-foreground">Step-by-step deployment</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm leading-7 text-muted-foreground">
              <li>Open <b>Servers</b> and click <b>New Server</b>.</li>
              <li>Select the <b>QEMU - Debian 13 VM</b> template.</li>
              <li>Name your server and choose an available node.</li>
              <li>Set CPU, RAM, disk, and any other allowed resource limits.</li>
              <li>Deploy the server. The panel will provision the VM and show the primary SSH port.</li>
              <li>Connect with SSH using the primary allocation port, or use the web console if needed.</li>
            </ol>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-foreground">Panel features for KVM</h3>
            <ul className="space-y-2 text-sm leading-7 text-muted-foreground">
              <li><b>Startup details:</b> The server info panel shows the primary allocation and SSH connection details.</li>
              <li><b>Firewall:</b> Forward ports from the public IP to VM ports using the Firewall tab.</li>
              <li><b>Backups:</b> Backups are available from the panel. Use them before major changes.</li>
              <li><b>Snapshots:</b> Snapshots are not supported in this panel configuration.</li>
              <li><b>Console access:</b> Use the web console for recovery or when SSH fails.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Terminal className="h-5 w-5 text-primary" /> Linux basics for beginners</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Use these commands after you SSH into your Debian 13 VM.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-sm font-semibold text-foreground">Directory navigation</p>
              <p className="mt-1 text-sm text-muted-foreground"><code>pwd</code>, <code>ls</code>, <code>cd /path</code></p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-sm font-semibold text-foreground">File editing</p>
              <p className="mt-1 text-sm text-muted-foreground"><code>nano file</code> or <code>vim file</code></p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-sm font-semibold text-foreground">Package management</p>
              <p className="mt-1 text-sm text-muted-foreground"><code>apt update</code>, <code>apt upgrade -y</code>, <code>apt install package</code></p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-4">
              <p className="text-sm font-semibold text-foreground">Permissions</p>
              <p className="mt-1 text-sm text-muted-foreground"><code>chmod</code>, <code>chown</code>, <code>sudo</code></p>
            </div>
          </div>

          <div className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p><b>Create a user:</b> <code>adduser myuser</code> and add it to sudoers with <code>usermod -aG sudo myuser</code>.</p>
            <p><b>Install essentials:</b> <code>apt install sudo curl git ufw htop</code>.</p>
            <p><b>Enable the firewall:</b> <code>ufw allow ssh</code>, then <code>ufw enable</code>.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/80 p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            This guide is based on the current EcliPanel template system and QEMU Debian 13 support. For server lifecycle instructions, see <Link href="/docs/server-management" className="font-medium text-primary hover:text-primary/80">Server management</Link>. For visible app templates, see <Link href="/docs/deploying-apps" className="font-medium text-primary hover:text-primary/80">Deploying apps</Link>.
          </p>
        </section>

        <div className="flex justify-start">
          <Link href="/docs" className="inline-flex items-center gap-2 rounded-full border border-border bg-background/80 px-4 py-2 text-sm font-medium text-foreground transition hover:bg-secondary/60">
            <ArrowLeft className="h-4 w-4" /> Back to docs
          </Link>
        </div>
      </div>
    </main>
  )
}
