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
  FileText,
  Braces,
  Star,
  Trophy,
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
  health: "/health",
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

  orderInvoice: "/api/orders/:id/invoice",

  // Organisations
  organisations: "/api/organisations",
  organisationDetail: "/api/organisations/:id",
  organisationInvite: "/api/organisations/:id/invite",
  organisationResendInvite: "/api/organisations/:id/invite/:inviteId/resend",
  organisationRevokeInvite: "/api/organisations/:id/invite/:inviteId",
  organisationAddUser: "/api/organisations/:id/add-user",
  organisationUsers: "/api/organisations/:id/users",
  organisationSelect: "/api/organisations/:id/select",
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
  permissions: "/api/permissions",
  userRoles: "/api/users/:id/roles",
  userAvatar: "/api/users/:id/avatar",
  orgAvatar: "/api/organisations/:id/avatar",
  adminOrgMembers: "/api/admin/organisations/:id/members",

  // Servers
  servers: "/api/servers",

  // Nodes
  nodes: "/api/nodes",
  nodesAvailable: "/api/nodes/available",
  nodesMyHealth: "/api/nodes/my-health",
  nodeDetail: "/api/nodes/:id",
  nodeProxmoxStorages: "/api/nodes/:id/proxmox/storages",
  nodeProxmoxStorageContent: "/api/nodes/:id/proxmox/storage/:storage/content",
  nodeProxmoxTemplates: "/api/nodes/:id/proxmox/templates",
  nodeProxmoxIsos: "/api/nodes/:id/proxmox/isos",
  nodeProxmoxLxcTemplates: "/api/nodes/:id/proxmox/lxc-templates",
  // Public
  geoblockPublic: "/public/geoblock",
  contributorsPublic: "/public/contributors",
  nodeGenerateToken: "/api/nodes/generate-token",
  nodeAssignOrg: "/api/nodes/:id/assign-org",
  nodeCreds: "/api/nodes/:id/credentials",
  nodeToken: "/api/nodes/:id/token",
  nodeHeartbeatsAll: "/api/nodes/heartbeats",
  nodeHeartbeats: "/api/nodes/:id/heartbeats",
  nodeMassAllocationChange: "/api/nodes/:id/mass-allocation-change",
  nodeRebootAllServers: "/api/nodes/:id/reboot-all-servers",
  nodeRebootStatus: "/api/nodes/:id/reboot-status/:operationId",
  serverDetail: "/api/servers/:id",
  serverDelete: "/api/servers/:id",
  serverPower: "/api/servers/:id/power",
  // v2 Proxmox endpoints
  serverV2Detail: "/api/servers/v2/:id",
  serverV2Power: "/api/servers/v2/:id/power",
  serverV2Stats: "/api/servers/v2/:id/stats",
  serverV2Config: "/api/servers/v2/:id/configuration",
  serverTransfer: "/api/servers/v1/:id/transfer",
  serverConsole: "/api/servers/v1/:id/console",
  serverFiles: "/api/servers/v1/:id/files",
  serverFileContents: "/api/servers/v1/:id/files/contents",
  serverFileDownload: "/api/servers/v1/:id/files/download",
  serverFileUpload: "/api/servers/v1/:id/files/upload",
  serverFileUploadToken: "/api/servers/v1/:id/files/upload-token",
  serverFileDownloadToken: "/api/servers/v1/:id/files/download-token",
  serverFileWrite: "/api/servers/v1/:id/files/write",
  serverFileDelete: "/api/servers/v1/:id/files/delete",
  serverFileCreateDir: "/api/servers/v1/:id/files/create-directory",
  serverFileArchive: "/api/servers/v1/:id/files/archive",
  serverFileDecompress: "/api/servers/v1/:id/files/decompress",
  serverFileMove: "/api/servers/v1/:id/files/move",
  serverFileRename: "/api/servers/v1/:id/files/rename",
  serverSftpFiles: "/api/servers/v1/:id/sftp/files",
  serverSftpFileContents: "/api/servers/v1/:id/sftp/contents",
  serverSftpFileDownload: "/api/servers/v1/:id/sftp/download",
  serverSftpFileUpload: "/api/servers/v1/:id/sftp/upload",
  serverSftpFileWrite: "/api/servers/v1/:id/sftp/write",
  serverSftpFileDelete: "/api/servers/v1/:id/sftp/delete",
  serverSftpFileCreateDir: "/api/servers/v1/:id/sftp/create-directory",
  serverSftpFileMove: "/api/servers/v1/:id/sftp/move",
  serverSftpFileRename: "/api/servers/v1/:id/sftp/rename",
  serverSftpValidate: "/api/servers/v1/:id/sftp/validate",
  serverSftpFileChmod: "/api/servers/v1/:id/sftp/chmod",
  serverDatabases: "/api/servers/:id/databases",
  serverDatabaseCredentials: "/api/servers/:id/databases/:dbId/credentials",
  serverSchedules: "/api/servers/v1/:id/schedules",
  serverScheduleDelete: "/api/servers/v1/:id/schedules/:sid",
  serverAllocations: "/api/servers/v1/:id/allocations",
  adminServerDedicatedIp: "/api/admin/servers/:id/dedicated-ip",
  serverIpRequest: "/api/servers/v1/:id/ip-request",
  serverBackups: "/api/servers/v1/:id/backups",
  serverBackupRestore: "/api/servers/v1/:id/backups/:bid/restore",
  serverBackupDelete: "/api/servers/v1/:id/backups/:bid",
  serverCommands: "/api/servers/v1/:id/commands",
  serverLogs: "/api/servers/v1/:id/logs",
  serverWebsocket: "/api/servers/v1/:id/websocket",
  serverSftp: "/api/servers/v1/:id/sftp",
  serverReinstall: "/api/servers/v1/:id/reinstall",
  serverStats: "/api/servers/:id/stats",
  serverStatsHistory: "/api/servers/:id/stats/history",
  serverStatsNode: "/api/servers/:id/stats/node",
  serverStatsNodeHistory: "/api/servers/:id/stats/node/history",
  serverFileChmod: "/api/servers/v1/:id/files/chmod",
  serverFileRevisions: "/api/servers/v1/:id/files/revisions",
  serverFileRevisionContent: "/api/servers/v1/:id/files/revisions/:revisionId",
  serverFileRevisionRestore: "/api/servers/v1/:id/files/revisions/:revisionId/restore",
  serverFileLargestDirectories: "/api/servers/v1/:id/files/largest-directories",
  serverFileShares: "/api/servers/v1/:id/files/shares",
  serverFileShareDelete: "/api/servers/v1/:id/files/shares/:shareId",
  publicShare: "/public/share/:token",
  publicShareDownload: "/public/share/:token/download",
  publicShareContent: "/public/share/:token/content",
  publicShareMedia: "/public/share/:token/media",
  serverConfigEgg: "/api/servers/v1/:id/configuration/egg",
  serverActivity: "/api/servers/:id/activity",
  serverSubusers: "/api/servers/:id/subusers",
  serverMounts: "/api/servers/v1/:id/mounts",
  serverSubuserDetail: "/api/servers/:id/subusers/:subId",
  serverSubuserInvites: "/api/subusers/invites",
  serverSubuserInviteAccept: "/api/subusers/invites/:inviteId/accept",
  serverSubuserInviteReject: "/api/subusers/invites/:inviteId/reject",
  mailboxAddress: "/api/mailbox/address",
  mailboxMessages: "/api/mailbox/messages",
  mailboxSent: "/api/mailbox/sent",
  mailboxSend: "/api/mailbox/send",
  mailboxMessageFavorite: "/api/mailbox/messages/:id/favorite",
  mailboxSentFavorite: "/api/mailbox/sent/:id/favorite",
  mailboxNotifications: "/api/mailbox/notifications",
  mailboxNotificationMark: "/api/mailbox/notifications/:id/read",
  mailboxNotificationDelete: "/api/mailbox/notifications/:id",
  mailboxMessageCategories: "/api/mailbox/messages/categories",
  mailboxMessageCategory: "/api/mailbox/messages/:id/category",
  mailboxMessageMark: "/api/mailbox/messages/:id/read",
  mailboxMessageDelete: "/api/mailbox/messages/:id",
  organisationActivity: "/api/organisations/:id/activity",
  organisationInvites: "/api/organisations/invites",
  organisationInviteAccept: "/api/organisations/invites/:inviteId/accept",
  organisationInviteReject: "/api/organisations/invites/:inviteId/reject",
  serverKvm: "/api/servers/v1/:id/kvm",
  serverVersion: "/api/servers/v1/:id/version",
  serverStartup: "/api/servers/v1/:id/startup",
  serverPaperVersions: "/api/servers/v1/:id/paper/versions",
  serverPaperApply: "/api/servers/v1/:id/paper/apply",
  serverVanillaVersions: "/api/servers/v1/:id/versions/vanilla",
  serverVanillaApply: "/api/servers/v1/:id/versions/vanilla/apply",
  serverInstallLogs: "/api/servers/v1/:id/logs/install",

  // Minecraft Player Management
  serverPlayers: "/api/servers/:id/players",
  serverPlayersWhitelist: "/api/servers/:id/players/whitelist",
  serverPlayersWhitelistStatus: "/api/servers/:id/players/whitelist/status",
  serverPlayersWhitelistToggle: "/api/servers/:id/players/whitelist/toggle",
  serverPlayersBan: "/api/servers/:id/players/ban",
  serverPlayersPardon: "/api/servers/:id/players/pardon",
  serverPlayersKick: "/api/servers/:id/players/kick",
  serverPlayersOps: "/api/servers/:id/players/ops",
  serverPlayersOp: "/api/servers/:id/players/op",
  serverPlayersDeop: "/api/servers/:id/players/deop",
  serverPlayersSettings: "/api/servers/:id/players/settings",

  // Minecraft Plugins
  serverPlugins: "/api/servers/:id/plugins",
  serverPluginsSearch: "/api/servers/:id/plugins/search",
  serverPluginsInstall: "/api/servers/:id/plugins/install",
  serverPluginsPreview: "/api/servers/:id/plugins/preview",

  // Tunnel
  tunnels: "/api/tunnel/allocations",
  tunnelDevices: "/api/tunnel/devices",
  tunnelDeviceApprove: "/api/tunnel/device/approve",
  tunnelDeviceDelete: "/api/tunnel/devices/:id/delete",
  tunnelDeviceRegenerateToken: "/api/tunnel/devices/:id/regenerate-token",
  tunnelDevicesCreate: "/api/tunnel/devices",
  tunnelDeviceStart: "/api/tunnel/device/start",
  tunnelDevicePoll: "/api/tunnel/device/poll",
  tunnelClientDownload: "/api/tunnel/client/download",
  tunnelServerDownload: "/api/tunnel/server/download",
  tunnelDeployScript: "/api/tunnel/deploy.sh",

  // Compute
  instances: "/api/compute/instances",
  instanceCreate: "/api/compute/instances/create",

  // Billing
  billing: "/api/billing",
  invoices: "/api/billing/invoices",
  subscribe: "/api/billing/subscribe",
  // Payments
  paymentMethods: "/api/payments/methods",
  orderCheckout: "/api/orders/:id/checkout",
  orderMarkSent: "/api/orders/:id/mark-sent",
  orderPaymentStatus: "/api/orders/:id/payment-status",
  adminPaymentMethods: "/api/admin/payment-methods",
  adminConfirmPayment: "/api/admin/orders/:id/confirm-payment",
  adminRejectPayment: "/api/admin/orders/:id/reject-payment",
  // Orders
  orders: "/api/orders",
  orderDetail: "/api/orders/:id",
  orderCancel: "/api/orders/:id/cancel",

  // Coupons
  couponValidate: "/api/coupons/validate",
  couponRedeem: "/api/coupons/redeem",
  adminCoupons: "/api/admin/coupons",
  adminCouponGenerateRandom: "/api/admin/coupons/generate-random",
  adminCouponDetail: "/api/admin/coupons/:id",

  // Plans
  plans: "/api/plans",
  planDetail: "/api/plans/:id",
  adminPlans: "/api/admin/plans",
  adminPlanDetail: "/api/admin/plans/:id",
  adminPlanReapplyLimits: "/api/admin/plans/:id/reapply-limits",

  // Admin Orders & Apply Plan
  adminOrders: "/api/admin/orders",
  adminOrderDetail: "/api/admin/orders/:id",
  adminOrderInvoice: "/api/admin/orders/:id/invoice",
  adminApplyPlan: "/api/admin/users/:id/apply-plan",
  adminUserCurrentPlan: "/api/admin/users/:id/current-plan",
  adminUserCancelPlan: "/api/admin/users/:id/cancel-plan",
  adminUserDeassignStudent: "/api/admin/users/:id/deassign-student",
  adminUserRequireStudentReverify: "/api/admin/users/:id/require-student-reverify",
  adminUserExportJob: "/api/admin/users/:id/export-job",
  adminUserContributorProfile: "/api/admin/users/:id/contributor-profile",
  adminExportJobs: "/api/admin/export-jobs",
  adminExportJobStatus: "/api/admin/export-jobs/:id",
  adminExportJobDownload: "/api/admin/export-jobs/:id/download",
  adminExportJobShareLink: "/api/admin/export-jobs/:id/share-link",
  adminExportJobDelete: "/api/admin/export-jobs/:id",
  adminDeletionExpedite: "/api/admin/deletions/:id/expedite",
  adminDeletionCancel: "/api/admin/deletions/:id/cancel",

  // Rollouts
  adminRollouts: "/api/admin/rollouts",
  adminRolloutDetail: "/api/admin/rollouts/:id",
  myRollouts: "/api/rollouts",

  // Feedback
  feedbackSubmit: "/api/feedback",
  feedbackCheck: "/api/feedback/check",
  adminFeedback: "/api/admin/feedback",
  adminFeedbackDelete: "/api/admin/feedback/:id",

  // SOC
  socOverview: "/api/soc/overview",
  socPlans: "/api/soc/plans",
  socUsageUser: "/api/soc/usage/user/:id",
  socUsageOrg: "/api/soc/usage/org/:id",

  // ELO
  eloProjects: "/api/elo/projects",
  eloProjectDetail: "/api/elo/projects/:id",
  eloCreateServer: "/api/elo/servers",
  eloVoteNext: "/api/elo/vote/next",
  eloVote: "/api/elo/vote",
  eloLeaderboard: "/api/elo/leaderboard",
  eloDevlogs: "/api/elo/projects/:id/devlogs",
  eloDevlogCreate: "/api/elo/devlogs",
  eloSkipStatus: "/api/elo/projects/:id/skip-status",
  eloSkip: "/api/elo/projects/:id/skip",
  eloMy: "/api/elo/my",
  eloVoteHistory: "/api/elo/vote/history",

  // AI
  aiChat: "/api/ai/chat",
  aiStudio: "/api/ai/studio",
  openaiChat: "/api/ai/openai/v1/chat/completions",
  openaiCompletions: "/api/ai/openai/v1/completions",
  aiModels: "/api/ai/models",
  aiMyModels: "/api/ai/my-models",
  adminAiModels: "/api/admin/ai/models",
  byoaiChat: "/api/ai/byoai/chat",
  byoaiChatCompletions: "/api/ai/byoai/chat/completions",
  byoaiModels: "/api/ai/byoai/models",
  slackConfig: "/api/slack/config",
  slackGithubStart: "/api/slack/github/start",
  slackGithubUnlink: "/api/slack/github",
  adminUserProfile: "/api/admin/users/:id/profile",
  adminUserAiLink: "/api/admin/users/:id/ai/:linkId",
  adminOutboundEmails: "/api/admin/outbound-emails",
  adminLogs: "/api/admin/logs",
  adminSlowQueries: "/api/admin/slow-queries",
  adminGlobalSearch: "/api/admin/search",
  adminNodes: "/api/admin/nodes",
  adminFraudAlerts: "/api/admin/fraud-alerts",
  adminFraudScan: "/api/admin/fraud-scan/:id",
  adminFraudScanAll: "/api/admin/fraud-scan-all",
  adminFraudAction: "/api/admin/fraud-alerts/:id",
  adminFraudBulkDismiss: "/api/admin/fraud-alerts/dismiss",
  adminAntiAbuseIncidents: "/api/admin/antiabuse/incidents",
  adminAntiAbuseIncidentStatus: "/api/admin/antiabuse/incidents/:id/status",
  adminAntiAbuseIncidentsBulkStatus: "/api/admin/antiabuse/incidents/bulk-status",
  adminAntiAbuseIncidentDelete: "/api/admin/antiabuse/incidents/:id",
  adminAntiAbuseIncidentsBulkDelete: "/api/admin/antiabuse/incidents/bulk-delete",
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

  // Applications
  applicationsForms: "/api/applications/forms",
  applicationsMy: "/api/applications/my",
  applicationsSubmit: "/api/applications/forms/:id/submit",
  applicationsSubmitBySlug: "/api/applications/forms/slug/:slug/submit",
  publicApplicationsForms: "/api/public/applications/forms",
  publicApplicationFormBySlug: "/api/public/applications/forms/:slug",
  publicApplicationsSubmit: "/api/public/applications/forms/:id/submit",
  publicApplicationsSubmitBySlug: "/api/public/applications/forms/slug/:slug/submit",
  adminApplicationsForms: "/api/admin/applications/forms",
  adminApplicationForm: "/api/admin/applications/forms/:id",
  adminApplicationInvites: "/api/admin/applications/forms/:id/invites",
  adminApplicationInvite: "/api/admin/applications/invites/:inviteId",
  adminApplicationsSubmissions: "/api/admin/applications/submissions",
  adminApplicationSubmission: "/api/admin/applications/submissions/:id",
  adminApplicationsSubmissionsBulkDelete: "/api/admin/applications/submissions/bulk-delete",

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
  sunsetConfirm: "/api/users/me/sunset-confirm",
  userUpdate: "/api/users/:id",
  userFavorites: "/api/users/me/favorites",
  mailboxFavorites: "/api/users/me/mailbox/favorites",

  // Admin
  adminStats: "/api/admin/stats",
  adminMetrics: "/api/admin/metrics",
  adminMetricsClear: "/api/admin/metrics/clear",
  adminUsers: "/api/admin/users",
  adminUserServerSunset: "/api/admin/users/:id/server-sunset",
  adminUserDocuments: "/api/admin/users/:id/documents",
  adminProductUpdates: "/api/admin/product-updates",
  adminOrganisations: "/api/admin/organisations",
  adminServers: "/api/admin/servers",
  adminCreateServer: "/api/admin/servers",
  adminDeleteServer: "/api/admin/servers/:id",
  adminServerPower: "/api/admin/servers/:id/power",
  adminServerMarkStarted: "/api/admin/servers/:id/mark-started",
  adminServerAbuseReports: "/api/admin/servers/:id/abuse-reports",
  adminServerSuspend: "/api/admin/servers/:id/suspend",
  adminServerUnsuspend: "/api/admin/servers/:id/unsuspend",
  adminMounts: "/api/admin/mounts",
  adminServerMounts: "/api/admin/servers/:id/mounts",
  adminServerMountDelete: "/api/admin/servers/:id/mounts/:mountId",
  adminSyncFromWings: "/api/admin/servers/sync-from-wings",
  adminSyncToWings: "/api/admin/sync-wings",
  adminTickets: "/api/admin/tickets",
  adminVerifications: "/api/admin/verifications",
  adminDeletions: "/api/admin/deletions",
  adminShortUrls: "/api/admin/shorturls",
  adminShortUrlDetail: "/api/admin/shorturls/:id",
  publicShortUrlLookup: "/public/short-url",

  // Servers (user-facing)
  serverUpdate: "/api/servers/:id",
  serverSuspend: "/api/servers/v1/:id/suspend",
  serverUnsuspend: "/api/servers/v1/:id/unsuspend",
  serverSync: "/api/servers/v1/:id/sync",

  // Eggs (server types)
  eggs: "/api/eggs",
  eggDetail: "/api/eggs/:id",
  adminEggs: "/api/admin/eggs",
  adminSettings: "/api/admin/settings",
  panelSettings: "/api/panel/settings",
  publicFeatures: "/api/public/features",
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
    name: "Free Portal (ELO)",
    description: "ELO servers with community voting & resource scaling",
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
    maxServers: 3,
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

export type FeatureFlag = 'registration' | 'billing' | 'ai' | 'dns' | 'ticketing' | 'applications' | 'oauth' | 'tunnels' | 'visualeditor' | 'elo'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  badge?: string
  requiredTier?: PortalTier
  feature?: FeatureFlag
  children?: NavItem[]
}

export interface NavSection {
  title: string
  items: NavItem[]
}

export const NAV_SECTION_I18N_KEYS: Record<string, string> = {
  Overview: "overview",
  Infrastructure: "infrastructure",
  AI: "ai",
  Support: "support",
  Account: "account",
  Administration: "administration",
}

export const NAV_ITEM_I18N_KEYS: Record<string, string> = {
  "SOC Dashboard": "socDashboard",
  "Account Activity": "accountActivity",
  Organisations: "organisations",
  Servers: "servers",
  Mailbox: "mailbox",
  Nodes: "nodes",
  "AI Studio": "aiStudio",
  "AI Chat": "aiChat",
  Tickets: "tickets",
  Applications: "applications",
  Identity: "identity",
  "Subuser Invites": "subuserInvites",
  Billing: "billing",
  Settings: "settings",  

  Tunnels: "tunnels",
  "Admin Panel": "adminPanel",
}

export const NAV_BADGE_I18N_KEYS: Record<string, string> = {
  New: "new",
  Beta: "beta",
  Staff: "staff",
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
        label: "ELO",
        href: "/dashboard/elo",
        icon: Star,
        badge: "New",
        feature: "elo",
      },
      {
        label: "Tunnels",
        href: "/dashboard/tunnels",
        icon: Globe,
        feature: "tunnels",
      },
      {
        label: "Nodes",
        href: "/dashboard/infrastructure/nodes",
        icon: Network,
        requiredTier: "enterprise",
      },
      {
        label: "Visual Editor",
        href: "/dashboard/infrastructure/visual-editor",
        icon: Braces,
        feature: "visualeditor",
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
        feature: "ai",
      },
      {
        label: "AI Chat",
        href: "/dashboard/ai-chat",
        icon: MessageSquare,
        feature: "ai",
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
        feature: "ticketing",
      },
      {
        label: "Applications",
        href: "/dashboard/applications",
        icon: FileText,
        feature: "applications",
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
        label: "Mailbox",
        href: "/dashboard/mailbox",
        icon: Mail,
      },
      {
        label: "Billing",
        href: "/dashboard/billing",
        icon: CreditCard,
        feature: "billing",
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
        label: "Staff Portal",
        href: "/dashboard/admin",
        icon: Shield,
        badge: "Staff",
      },
    ],
  },
]