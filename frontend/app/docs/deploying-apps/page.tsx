import Link from "next/link"
import { Rocket, ArrowLeft, Info } from "lucide-react"

const TEMPLATES = [
  { name: "AIO", description: "Java 21, Node.js, Go, Rust, .NET SDK and other dev/runtime tools." },
  { name: "BungeeCord", description: "Minecraft proxy for connecting multiple servers together." },
  { name: "Code-Server", description: "Run VS Code in the browser for remote development." },
  { name: "Minio S3", description: "S3-compatible object storage server." },
  { name: "Paper", description: "High-performance Minecraft server fork." },
  { name: "QEMU - Debian 13 VM", description: "Full Debian 13 (Trixie) virtual machine using QEMU/KVM." },
  { name: "Velocity", description: "Modern Minecraft proxy for server networks." },
]

export default function DeployingAppsDocsPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Rocket className="h-4 w-4" /> Deploying apps & game servers
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Deploy applications and game servers</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              This guide explains how to deploy the visible templates in the app wizard, how to choose the right template, and when to use the Debian 13 VM.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Info className="h-5 w-5 text-primary" /> Available templates</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              The panel shows only visible templates that are allowed by your plan. Hidden templates are excluded from the public apps view.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {TEMPLATES.map((template) => (
              <div key={template.name} className="rounded-3xl border border-border bg-background/80 p-4">
                <p className="text-sm font-semibold text-foreground">{template.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{template.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Choosing the right template</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li><b>Game server templates:</b> Use BungeeCord, Paper, Velocity, Hytale, or Garrys Mod for game-specific hosting.</li>
              <li><b>Service templates:</b> Use MariaDB 10.3, Minio S3, or phpMyAdmin for database and storage services.</li>
              <li><b>Developer tools:</b> Use AIO or Code-Server when you need a development/runtime environment.</li>
              <li><b>Custom apps:</b> Use QEMU - Debian 13 VM when you need a full Linux machine for custom software.</li>
            </ul>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-foreground">Deployment workflow</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm leading-7 text-muted-foreground">
              <li>Open <b>Servers</b> and click <b>New Server</b>.</li>
              <li>Select a visible template from the wizard.</li>
              <li>Choose available resources and set a name.</li>
              <li>Deploy the server and wait for provisioning to complete.</li>
              <li>Open the server details to access console, files, startup, and settings.</li>
            </ol>
          </div>

          <div className="space-y-4">
            <h3 className="text-xl font-semibold text-foreground">Environment and startup</h3>
            <p className="text-sm leading-7 text-muted-foreground">
              After deployment, the Startup tab lets you change the command, environment variables, and Docker configuration for the server. This is the main place to customize how your app launches.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Example: Deploying a Node.js app</h2>
            <ol className="list-decimal list-inside space-y-2 text-sm leading-7 text-muted-foreground">
              <li>Deploy the <b>QEMU - Debian 13 VM</b> template.</li>
              <li>SSH into the VM and install Node.js: <code>curl -fsSL https://deb.nodesource.com/setup_20.x | bash -</code> then <code>apt install -y nodejs</code>.</li>
              <li>Clone your repository: <code>git clone https://github.com/your/repo.git</code></li>
              <li>Install dependencies: <code>cd repo &amp;&amp; npm install</code></li>
              <li>Start the app: <code>npm start</code> or use a process manager like <code>pm2</code>.</li>
            </ol>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/80 p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            For Linux and VM details, see <Link href="/docs/kvm" className="font-medium text-primary hover:text-primary/80">KVM guide</Link>. For server controls and troubleshooting, see <Link href="/docs/server-management" className="font-medium text-primary hover:text-primary/80">Server management</Link>.
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
