import Link from "next/link"
import { Sparkles, Info, Shield, User, Palette, BadgeCheck, Activity, ClipboardList, Server, Rocket, CreditCard, LifeBuoy, Bell, Globe, Monitor } from "lucide-react"
import GradualBlurMemo from "@/app/landing/_components/_reacts-bits/GradualBlur"
import { Menu } from "@/app/landing/_components/_custom/Menu"

export default function GettingStartedPage() {
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
              Your first steps with EcliPanel
            </p>
            <p className="max-w-3xl mx-auto text-sm leading-7 text-white/70 sm:text-base">
              This guide walks you through the entire onboarding process, explains every part of the dashboard, and helps you deploy and manage your first server with confidence.
            </p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-40">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" /> What is the dashboard?
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            The EcliPanel dashboard is your central control center. Once logged in, it gives you access to everything: servers, support tickets, account settings, billing, activity history, and workspace tools. The layout is designed to be intuitive — your servers are front and center, with navigation to other sections along the sidebar or top bar depending on your configuration.
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Servers</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Create, manage, and monitor virtual servers. Each server card shows status, resource usage rings, and quick action buttons for start, stop, restart, and console access.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Tickets</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Open support tickets, track replies, and communicate with the support team directly from inside the panel. No need to switch to email or external platforms.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Settings</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Update your profile, configure security (2FA, passkeys), set notification preferences, choose your theme, and manage locale options.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Billing & account</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">View invoices, manage payment methods, review plan limits, and check usage. Available when billing is enabled on your instance.</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Step 1: Register or log in
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Visit the public <Link href="/register" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">register page</Link> to create an account. You will need to provide a valid email address and choose a strong password. If you already have an account, use the <Link href="/login" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">login page</Link> to sign in.
          </p>
          <p className="mt-3 text-[16px] leading-10 text-white/70">
            Some instances may require a registration invite code. If you were given one, enter it during registration. Parent-issued invites are available for users under the minimum age in their region.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Step 2: Verify and secure your account
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            After registration, your account needs verification and security setup before you can use all features.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li><b>Verify your email:</b> Check your inbox for a verification email from EcliPanel. Click the link inside to confirm your address. Without verification, some features may be restricted. If you do not see the email, check your spam folder or request a new one from the login screen.</li>
            <li><b>Enable passkeys or 2FA:</b> Go to <b>Settings → Security</b> to set up two-factor authentication. Passkeys (WebAuthn) are the most secure option — they use your device's biometric or hardware authentication. TOTP (authenticator app) is also supported. We strongly recommend enabling at least one method.</li>
            <li><b>Complete your profile:</b> Go to <b>Settings → Profile</b> to set your display name, email preferences, and any other required account details. Some features may require additional information depending on your region.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Monitor className="h-5 w-5 text-primary" /> Step 3: Explore the main dashboard pages
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Take a few minutes to familiarize yourself with each section of the dashboard.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ul className="text-[16px] leading-10 text-white/70">
            <li><b>Servers:</b> The main server list shows all your active, stopped, and suspended servers. Each card displays the server name, status badge, resource usage rings (CPU, RAM, disk), and quick action buttons. You can filter, search, and sort servers from the top bar.</li>
            <li><b>Tickets:</b> The tickets page lists all your open and closed support conversations. Click any ticket to view the full thread and reply. New tickets can be created with a category so they reach the right team.</li>
            <li><b>Settings:</b> This section has multiple sub-pages: <b>Profile</b> for your personal info, <b>Security</b> for 2FA and passkeys, <b>Notifications</b> for email and in-app alerts, <b>Appearance</b> for theme and font choices, and <b>Locale</b> for language and timezone.</li>
            <li><b>Billing:</b> If enabled on your instance, the billing section shows your current plan, usage against limits, invoices, and payment methods. You can update cards, view billing history, and manage subscriptions here.</li>
            <li><b>Activity:</b> The activity log shows recent actions on your account — logins, server changes, setting updates, and more. Use this to audit what happened and when.</li>
          </ul>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" /> Step 4: Deploy your first server
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            This is where the panel becomes useful. Deploying a server takes just a few clicks.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <ol className="list-decimal list-inside text-[16px] leading-10 text-white/70">
            <li><b>Navigate to Servers:</b> Click the Servers section from the dashboard or sidebar.</li>
            <li><b>Click New Server:</b> This opens the server creation wizard.</li>
            <li><b>Select a template:</b> Choose from the available templates. The list is filtered based on your plan. For a full Linux VM, select <b>QEMU - Debian 13 VM</b>. For game servers, choose Paper, BungeeCord, Velocity, or others. See <Link href="/docs/deploying-apps" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Deploying apps</Link> for details on each template.</li>
            <li><b>Choose a node:</b> Select the host node where your server will run. If you have multiple nodes available, consider geographic location and current resource availability.</li>
            <li><b>Name your server:</b> Give it a descriptive name so you can find it easily later.</li>
            <li><b>Set resources:</b> Assign CPU cores, RAM, and disk space. Stay within your plan limits. If you are unsure, start small — you can often adjust resources later.</li>
            <li><b>Deploy:</b> Click the deploy button. The panel will provision your server, which typically takes 30-90 seconds. You will see the server card appear with a "Running" status when ready.</li>
          </ol>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" /> Step 5: Open and manage your server
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Once your server is running, click on its card to open the detail page. Most servers have the following tabs:
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 mt-15">
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Overview</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Server status, resource graphs, quick actions, and connection details. This is your at-a-glance view of server health.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Console</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Live terminal output and command input. Use this to interact with your server process directly, view logs, and send commands.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Files</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Web-based file manager. Upload, download, edit, rename, and delete files. Essential for managing configs, plugins, and data.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Databases</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Create and manage databases attached to your server. Copy connection strings for your applications and plugins.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Startup</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Configure the startup command, environment variables, and Docker image. This controls how your server launches.</p>
          </div>
          <div className="bg-white/10 p-6">
            <p className="text-lg font-semibold text-foreground">Firewall</p>
            <p className="mt-2 text-[16px] leading-7 text-white/70">Map public ports to internal VM ports. Only forwarded ports are reachable from the internet. Critical for making services accessible.</p>
          </div>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Step 6: Configure notifications
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Go to <b>Settings → Notifications</b> to control what alerts you receive. You can enable or disable notifications for server status changes, ticket replies, billing events, and security alerts. Configure whether you receive them via email, in-app, or both.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" /> Step 7: Customize your experience
          </h2>
          <p className="mt-1 text-[16px] leading-10 text-white/70">
            Go to <b>Settings → Appearance</b> to choose your theme (14 options including dark, light, and color variants), select your preferred font, and adjust the editor font if you use the file manager frequently. Your preferences are saved to your account and sync across devices.
          </p>
        </section>

        <section className="flex flex-col gap-0 mt-15">
          <h2 className="text-2xl font-semibold leading-none text-foreground">
            Next steps
          </h2>
          <ul className="mt-1 text-[16px] leading-10 text-white/70">
            <li><b>Learn server controls:</b> Read <Link href="/docs/server-management" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Server management</Link> for a complete guide to power actions, console usage, file management, and troubleshooting.</li>
            <li><b>Explore templates:</b> See <Link href="/docs/deploying-apps" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Deploying apps</Link> for all available templates and when to use each one.</li>
            <li><b>Try the Debian 13 VM:</b> If you need a full Linux machine, follow the <Link href="/docs/kvm" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">KVM guide</Link> for deployment, SSH setup, and security hardening.</li>
            <li><b>Understand sunset policy:</b> Learn how inactivity affects your account and servers in the <Link href="/docs/sunset" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Sunset policy</Link> guide.</li>
            <li><b>Need help?</b> Visit <Link href="/docs/support" className="font-medium text-indigo-400 hover:text-indigo-500 transition-colors">Support & policies</Link> to learn how to open tickets and find legal resources.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
