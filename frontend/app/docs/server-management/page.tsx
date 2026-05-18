import Link from "next/link"
import { Server, Terminal, Activity, Info, FolderOpen, Database, Settings, Shield } from "lucide-react"
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur"
import { Menu } from "@/app/landing/_components/_custom/Menu"

export default function ServerManagementPage() {
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
              Complete guide to managing servers
            </p>
            <p className="max-w-3xl mx-auto text-sm leading-7 text-white/70 sm:text-base">
              Everything about server management in EcliPanel — from the creation wizard to power controls, file management, databases, networking, and troubleshooting common issues.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" /> Server list and cards
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The Servers page is your central hub. It displays every server you have access to, each represented as a card with key information at a glance.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">What each card shows</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Server name, status badge (Running, Stopped, Suspended, Installing), resource usage rings for CPU/RAM/disk, node identifier, and quick action buttons for start, stop, restart, and opening the console.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Quick actions</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Start, stop, restart, and open console directly from the card without navigating to the detail page. These actions are instant and do not require a full page load.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Filtering and sorting</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Use the search bar to find servers by name. Filter by status to show only running or stopped servers. Sort by name, node, or resource usage to organize your view.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Resource limits</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Each card shows your allocated resources vs. what the server is actually using. If a server consistently hits its limits, consider increasing its allocation or moving it to a more powerful node.</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Creating a new server
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The New Server wizard walks you through the entire creation process. Here is what each step does.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ol className="list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li><b>Template selection:</b> Pick the template that matches your workload. The panel only shows templates available to your plan. Game server templates include Paper, BungeeCord, and Velocity. For a full Linux VM, choose QEMU - Debian 13. For development, use AIO or Code-Server. See <Link href="/docs/deploying-apps" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Deploying apps</Link> for a full template breakdown.</li>
            <li><b>Node selection:</b> Choose the host node where your server runs. If you have multiple nodes, consider geographic proximity to your users and current resource availability on each node. Nodes with less free resources may have slower performance.</li>
            <li><b>Server name:</b> Give your server a clear, descriptive name. You will see this name on the server card, in notifications, and in the console header. Good names make it easy to identify servers at a glance.</li>
            <li><b>Resource allocation:</b> Set CPU cores, RAM, and disk space. These values must be within your plan limits. Do not overcommit — if you assign more resources than the node has available, the server will fail to start. For reference, a small Minecraft server needs about 2 CPU cores and 2 GB RAM. A basic web server can run on 1 core and 512 MB.</li>
            <li><b>Deploy:</b> Click deploy to begin provisioning. The panel will create the server container or VM, install the template, and start the server. This typically takes 30-90 seconds. You can watch the status change from "Installing" to "Running" on the server card.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" /> Server detail tabs
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Click on any server card to open its detail page. The available tabs depend on your server type and plan, but most servers include the following.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Overview</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Server status, real-time resource graphs, connection details (IP, ports), and quick action buttons. This is your dashboard for a single server.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Console</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Live terminal output from your server process. You can type commands directly into the console. The console supports ANSI colors, copy/paste, and full-screen mode. Use <code>Ctrl+C</code> to send an interrupt signal.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Files</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Web-based file manager with upload, download, create, edit, rename, and delete operations. Supports drag-and-drop uploads, syntax highlighting for code files, and a built-in code editor. Maximum upload size depends on your plan.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Databases</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Create MySQL/MariaDB databases for your server. Each database gets its own credentials. Copy the host, port, username, and password for use in your application configs. You can also reset passwords and delete databases from here.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Startup</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Configure how your server launches. Set the startup command, environment variables, and Docker image. Some templates expose additional variables like game server settings, Java version, or max players. Changes take effect on the next restart.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Firewall</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Manage port forwarding rules. Map public ports to internal VM ports with TCP, UDP, or both protocols. Only forwarded ports are reachable from the internet. The primary allocation is always forwarded and used for SSH or the main service port.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Settings</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Adjust server-level settings including resource limits, subuser access, mounts, and feature toggles. Some settings may be locked by your plan or node configuration.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Backups</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Create and restore server backups. Backups capture the full server state including files and configuration. The number of backup slots depends on your plan. Always create a backup before making significant changes.</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Server power controls
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Power controls are available on every server. You can access them from the server card or the detail page.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li><b>Start:</b> Boots the server process when it is in a stopped state. The server will begin its startup sequence and show "Running" when ready.</li>
            <li><b>Stop:</b> Sends a graceful shutdown signal (SIGTERM) to the server process. The server has time to save data, close connections, and exit cleanly. Use this whenever possible.</li>
            <li><b>Restart:</b> Stops the server and starts it again in one action. Useful after changing startup configuration, updating plugins, or modifying server files.</li>
            <li><b>Force stop:</b> Sends SIGKILL to immediately terminate the server process. This does not allow the server to save data. Use this only when the normal stop action fails or the server is completely unresponsive.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" /> File management tips
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The file manager is one of the most-used features. Here are some tips to use it effectively.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li><b>Uploading files:</b> Drag and drop files into the file manager, or use the upload button. Large files may take longer depending on your connection speed. If an upload fails, try again or use the console to download files directly via wget or curl.</li>
            <li><b>Editing configs:</b> Click any file to open it in the built-in editor. The editor supports syntax highlighting for common formats (YAML, JSON, properties, INI, etc.). Always save before restarting your server.</li>
            <li><b>File permissions:</b> Some server processes require specific file permissions. If your server cannot read a config file, check its permissions. You can change permissions from the file manager or via the console using <code>chmod</code>.</li>
            <li><b>Back up before editing:</b> Before modifying critical config files, create a backup or copy the file to a safe location. If something breaks, you can restore the original quickly.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" /> Working with databases
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Many server templates support databases. Here is how to set them up.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ol className="list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li>Open your server detail page and go to the <b>Databases</b> tab.</li>
            <li>Click <b>New Database</b> and give it a name. The panel will generate a username and password automatically.</li>
            <li>Copy the connection details: host address, port, database name, username, and password.</li>
            <li>Use these credentials in your application or plugin configuration. For example, in a Minecraft plugin's config.yml, set the database host, port, name, user, and password fields.</li>
            <li>If you need to access the database remotely, you may need to configure additional firewall rules or use a database management tool like phpMyAdmin (available as a template).</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" /> Troubleshooting and best practices
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            When things go wrong, follow this systematic approach to identify and fix the problem.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">Common issues and fixes</h3>
          <ul className="mt-1 text-[16px] leading-10 text-white/70">
            <li><b>Server won't start:</b> Check the console for error messages. Common causes include incorrect startup command, missing files, insufficient resources, or port conflicts. Verify the startup configuration in the Startup tab.</li>
            <li><b>Server crashes on startup:</b> Review the console output for the crash reason. It may be a plugin conflict, incompatible Java version, corrupted world files, or a configuration error. Try starting with a clean config to isolate the issue.</li>
            <li><b>Server is slow or lagging:</b> Check resource usage in the Overview tab. If CPU or RAM is consistently at 100%, increase the allocation if your plan allows it. Also check for plugins or mods that may be causing performance issues.</li>
            <li><b>Cannot connect to server:</b> Verify that the correct port is forwarded in the Firewall tab. Check that the server is actually listening on the expected port using <code>ss -tlnp</code> in the console. Ensure your local firewall is not blocking the connection.</li>
            <li><b>Files not saving:</b> Check file permissions. Some server processes run as a specific user and may not have write access to certain directories. Use the console to check and fix permissions with <code>chmod</code> and <code>chown</code>.</li>
            <li><b>Database connection refused:</b> Verify the database credentials in your application config. Make sure the database server is running. Check that the database host and port are correct. If connecting remotely, ensure the database allows external connections.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h3 className="text-xl font-semibold text-foreground">Best practices</h3>
          <ul className="mt-1 text-[16px] leading-10 text-white/70">
            <li><b>Always back up before changes:</b> Create a backup before updating plugins, modifying configs, or making any significant changes. This gives you a quick recovery path if something breaks.</li>
            <li><b>Monitor resource usage:</b> Keep an eye on CPU, RAM, and disk usage. Set up notifications if available so you are alerted when resources run low.</li>
            <li><b>Keep software updated:</b> Regularly update your server software, plugins, and dependencies. Security patches and performance improvements are released frequently.</li>
            <li><b>Use descriptive names:</b> Name your servers clearly so you can identify them at a glance. Include the purpose, game type, or environment (e.g., "Production Paper MC", "Dev Debian VM").</li>
            <li><b>Document your configs:</b> Keep notes on custom configurations, port mappings, and startup settings. This makes it easier to recreate or migrate servers later.</li>
            <li><b>Open a ticket when stuck:</b> If you cannot resolve an issue after checking the console and configs, open a support ticket with details including server ID, error messages, and steps to reproduce the problem.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <p className="text-[16px] leading-10 text-white/70">
            For onboarding help, see <Link href="/docs/getting-started" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Getting started</Link>. For app deployment strategies and template details, see <Link href="/docs/deploying-apps" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Deploying apps</Link>. For Linux VM setup and security, visit the <Link href="/docs/kvm" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">KVM guide</Link>.
          </p>
        </section>
      </div>
    </main>
  )
}
