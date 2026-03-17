/**
 * ============================================
 * ECLIPSE PANEL - CONFIGURATION
 * ============================================
 * 
 * This is the central configuration file for the entire panel.
 * Edit this file to customize navigation, portal tiers, branding,
 * and feature flags. When you wire your backend, update the
 * API endpoints and mock data replacements here.
 * 
 * BACKEND WIRING GUIDE:
 * 1. Replace mock data in each page component with API calls
 * 2. Update API_ENDPOINTS with your actual backend URLs
 * 3. Use the `portalTier` to gate features per user plan
 * 4. Each nav item's `href` maps to an app route
 */

import {
  LayoutDashboard,
  Server,
  Shield,
  CreditCard,
  Cpu,
  Sparkles,
  MessageSquare,
  Ticket,
  Fingerprint,
  Settings,
  Activity,
  Crown,
  Zap,
  Building2,
  Network,
  Mail,
  Globe,
  User,
  type LucideIcon,
} from "lucide-react"

// ============================================
// BRANDING
// ============================================
export const BRAND = {
  name: "EclipseSystems",
  tagline: "Next-Gen Server Management",
  logo: "/assets/icons/logo.png",
  version: process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || "unknown",
  repoUrl: process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/thenoname-gurl/EcliPanel",
} as const

// ============================================
// API ENDPOINTS 
// ============================================
export const API_ENDPOINTS = {
  // Auth
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  session: "/api/auth/session",
  passkeyAuthChallenge: "/api/auth/passkey/authenticate-challenge",
  passkeyAuthenticate: "/api/auth/passkey/authenticate",
  passkeyRegisterChallenge: "/api/auth/passkey/register-challenge",
  passkeyRegister: "/api/auth/passkey/register",
  passkeys: "/api/auth/passkeys",
  passkeyDelete: "/api/auth/passkeys/:id",
  // SSH keys
  sshKeys: "/api/ssh-keys",
  sshKeyDelete: "/api/ssh-keys/:id",
  // Two-factor (TOTP)
  twoFactorSetup: "/api/auth/2fa/setup",
  twoFactorVerify: "/api/auth/2fa/verify",
  twoFactorDisable: "/api/auth/2fa/disable",
  twoFactorSendEmail: "/api/auth/2fa/send-email",
  twoFactorVerifyLogin: "/api/auth/2fa/verify-login",
  verifyEmail: "/api/auth/verify-email",
  resendVerification: "/api/auth/resend-verification",
  githubStudentStart: "/api/auth/github/start",
  githubStudentCallback: "/api/auth/github/callback",

  // Users
  users: "/api/users",
  userRegister: "/api/users/register",
  userDetail: "/api/users/:id",

  // Organisations
  organisations: "/api/organisations",
  organisationDetail: "/api/organisations/:id",
  organisationInvite: "/api/organisations/:id/invite",
  organisationResendInvite: "/api/organisations/:id/invite/:inviteId/resend",
  organisationRevokeInvite: "/api/organisations/:id/invite/:inviteId",
  organisationAddUser: "/api/organisations/:id/add-user",
  organisationUsers: "/api/organisations/:id/users",
  organisationLeave: "/api/organisations/:id/leave",
  organisationAddUserRole: "/api/organisations/:id/users/:userId/role",
  organisationRemoveUser: "/api/organisations/:id/users/:userId",
  organisationAcceptInvite: "/api/organisations/accept-invite",
  organisationServers: "/api/organisations/:id/servers",
  organisationNodes: "/api/organisations/:id/nodes",

  // Roles & Permissions
  roles: "/api/roles",
  roleDetail: "/api/roles/:id",
  rolePermissions: "/api/roles/:id/permissions",
  assignPermission: "/api/roles/:id/permissions",
  userRoles: "/api/users/:id/roles",
  userAvatar: "/api/users/:id/avatar",
  orgAvatar: "/api/organisations/:id/avatar",
  adminOrgMembers: "/api/admin/organisations/:id/members",

  // Servers
  servers: "/api/servers",

  // Nodes
  nodes: "/api/nodes",
  nodeDetail: "/api/nodes/:id",
  nodeGenerateToken: "/api/nodes/generate-token",
  nodeAssignOrg: "/api/nodes/:id/assign-org",
  nodeCreds: "/api/nodes/:id/credentials",
  nodeToken: "/api/nodes/:id/token",
  nodeHeartbeatsAll: "/api/nodes/heartbeats",
  nodeHeartbeats: "/api/nodes/:id/heartbeats",
  serverDetail: "/api/servers/:id",
  serverDelete: "/api/servers/:id",
  serverPower: "/api/servers/:id/power",
  serverTransfer: "/api/servers/:id/transfer",
  serverConsole: "/api/servers/:id/console",
  serverFiles: "/api/servers/:id/files",
  serverFileContents: "/api/servers/:id/files/contents",
  serverFileWrite: "/api/servers/:id/files/write",
  serverFileDelete: "/api/servers/:id/files/delete",
  serverFileCreateDir: "/api/servers/:id/files/create-directory",
  serverFileArchive: "/api/servers/:id/files/archive",
  serverFileMove: "/api/servers/:id/files/move",
  serverDatabases: "/api/servers/:id/databases",
  serverDatabaseCredentials: "/api/servers/:id/databases/:dbId/credentials",
  serverSchedules: "/api/servers/:id/schedules",
  serverScheduleDelete: "/api/servers/:id/schedules/:sid",
  serverAllocations: "/api/servers/:id/allocations",
  serverBackups: "/api/servers/:id/backups",
  serverBackupRestore: "/api/servers/:id/backups/:bid/restore",
  serverBackupDelete: "/api/servers/:id/backups/:bid",
  serverCommands: "/api/servers/:id/commands",
  serverLogs: "/api/servers/:id/logs",
  serverWebsocket: "/api/servers/:id/websocket",
  serverStartup: "/api/servers/:id/startup",
  serverReinstall: "/api/servers/:id/reinstall",
  serverStats: "/api/servers/:id/stats",
  serverStatsHistory: "/api/servers/:id/stats/history",
  serverStatsNode: "/api/servers/:id/stats/node",
  serverConfigEgg: "/api/servers/:id/configuration/egg",
  serverActivity: "/api/servers/:id/activity",
  serverSubusers: "/api/servers/:id/subusers",
  serverSubuserDetail: "/api/servers/:id/subusers/:subId",
  organisationActivity: "/api/organisations/:id/activity",
  serverKvm: "/api/servers/:id/kvm",
  serverVersion: "/api/servers/:id/version",
  serverInstallLogs: "/api/servers/:id/logs/install",

  // Compute
  instances: "/api/compute/instances",
  instanceCreate: "/api/compute/instances/create",

  // Billing
  billing: "/api/billing",
  invoices: "/api/billing/invoices",
  subscribe: "/api/billing/subscribe",
  authDemo: "/api/auth/demo",
  authDemoFinish: "/api/auth/demo/finish",

  // Orders
  orders: "/api/orders",
  orderDetail: "/api/orders/:id",

  // Plans
  plans: "/api/plans",
  planDetail: "/api/plans/:id",
  adminPlans: "/api/admin/plans",
  adminPlanDetail: "/api/admin/plans/:id",

  // Admin Orders & Apply Plan
  adminOrders: "/api/admin/orders",
  adminOrderDetail: "/api/admin/orders/:id",
  adminApplyPlan: "/api/admin/users/:id/apply-plan",
  adminUserCurrentPlan: "/api/admin/users/:id/current-plan",
  adminUserCancelPlan: "/api/admin/users/:id/cancel-plan",

  // SOC
  socOverview: "/api/soc/overview",
  socPlans: "/api/soc/plans",
  socUsageUser: "/api/soc/usage/user/:id",
  socUsageOrg: "/api/soc/usage/org/:id",

  // AI
  aiChat: "/api/ai/chat",
  aiStudio: "/api/ai/studio",
  openaiChat: "/api/ai/openai/v1/chat/completions",
  openaiCompletions: "/api/ai/openai/v1/completions",
  aiModels: "/api/ai/models",
  aiMyModels: "/api/ai/my-models",
  adminAiModels: "/api/admin/ai/models",
  adminUserProfile: "/api/admin/users/:id/profile",
  adminUserAiLink: "/api/admin/users/:id/ai/:linkId",
  adminLogs: "/api/admin/logs",
  adminNodes: "/api/admin/nodes",
  adminFraudAlerts: "/api/admin/fraud-alerts",
  adminFraudScan: "/api/admin/fraud-scan/:id",
  adminFraudScanAll: "/api/admin/fraud-scan-all",
  adminFraudAction: "/api/admin/fraud-alerts/:id",

  // API Keys
  apiKeys: "/api/apikeys",
  apiKeysMy: "/api/apikeys/my",
  apiKeyDetail: "/api/apikeys/:id",

  // Tickets
  tickets: "/api/tickets",
  ticketDetail: "/api/tickets/:id",
  ticketReply: "/api/tickets/:id/reply",
  ticketCreate: "/api/tickets/create",

  // Identity / ID Verification
  identity: "/api/id-verification",
  identityStatus: "/api/id-verification/:id",

  // Account
  account: "/api/account",
  accountUpdate: "/api/account/update",

  // Sessions
  sessions: "/api/sessions/:userId",
  sessionLogout: "/api/sessions/logout",
  sessionLogoutAll: "/api/sessions/logout-all",

  // Deletion requests
  deletionRequests: "/api/deletion-requests",

  // alias for current user
  me: "/api/users/me",

  // Admin
  adminStats: "/api/admin/stats",
  adminUsers: "/api/admin/users",
  adminOrganisations: "/api/admin/organisations",
  adminServers: "/api/admin/servers",
  adminCreateServer: "/api/admin/servers",
  adminDeleteServer: "/api/admin/servers/:id",
  adminServerPower: "/api/admin/servers/:id/power",
  adminServerSuspend: "/api/admin/servers/:id/suspend",
  adminServerUnsuspend: "/api/admin/servers/:id/unsuspend",
  adminSyncFromWings: "/api/admin/servers/sync-from-wings",
  adminSyncToWings: "/api/admin/sync-wings",
  adminTickets: "/api/admin/tickets",
  adminVerifications: "/api/admin/verifications",
  adminDeletions: "/api/admin/deletions",

  // Servers (user-facing)
  serverUpdate: "/api/servers/:id",
  serverSuspend: "/api/servers/:id/suspend",
  serverUnsuspend: "/api/servers/:id/unsuspend",

  // Eggs (server types)
  eggs: "/api/eggs",
  eggDetail: "/api/eggs/:id",
  adminEggs: "/api/admin/eggs",
  adminSettings: "/api/admin/settings",
  panelSettings: "/api/panel/settings",
  adminEggDetail: "/api/admin/eggs/:id",
  adminEggImport: "/api/admin/eggs/import",

  // Enterprise Infrastructure
  infraNodes: "/api/infrastructure/nodes",
  infraNodeDetail: "/api/infrastructure/nodes/:id",
  infraNodeConfig: "/api/infrastructure/nodes/:id/config",
  infraNodeAllocations: "/api/infrastructure/nodes/:id/allocations",
  infraEmail: "/api/infrastructure/email",
  infraEmailDomains: "/api/infrastructure/email/domains",
  infraEmailMailboxes: "/api/infrastructure/email/mailboxes",
  infraEmailForwarding: "/api/infrastructure/email/forwarding",
  infraDns: "/api/infrastructure/dns",
  infraDnsZones: "/api/infrastructure/dns/zones",
  infraDnsRecords: "/api/infrastructure/dns/zones/:id/records",
} as const

// ============================================
// PORTAL TIERS
// ============================================
export type PortalTier = "free" | "paid" | "enterprise" | "educational"

export interface PortalConfig {
  id: PortalTier
  name: string
  description: string
  icon: LucideIcon
  color: string
  maxServers: number
  features: string[]
  handles?: string[] // Enterprise only
}

// MOCK DATA 
export const PORTALS: Record<PortalTier, PortalConfig> = {
  free: {
    id: "free",
    name: "Free Portal",
    description: "Get started with basic server management",
    icon: Zap,
    color: "#10b981",
    maxServers: 2,
    features: [
      "Loading from backend..",
    ],
  },
  paid: {
    id: "paid",
    name: "Pro Portal",
    description: "Advanced features for power users",
    icon: Crown,
    color: "#8b5cf6",
    maxServers: 10,
    features: [
      "Loading from backend..",
    ],
  },
  educational: {
    id: "educational",
    name: "Educational Portal",
    description: "Free access for verified students",
    icon: User,
    color: "#3b82f6",
    maxServers: 5,
    features: [
      "Loading from backend..",
    ],
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise Portal",
    description: "Dedicated infrastructure with custom SLAs",
    icon: Building2,
    color: "#f59e0b",
    maxServers: -1,
    handles: ["@enterprise", "@vip", "@partner"],
    features: [
      "Loading from backend..",
    ],
  },
} as const

// ============================================
// NAVIGATION
// ============================================
export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  requiredTier?: PortalTier
  children?: NavItem[]
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAVIGATION: NavSection[] = [
  {
    title: "Overview",
    items: [
      {
        label: "SOC Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        label: "Account Activity",
        href: "/dashboard/activity",
        icon: Activity,
      },
      {
        label: "Organisations",
        href: "/dashboard/organisations",
        icon: Building2,
      },
      {
        label: "API Keys",
        href: "/dashboard/apikeys",
        icon: Fingerprint,
      },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      {
        label: "Servers",
        href: "/dashboard/servers",
        icon: Server,
      },
      {
        label: "Nodes",
        href: "/dashboard/infrastructure/nodes",
        icon: Network,
        requiredTier: "enterprise",
      },
      {
        label: "DNS",
        href: "/dashboard/infrastructure/dns",
        icon: Globe,
        requiredTier: "enterprise",
      },
      
    ],
  },
  {
    title: "AI",
    items: [
      {
        label: "AI Studio",
        href: "/dashboard/ai-studio",
        icon: Sparkles,
        requiredTier: "paid",
      },
      {
        label: "AI Chat",
        href: "/dashboard/ai-chat",
        icon: MessageSquare,
        requiredTier: "paid",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        label: "Tickets",
        href: "/dashboard/tickets",
        icon: Ticket,
        requiredTier: "paid",
      },
    ],
  },
  {
    title: "Account",
    items: [
      {
        label: "Identity",
        href: "/dashboard/identity",
        icon: Fingerprint,
      },
      {
        label: "Billing",
        href: "/dashboard/billing",
        icon: CreditCard,
      },
      {
        label: "Settings",
        href: "/dashboard/settings",
        icon: Settings,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        label: "Admin Panel",
        href: "/dashboard/admin",
        icon: Shield,
        badge: "Staff",
      },
      {
        label: "Roles",
        href: "/dashboard/roles",
        icon: Shield,
        badge: "Staff",
      },
      {
        label: "Wings",
        href: "/dashboard/wings",
        icon: Building2,
        badge: "Staff",
      },
      {
        label: "SOC",
        href: "/dashboard/soc",
        icon: Activity,
        badge: "Staff",
      },
    ],
  },
]

// ============================================
// MOCK DATA (Replace with API calls)
// ============================================
export const MOCK_USER = {
  id: "usr_1234567890",
  name: "John Doe",
  email: "john.doe@test.local",
  avatar: "",
  tier: "paid" as PortalTier,
  isAdmin: true,
  verified: true,
  createdAt: "2025-01-15T10:30:00Z",
}

export const MOCK_SERVERS = [
  { id: "srv-001", name: "Minecraft SMP", status: "online" as const, game: "Minecraft", cpu: 45, ram: 62, players: "12/20", node: "US-East-1", uptime: "14d 6h" },
  { id: "srv-002", name: "Rust Vanilla", status: "online" as const, game: "Rust", cpu: 78, ram: 85, players: "45/100", node: "US-West-1", uptime: "3d 12h" },
  { id: "srv-003", name: "ARK Survival", status: "offline" as const, game: "ARK", cpu: 0, ram: 0, players: "0/50", node: "EU-West-1", uptime: "0d 0h" },
  { id: "srv-004", name: "Terraria World", status: "online" as const, game: "Terraria", cpu: 15, ram: 30, players: "4/8", node: "US-East-1", uptime: "7d 2h" },
  { id: "srv-005", name: "Valheim Dedicated", status: "starting" as const, game: "Valheim", cpu: 25, ram: 40, players: "0/10", node: "EU-Central-1", uptime: "0d 0h" },
]

export const MOCK_COMPUTE_INSTANCES = [
  { id: "ci-001", name: "Web Server", type: "Standard 2vCPU", status: "running" as const, cpu: 32, ram: 45, costPerHour: 0.05, region: "US-East", ip: "10.0.1.12" },
  { id: "ci-002", name: "Database Node", type: "High Memory 4vCPU", status: "running" as const, cpu: 65, ram: 78, costPerHour: 0.12, region: "US-East", ip: "10.0.1.15" },
  { id: "ci-003", name: "ML Training", type: "GPU A100", status: "stopped" as const, cpu: 0, ram: 0, costPerHour: 0.85, region: "US-West", ip: "10.0.2.8" },
]

export const MOCK_TICKETS = [
  { id: "TK-1024", subject: "Server won't start after update", status: "open" as const, priority: "high" as const, created: "2026-02-25T14:30:00Z", lastReply: "2026-02-26T09:15:00Z" },
  { id: "TK-1022", subject: "Billing discrepancy on invoice #4521", status: "pending" as const, priority: "medium" as const, created: "2026-02-24T10:00:00Z", lastReply: "2026-02-25T16:45:00Z" },
  { id: "TK-1019", subject: "Request for additional RAM allocation", status: "closed" as const, priority: "low" as const, created: "2026-02-20T08:00:00Z", lastReply: "2026-02-21T11:30:00Z" },
  { id: "TK-1015", subject: "DDoS protection inquiry", status: "open" as const, priority: "urgent" as const, created: "2026-02-27T02:00:00Z", lastReply: "2026-02-27T02:30:00Z" },
]

export const MOCK_ACTIVITY = [
  { id: 1, action: "Server started", target: "Minecraft SMP", ip: "192.168.1.100", timestamp: "2026-02-27T10:30:00Z", type: "server" as const },
  { id: 2, action: "Login detected", target: "Panel Access", ip: "203.0.113.45", timestamp: "2026-02-27T10:28:00Z", type: "auth" as const },
  { id: 3, action: "Billing payment processed", target: "$24.99 - Pro Plan", ip: "System", timestamp: "2026-02-27T00:00:00Z", type: "billing" as const },
  { id: 4, action: "Server configuration updated", target: "Rust Vanilla", ip: "192.168.1.100", timestamp: "2026-02-26T22:15:00Z", type: "server" as const },
  { id: 5, action: "2FA enabled", target: "Account Security", ip: "203.0.113.45", timestamp: "2026-02-26T18:00:00Z", type: "security" as const },
  { id: 6, action: "Ticket created", target: "TK-1024", ip: "203.0.113.45", timestamp: "2026-02-25T14:30:00Z", type: "support" as const },
  { id: 7, action: "Compute instance deployed", target: "Web Server", ip: "System", timestamp: "2026-02-25T12:00:00Z", type: "compute" as const },
  { id: 8, action: "API key generated", target: "Production Key", ip: "203.0.113.45", timestamp: "2026-02-24T09:00:00Z", type: "security" as const },
]

// ============================================
// SERVER DETAIL MOCK DATA
// ============================================
export const MOCK_SERVER_FILES = [
  { name: "server.properties", size: "1.2 KB", type: "file" as const, modified: "2026-02-26T10:00:00Z", editable: true },
  { name: "plugins", size: "--", type: "folder" as const, modified: "2026-02-25T18:00:00Z", editable: false },
  { name: "world", size: "--", type: "folder" as const, modified: "2026-02-27T08:00:00Z", editable: false },
  { name: "logs", size: "--", type: "folder" as const, modified: "2026-02-27T10:30:00Z", editable: false },
  { name: "config.yml", size: "4.5 KB", type: "file" as const, modified: "2026-02-24T14:00:00Z", editable: true },
  { name: "whitelist.json", size: "512 B", type: "file" as const, modified: "2026-02-20T09:00:00Z", editable: true },
  { name: "banned-players.json", size: "128 B", type: "file" as const, modified: "2026-02-18T12:00:00Z", editable: true },
  { name: "eula.txt", size: "64 B", type: "file" as const, modified: "2026-01-15T10:00:00Z", editable: true },
  { name: "start.sh", size: "256 B", type: "file" as const, modified: "2026-01-15T10:00:00Z", editable: true },
]

export const MOCK_SERVER_DATABASES = [
  { id: "db-001", name: "s1_main", host: "db-us-east.eclipse.systems", username: "s1_u01", password: "••••••••", connectionString: "mysql://s1_u01:****@db-us-east.eclipse.systems:3306/s1_main" },
  { id: "db-002", name: "s1_permissions", host: "db-us-east.eclipse.systems", username: "s1_u02", password: "••••••••", connectionString: "mysql://s1_u02:****@db-us-east.eclipse.systems:3306/s1_permissions" },
]

export const MOCK_SERVER_SCHEDULES = [
  { id: "sch-001", name: "Daily Restart", cron: "0 4 * * *", enabled: true, lastRun: "2026-02-27T04:00:00Z", nextRun: "2026-02-28T04:00:00Z" },
  { id: "sch-002", name: "Backup World", cron: "0 */6 * * *", enabled: true, lastRun: "2026-02-27T06:00:00Z", nextRun: "2026-02-27T12:00:00Z" },
  { id: "sch-003", name: "Clear Logs", cron: "0 0 * * 0", enabled: false, lastRun: "2026-02-23T00:00:00Z", nextRun: "2026-03-02T00:00:00Z" },
]

export const MOCK_SERVER_ALLOCATIONS = [
  { id: "alloc-001", ip: "45.33.12.100", port: 25565, isPrimary: true, notes: "Main game port" },
  { id: "alloc-002", ip: "45.33.12.100", port: 25566, isPrimary: false, notes: "Query port" },
  { id: "alloc-003", ip: "45.33.12.100", port: 8123, isPrimary: false, notes: "Dynmap" },
]

export const MOCK_SERVER_STARTUP = {
  command: "java -Xms512M -Xmx4096M -jar server.jar --nogui",
  dockerImage: "ghcr.io/eclipse/yolks:java_21",
  variables: [
    { key: "SERVER_JARFILE", value: "server.jar", description: "The name of the server jarfile to run", required: true },
    { key: "MINECRAFT_VERSION", value: "1.21.4", description: "Minecraft version to install", required: true },
    { key: "BUILD_NUMBER", value: "latest", description: "Paper build number", required: false },
    { key: "SERVER_MEMORY", value: "4096", description: "Server memory in MB", required: true },
  ],
}

export const MOCK_CONSOLE_LINES = [
  { time: "10:30:01", message: "[Server] Starting Minecraft server on *:25565", type: "info" as const },
  { time: "10:30:02", message: "[Server] Loading properties", type: "info" as const },
  { time: "10:30:03", message: "[Server] Default game type: SURVIVAL", type: "info" as const },
  { time: "10:30:05", message: "[Server] Preparing level \"world\"", type: "info" as const },
  { time: "10:30:12", message: "[Server] Preparing spawn area: 84%", type: "info" as const },
  { time: "10:30:14", message: "[Server] Done (13.2s)! For help, type \"help\"", type: "success" as const },
  { time: "10:31:00", message: "[Server] Alex_Morgan joined the game", type: "info" as const },
  { time: "10:35:22", message: "[WARN] Can't keep up! Is the server overloaded?", type: "warning" as const },
  { time: "10:40:15", message: "[Server] Steve_Builder joined the game", type: "info" as const },
  { time: "10:45:00", message: "[Server] Saved the game", type: "success" as const },
]

// ============================================
// TICKET CONVERSATION MOCK DATA
// ============================================
export const MOCK_TICKET_MESSAGES: Record<string, {
  ticket: typeof MOCK_TICKETS[number]
  department: string
  assignee: string
  messages: { id: string; sender: string; senderRole: "user" | "staff"; avatar: string; content: string; timestamp: string; attachments?: string[] }[]
}> = {
  "TK-1024": {
    ticket: MOCK_TICKETS[0],
    department: "Technical Support",
    assignee: "James K.",
    messages: [
      { id: "msg-1", sender: "Alex Morgan", senderRole: "user", avatar: "", content: "Hi, my Minecraft SMP server (srv-001) won't start after the latest update. It was working fine yesterday. The console shows a Java error on startup.", timestamp: "2026-02-25T14:30:00Z" },
      { id: "msg-2", sender: "James K.", senderRole: "staff", avatar: "", content: "Hi Alex, thanks for reaching out. I can see the server logs show a compatibility issue with the new Paper build. Let me check the Java version on your node.", timestamp: "2026-02-25T15:00:00Z" },
      { id: "msg-3", sender: "James K.", senderRole: "staff", avatar: "", content: "I've identified the issue - the server needs Java 21 but was running on Java 17. I've updated the Docker image to `ghcr.io/eclipse/yolks:java_21`. Can you try starting the server again?", timestamp: "2026-02-25T15:30:00Z" },
      { id: "msg-4", sender: "Alex Morgan", senderRole: "user", avatar: "", content: "Just tried it - still getting an error. Here's what the console shows:\n\n```\nError: Unable to access jarfile server.jar\n```\n\nIt seems like the jar file might have been deleted during the update?", timestamp: "2026-02-26T09:00:00Z" },
      { id: "msg-5", sender: "James K.", senderRole: "staff", avatar: "", content: "You're right, the update process seems to have removed the server.jar. I've re-downloaded it to your server's files. Please try starting once more and let me know if it works.", timestamp: "2026-02-26T09:15:00Z" },
    ],
  },
  "TK-1022": {
    ticket: MOCK_TICKETS[1],
    department: "Billing",
    assignee: "Sarah L.",
    messages: [
      { id: "msg-1", sender: "Alex Morgan", senderRole: "user", avatar: "", content: "I noticed my latest invoice #4521 shows a charge of $34.99 instead of the usual $24.99 for the Pro plan. I didn't upgrade or add any extra services.", timestamp: "2026-02-24T10:00:00Z" },
      { id: "msg-2", sender: "Sarah L.", senderRole: "staff", avatar: "", content: "Hi Alex, let me look into this for you. I can see invoice #4521 and I'm checking the line items now.", timestamp: "2026-02-24T11:30:00Z" },
      { id: "msg-3", sender: "Sarah L.", senderRole: "staff", avatar: "", content: "I found the issue - there was an accidental charge for a compute instance that was briefly spun up during a system migration. I've issued a refund of $10.00 which should appear within 3-5 business days. Apologies for the confusion!", timestamp: "2026-02-25T16:45:00Z" },
    ],
  },
  "TK-1019": {
    ticket: MOCK_TICKETS[2],
    department: "Sales",
    assignee: "Mike R.",
    messages: [
      { id: "msg-1", sender: "Alex Morgan", senderRole: "user", avatar: "", content: "I'd like to request additional RAM for my Rust server. Currently at 8GB but experiencing lag with 45+ players.", timestamp: "2026-02-20T08:00:00Z" },
      { id: "msg-2", sender: "Mike R.", senderRole: "staff", avatar: "", content: "Hi Alex! Your Pro plan supports up to 16GB RAM per server. I've increased your Rust Vanilla server allocation to 12GB. You can adjust this in your server settings up to 16GB. Would you like me to do anything else?", timestamp: "2026-02-21T11:30:00Z" },
    ],
  },
  "TK-1015": {
    ticket: MOCK_TICKETS[3],
    department: "Security",
    assignee: "Unassigned",
    messages: [
      { id: "msg-1", sender: "Alex Morgan", senderRole: "user", avatar: "", content: "I'm seeing unusual traffic patterns on my Rust server. Player count keeps spiking and the server is becoming unresponsive. Possible DDoS attack?", timestamp: "2026-02-27T02:00:00Z" },
      { id: "msg-2", sender: "James K.", senderRole: "staff", avatar: "", content: "We've detected the abnormal traffic and our DDoS mitigation system has been activated for your server's IP range. We're monitoring the situation. I'll update you shortly.", timestamp: "2026-02-27T02:30:00Z" },
    ],
  },
}

// ============================================
// ENTERPRISE INFRASTRUCTURE MOCK DATA
// ============================================
export const MOCK_ENTERPRISE_NODES = [
  {
    id: "node-ent-001",
    name: "Production Node 1",
    fqdn: "node1.acme.eclipse.systems",
    location: "US-East (Virginia)",
    status: "online" as const,
    memory: { total: 65536, used: 42000 },
    disk: { total: 2048000, used: 1200000 },
    cpu: 68,
    servers: 12,
    maxServers: 25,
    listenPort: 8080,
    sftpPort: 2022,
    daemonBase: "/var/lib/eclipse/volumes",
    memoryOverallocate: 0,
    diskOverallocate: 0,
    uploadLimit: 100,
    allocations: [
      { ip: "45.33.12.100", ports: "25565-25580", assigned: 8 },
      { ip: "45.33.12.101", ports: "27015-27030", assigned: 4 },
    ],
  },
  {
    id: "node-ent-002",
    name: "EU Staging Node",
    fqdn: "node2.acme.eclipse.systems",
    location: "EU-West (Frankfurt)",
    status: "online" as const,
    memory: { total: 32768, used: 18000 },
    disk: { total: 1024000, used: 450000 },
    cpu: 35,
    servers: 6,
    maxServers: 15,
    listenPort: 8080,
    sftpPort: 2022,
    daemonBase: "/var/lib/eclipse/volumes",
    memoryOverallocate: 10,
    diskOverallocate: 5,
    uploadLimit: 100,
    allocations: [
      { ip: "85.10.20.50", ports: "25565-25575", assigned: 6 },
    ],
  },
  {
    id: "node-ent-003",
    name: "Dev/Test Node",
    fqdn: "dev.acme.eclipse.systems",
    location: "US-West (Oregon)",
    status: "maintenance" as const,
    memory: { total: 16384, used: 0 },
    disk: { total: 512000, used: 80000 },
    cpu: 0,
    servers: 0,
    maxServers: 10,
    listenPort: 8080,
    sftpPort: 2022,
    daemonBase: "/var/lib/eclipse/volumes",
    memoryOverallocate: 20,
    diskOverallocate: 10,
    uploadLimit: 50,
    allocations: [],
  },
]

export const MOCK_EMAIL_DOMAINS = [
  { id: "dom-001", domain: "acme.com", verified: true, mx: true, spf: true, dkim: true, mailboxes: 12, createdAt: "2025-06-15T10:00:00Z" },
  { id: "dom-002", domain: "acme.dev", verified: true, mx: true, spf: true, dkim: false, mailboxes: 3, createdAt: "2025-09-20T14:00:00Z" },
  { id: "dom-003", domain: "internal.acme.com", verified: false, mx: false, spf: false, dkim: false, mailboxes: 0, createdAt: "2026-02-25T09:00:00Z" },
]

export const MOCK_MAILBOXES = [
  { id: "mb-001", name: "Admin", email: "admin@acme.com", storage: { used: 2400, total: 5000 }, status: "active" as const, domain: "acme.com" },
  { id: "mb-002", name: "Support", email: "support@acme.com", storage: { used: 1800, total: 5000 }, status: "active" as const, domain: "acme.com" },
  { id: "mb-003", name: "No Reply", email: "noreply@acme.com", storage: { used: 50, total: 1000 }, status: "active" as const, domain: "acme.com" },
  { id: "mb-004", name: "Dev Team", email: "dev@acme.dev", storage: { used: 900, total: 5000 }, status: "active" as const, domain: "acme.dev" },
  { id: "mb-005", name: "Alerts", email: "alerts@acme.com", storage: { used: 4800, total: 5000 }, status: "warning" as const, domain: "acme.com" },
]

export const MOCK_EMAIL_FORWARDING = [
  { id: "fwd-001", from: "info@acme.com", to: "admin@acme.com", enabled: true },
  { id: "fwd-002", from: "sales@acme.com", to: "admin@acme.com", enabled: true },
  { id: "fwd-003", from: "billing@acme.com", to: "support@acme.com", enabled: false },
]

export const MOCK_DNS_ZONES = [
  { id: "zone-001", domain: "acme.com", records: 18, status: "active" as const, dnssec: true, lastModified: "2026-02-26T15:00:00Z" },
  { id: "zone-002", domain: "acme.dev", records: 8, status: "active" as const, dnssec: false, lastModified: "2026-02-20T10:00:00Z" },
  { id: "zone-003", domain: "acme-staging.com", records: 4, status: "pending" as const, dnssec: false, lastModified: "2026-02-27T09:00:00Z" },
]

export const MOCK_DNS_RECORDS: Record<string, { id: string; type: string; name: string; value: string; ttl: number; proxied: boolean }[]> = {
  "zone-001": [
    { id: "rec-001", type: "A", name: "@", value: "45.33.12.100", ttl: 3600, proxied: true },
    { id: "rec-002", type: "A", name: "www", value: "45.33.12.100", ttl: 3600, proxied: true },
    { id: "rec-003", type: "AAAA", name: "@", value: "2600:3c00::f03c:91ff:feae:1234", ttl: 3600, proxied: true },
    { id: "rec-004", type: "CNAME", name: "panel", value: "panel.eclipse.systems", ttl: 3600, proxied: false },
    { id: "rec-005", type: "CNAME", name: "api", value: "api.eclipse.systems", ttl: 3600, proxied: false },
    { id: "rec-006", type: "MX", name: "@", value: "mail.acme.com", ttl: 3600, proxied: false },
    { id: "rec-007", type: "TXT", name: "@", value: "v=spf1 include:eclipse.systems ~all", ttl: 3600, proxied: false },
    { id: "rec-008", type: "TXT", name: "_dmarc", value: "v=DMARC1; p=quarantine; rua=mailto:admin@acme.com", ttl: 3600, proxied: false },
    { id: "rec-009", type: "SRV", name: "_minecraft._tcp", value: "0 5 25565 mc.acme.com", ttl: 3600, proxied: false },
    { id: "rec-010", type: "NS", name: "@", value: "ns1.eclipse.systems", ttl: 86400, proxied: false },
  ],
  "zone-002": [
    { id: "rec-011", type: "A", name: "@", value: "45.33.12.101", ttl: 3600, proxied: true },
    { id: "rec-012", type: "CNAME", name: "www", value: "acme.dev", ttl: 3600, proxied: true },
    { id: "rec-013", type: "MX", name: "@", value: "mail.acme.dev", ttl: 3600, proxied: false },
    { id: "rec-014", type: "TXT", name: "@", value: "v=spf1 include:eclipse.systems ~all", ttl: 3600, proxied: false },
  ],
  "zone-003": [
    { id: "rec-015", type: "A", name: "@", value: "45.33.12.102", ttl: 3600, proxied: false },
    { id: "rec-016", type: "CNAME", name: "www", value: "acme-staging.com", ttl: 3600, proxied: false },
  ],
}
