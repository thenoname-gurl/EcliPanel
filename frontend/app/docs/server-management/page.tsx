import Link from "next/link"
import { Server, ArrowLeft, Terminal, Rocket, Activity, Info } from "lucide-react"

export default function ServerManagementPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="space-y-8">
        <section className="rounded-[2rem] border border-border bg-card/95 p-8 shadow-xl shadow-black/5">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-primary">
              <Server className="h-4 w-4" /> Server management
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Complete guide to managing servers</h1>
            <p className="max-w-3xl text-sm leading-7 text-muted-foreground sm:text-base">
              This page explains every part of server management in EcliPanel, including the creation flow, server cards, server detail tabs, power controls, and troubleshooting.
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground flex items-center gap-2"><Info className="h-5 w-5 text-primary" /> Server list and cards</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              The Servers page shows all your active and stopped servers. Each server card includes the server name, status, a resource summary, and quick action buttons.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Quick actions</p>
              <p className="mt-2 text-sm text-muted-foreground">Start, stop, restart, open console, and open details directly from the server card without a full page load.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Usage summary</p>
              <p className="mt-2 text-sm text-muted-foreground">View CPU, RAM, disk, and network usage at a glance so you can spot overloaded or idle servers quickly.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">New Server wizard</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Use <b>New Server</b> to create a new instance. The wizard guides you through selecting a template, choosing a node, naming the server, and assigning resources.
            </p>
          </div>

          <div className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p><b>Template selection:</b> Pick the visible template you need based on your workload. The panel shows only templates available to your plan.</p>
            <p><b>Node selection:</b> Choose the host node where your server will run. If multiple nodes are available, pick the one that fits your region and resource needs.</p>
            <p><b>Resource allocation:</b> Set CPU, RAM, disk, and any allowed allocations carefully. Do not overcommit beyond your plan or the node’s limits.</p>
            <p><b>Startup configuration:</b> Some templates allow custom startup commands and environment settings during creation.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Server detail tabs</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Once a server is created, open its detail page. Most servers have tabs for Overview, Console, Files, Databases, Startup, Settings, Firewall, and backups or metrics depending on your plan.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Console</p>
              <p className="mt-2 text-sm text-muted-foreground">View live server output and send commands directly to your server process.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Files</p>
              <p className="mt-2 text-sm text-muted-foreground">Upload, download, edit, rename, and delete files for your server. Use this tab to manage configs, plugins, and data.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Databases</p>
              <p className="mt-2 text-sm text-muted-foreground">Create and manage databases attached to your server. Copy connection details for your apps and plugins.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Startup</p>
              <p className="mt-2 text-sm text-muted-foreground">Change the Docker image, startup command, and environment variables used when the server launches.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Settings</p>
              <p className="mt-2 text-sm text-muted-foreground">Adjust server settings, subusers, mounts, resource limits, and allowed access based on the server’s features.</p>
            </div>
            <div className="rounded-3xl border border-border bg-background/80 p-6">
              <p className="text-sm font-semibold text-foreground">Firewall</p>
              <p className="mt-2 text-sm text-muted-foreground">Map public ports to internal VM ports and protocols. Only forwarded ports are reachable from the internet.</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Server power controls</h2>
            <p className="text-sm leading-7 text-muted-foreground">
              Use the server controls to manage the server process safely. The most common actions are Start, Stop, Restart, and Force Stop.
            </p>
          </div>

          <div className="space-y-4 text-sm leading-7 text-muted-foreground">
            <p><b>Start:</b> Boots the server when it is stopped.</p>
            <p><b>Stop:</b> Gracefully shuts the server down, allowing it to save data and exit cleanly.</p>
            <p><b>Restart:</b> Stops and starts the server again, useful after config changes.</p>
            <p><b>Force stop:</b> Immediately kills the server process. Use this only if the normal stop action fails.</p>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-card p-8 space-y-10">
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-foreground">Troubleshooting and best practices</h2>
            <ul className="space-y-3 text-sm leading-7 text-muted-foreground">
              <li><b>Check the console:</b> Start by reviewing the server output for errors during startup or runtime.</li>
              <li><b>Verify startup settings:</b> Confirm the startup command, environment variables, and Docker image are correct.</li>
              <li><b>Manage resources:</b> If the server is slow or unstable, increase CPU, RAM, or disk if your plan allows it.</li>
              <li><b>Backup before changes:</b> Use the backups feature before upgrading or modifying important files.</li>
              <li><b>Use the support page:</b> If you cannot resolve an issue, open a ticket from the dashboard.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-3xl border border-border bg-background/80 p-6">
          <p className="text-sm leading-7 text-muted-foreground">
            For onboarding help, see <Link href="/docs/getting-started" className="font-medium text-primary hover:text-primary/80">Getting started</Link>. For app deployment strategies, see <Link href="/docs/deploying-apps" className="font-medium text-primary hover:text-primary/80">Deploying apps</Link>.
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
