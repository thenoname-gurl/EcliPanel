import { Md } from "../_components/md";

const content = `
# Your first steps with EcliPanel

## What is the dashboard?

The EcliPanel dashboard is your central control center. Once logged in, it gives you access to everything: servers, support tickets, account settings, billing, activity history, and workspace tools. The layout is designed to be intuitive — your servers are front and center, with navigation to other sections along the sidebar or top bar depending on your configuration.

| Section | What it does |
|---|---|
| Servers | Create, manage, and monitor virtual servers. Each server card shows status, resource usage rings, and quick action buttons for start, stop, restart, and console access. |
| Tickets | Open support tickets, track replies, and communicate with the support team directly from inside the panel. |
| Settings | Update your profile, configure security (2FA, passkeys), set notification preferences, choose your theme, and manage locale options. |
| Billing & account | View invoices, manage payment methods, review plan limits, and check usage. Available when billing is enabled on your instance. |

## Step 1: Register or log in

Visit the [register page](/register) to create an account. You will need to provide a valid email address and choose a strong password. If you already have an account, use the [login page](/login) to sign in.

Some instances may require a registration invite code. If you were given one, enter it during registration. Parent-issued invites are available for users under the minimum age in their region.

## Step 2: Verify and secure your account

After registration, your account needs verification and security setup before you can use all features.

- **Verify your email** — Check your inbox for a verification email from EcliPanel. Click the link inside to confirm your address. Without verification, some features may be restricted. If you do not see the email, check your spam folder or request a new one from the login screen.
- **Enable passkeys or 2FA** — Go to **Settings → Security** to set up two-factor authentication. Passkeys (WebAuthn) are the most secure option — they use your device's biometric or hardware authentication. TOTP (authenticator app) is also supported. We strongly recommend enabling at least one method.
- **Complete your profile** — Go to **Settings → Profile** to set your display name, email preferences, and any other required account details.

## Step 3: Explore the main dashboard pages

Take a few minutes to familiarize yourself with each section of the dashboard.

- **Servers** — The main server list shows all your active, stopped, and suspended servers. Each card displays the server name, status badge, resource usage rings (CPU, RAM, disk), and quick action buttons. You can filter, search, and sort servers from the top bar.
- **Tickets** — The tickets page lists all your open and closed support conversations. Click any ticket to view the full thread and reply. New tickets can be created with a category so they reach the right team.
- **Settings** — This section has multiple sub-pages: **Profile** for your personal info, **Security** for 2FA and passkeys, **Notifications** for email and in-app alerts, **Appearance** for theme and font choices, and **Locale** for language and timezone.
- **Billing** — If enabled on your instance, the billing section shows your current plan, usage against limits, invoices, and payment methods.
- **Activity** — The activity log shows recent actions on your account — logins, server changes, setting updates, and more.

## Step 4: Deploy your first server

This is where the panel becomes useful. Deploying a server takes just a few clicks.

1. **Navigate to Servers** — Click the Servers section from the dashboard or sidebar.
2. **Click New Server** — This opens the server creation wizard.
3. **Select a template** — Choose from the available templates. The list is filtered based on your plan. For a full Linux VM, select **QEMU - Debian 13 VM**. For game servers, choose Paper, BungeeCord, Velocity, or others. See [Deploying apps](/docs/deploying-apps) for details on each template.
4. **Choose a node** — Select the host node where your server will run. If you have multiple nodes available, consider geographic location and current resource availability.
5. **Name your server** — Give it a descriptive name so you can find it easily later.
6. **Set resources** — Assign CPU cores, RAM, and disk space. Stay within your plan limits. If you are unsure, start small — you can often adjust resources later.
7. **Deploy** — Click the deploy button. The panel will provision your server, which typically takes 30–90 seconds. You will see the server card appear with a "Running" status when ready.

## Step 5: Open and manage your server

Once your server is running, click on its card to open the detail page. Most servers have the following tabs:

| Tab | What it does |
|---|---|
| Overview | Server status, resource graphs, quick actions, and connection details. |
| Console | Live terminal output and command input. Use this to interact with your server process directly. |
| Files | Web-based file manager. Upload, download, edit, rename, and delete files. |
| Databases | Create and manage databases attached to your server. Copy connection strings for your applications. |
| Startup | Configure the startup command, environment variables, and Docker image. |
| Firewall | Map public ports to internal VM ports. Only forwarded ports are reachable from the internet. |

## Step 6: Configure notifications

Go to **Settings → Notifications** to control what alerts you receive. You can enable or disable notifications for server status changes, ticket replies, billing events, and security alerts. Configure whether you receive them via email, in-app, or both.

## Step 7: Customize your experience

Go to **Settings → Appearance** to choose your theme (14 options including dark, light, and color variants), select your preferred font, and adjust the editor font if you use the file manager frequently. Your preferences are saved to your account and sync across devices.

## Next steps

- [Server management](/docs/server-management) — Complete guide to power actions, console usage, file management, and troubleshooting.
- [Deploying apps](/docs/deploying-apps) — All available templates and when to use each one.
- [KVM guide](/docs/kvm) — Full Linux VM deployment, SSH setup, and security hardening.
- [Sunset policy](/docs/sunset) — How inactivity affects your account and servers.
- [Support & policies](/docs/support) — How to open tickets and find legal resources.
`;

export default function Page() {
  return <Md>{content}</Md>;
}
