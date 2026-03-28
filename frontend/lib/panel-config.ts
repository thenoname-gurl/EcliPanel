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
  passkeyUpdate: "/api/auth/passkeys/:id",
  passkeyDelete: "/api/auth/passkeys/:id",
  // SSH keys
  sshKeys: "/api/ssh-keys",
  sshKeyUpdate: "/api/ssh-keys/:id",
  sshKeyDelete: "/api/ssh-keys/:id",
  // Two-factor (TOTP)
  twoFactorSetup: "/api/auth/2fa/setup",
  twoFactorVerify: "/api/auth/2fa/verify",
  twoFactorDisable: "/api/auth/2fa/disable",
  twoFactorSendEmail: "/api/auth/2fa/send-email",
  twoFactorVerifyLogin: "/api/auth/2fa/verify-login",
  passwordResetRequest: "/api/auth/password-reset/request",
  passwordResetConfirm: "/api/auth/password-reset/confirm",
  verifyEmail: "/api/auth/verify-email",
  resendVerification: "/api/auth/resend-verification",
  hackclubStudentStart: "/api/auth/hackclub/start",
  hackclubStudentCallback: "/api/auth/hackclub/callback",
  githubStudentStart: "/api/auth/github/start",
  githubStudentCallback: "/api/auth/github/callback",

  // Users
  users: "/api/users",
  userRegister: "/api/users/register",
  userDetail: "/api/users/:id",
  userGuide: "/api/users/:id/guide",

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
  nodesAvailable: "/api/nodes/available",
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
  serverFileDownload: "/api/servers/:id/files/download",
  serverFileUpload: "/api/servers/:id/files/upload",
  serverFileWrite: "/api/servers/:id/files/write",
  serverFileDelete: "/api/servers/:id/files/delete",
  serverFileCreateDir: "/api/servers/:id/files/create-directory",
  serverFileArchive: "/api/servers/:id/files/archive",
  serverFileMove: "/api/servers/:id/files/move",
  serverFileRename: "/api/servers/:id/files/rename",
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
  serverFileChmod: "/api/servers/:id/files/chmod",
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
  adminPlanReapplyLimits: "/api/admin/plans/:id/reapply-limits",

  // Admin Orders & Apply Plan
  adminOrders: "/api/admin/orders",
  adminOrderDetail: "/api/admin/orders/:id",
  adminApplyPlan: "/api/admin/users/:id/apply-plan",
  adminUserCurrentPlan: "/api/admin/users/:id/current-plan",
  adminUserCancelPlan: "/api/admin/users/:id/cancel-plan",
  adminUserDeassignStudent: "/api/admin/users/:id/deassign-student",
  adminUserRequireStudentReverify: "/api/admin/users/:id/require-student-reverify",

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
  adminSlowQueries: "/api/admin/slow-queries",
  adminNodes: "/api/admin/nodes",
  adminFraudAlerts: "/api/admin/fraud-alerts",
  publicWings: "/public/wings",
  adminFraudScan: "/api/admin/fraud-scan/:id",
  adminFraudScanAll: "/api/admin/fraud-scan-all",
  adminFraudAction: "/api/admin/fraud-alerts/:id",
  adminFraudBulkDismiss: "/api/admin/fraud-alerts/dismiss",
  adminTicketsBulkArchive: "/api/admin/tickets/archive",
  // API Keys
  apiKeys: "/api/apikeys",
  apiKeysMy: "/api/apikeys/my",
  apiKeyDetail: "/api/apikeys/:id",

  // Tickets
  tickets: "/api/tickets",
  ticketsStats: "/api/tickets/stats",
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
  adminProductUpdates: "/api/admin/product-updates",
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
  infraCodeInstances: "/api/infrastructure/code-instances",
  infraCodeInstancePing: "/api/infrastructure/code-instances/:id/ping",
  infraCodeInstanceStop: "/api/infrastructure/code-instances/:id/stop",
  infraEmail: "/api/infrastructure/email",
  infraEmailDomains: "/api/infrastructure/email/domains",
  infraEmailMailboxes: "/api/infrastructure/email/mailboxes",
  infraEmailForwarding: "/api/infrastructure/email/forwarding",
  infraDns: "/api/infrastructure/dns",
  infraDnsZones: "/api/infrastructure/dns/zones",
  infraDnsRecords: "/api/infrastructure/dns/zones/:id/records",
  organisationDnsZones: "/api/organisations/:id/dns/zones",
  organisationDnsZone: "/api/organisations/:id/dns/zones/:zoneId",
  organisationDnsZoneRecords: "/api/organisations/:id/dns/zones/:zoneId/records",
  organisationDnsZoneRecord: "/api/organisations/:id/dns/zones/:zoneId/records/:recordId",
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
  handles?: string[]
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
    handles: ["@enterprise"],
    features: [
      "Loading from backend..",
    ],
  },
} as const

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
        label: "Code Instances",
        href: "/dashboard/infrastructure/code-instances",
        icon: Server,
        requiredTier: "educational",
      },
      {
        label: "Nodes",
        href: "/dashboard/infrastructure/nodes",
        icon: Network,
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
        requiredTier: "free",
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
    ],
  },
]