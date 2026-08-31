import {
  LayoutDashboard,
  Server,
  Shield,
  CreditCard,
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
  CalendarDays,
  MessageCircle,
  BookOpen,
  Users,
  Lock,
  Check,
  GraduationCap,
  XCircle,
  ArrowRightLeft,
  HardDrive,
  Package,
  Database,
  Share2,
  Archive,
  Receipt,
  Banknote,
  Wallet,
  AlertTriangle,
  FileSearch,
  ScrollText,
  Megaphone,
  ThumbsUp,
  Key,
  BarChart3,
  Brain,
  TrendingUp,
  Download,
  Link2,
  type LucideIcon,
} from "lucide-react"
import type { PortalTier, FeatureFlag, NavItem, NavSection } from "./panel-config"

export * from "./panel-config"
export type { PortalTier, FeatureFlag, NavItem, NavSection } from "./panel-config"

export const NAV_SECTION_I18N_KEYS: Record<string, string> = {
  Overview: "overview",
  Infrastructure: "infrastructure",
  AI: "ai",
  Productivity: "productivity",
  Support: "support",
  Account: "account",
  Administration: "administration",
}

export const NAV_ITEM_I18N_KEYS: Record<string, string> = {
  "SOC Dashboard": "socDashboard",
  "Account Activity": "accountActivity",
  Organisations: "organisations",
  "Luminos Club": "luminosClub",
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
  Calendar: "calendar",
  Chat: "chat",
  "Visual Editor": "visualEditor",
  Blog: "blog",
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
      { label: "SOC Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "Account Activity", href: "/dashboard/activity", icon: Activity },
      { label: "Organisations", href: "/dashboard/organisations", icon: Building2 },
      { label: "Luminos Club", href: "/dashboard/luminos-club", icon: Sparkles, badge: "New" },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { label: "Servers", href: "/dashboard/servers", icon: Server },
      { label: "ELO", href: "/dashboard/elo", icon: Star, feature: "elo" },
      { label: "Tunnels", href: "/dashboard/tunnels", icon: Globe, feature: "tunnels" },
      { label: "Nodes", href: "/dashboard/infrastructure/nodes", icon: Network, requiredTier: "enterprise" },
    ],
  },
  {
    title: "AI",
    items: [
      { label: "AI Studio", href: "/dashboard/ai-studio", icon: Sparkles, requiredTier: "paid", feature: "ai" },
      { label: "AI Chat", href: "/dashboard/ai-chat", icon: MessageSquare, requiredTier: "paid", feature: "ai" },
    ],
  },
  {
    title: "Productivity",
    items: [
      { label: "Calendar", href: "/dashboard/calendar", icon: CalendarDays, feature: "calendar" },
      { label: "Visual Editor", href: "/dashboard/infrastructure/visual-editor", icon: Braces, feature: "visualeditor" },
      { label: "Chat", href: "/dashboard/chat", icon: MessageCircle, feature: "chat" },
      { label: "Blog", href: "/dashboard/blog", icon: BookOpen, feature: "blog", badge: "New" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Tickets", href: "/dashboard/tickets", icon: Ticket, requiredTier: "free", feature: "ticketing" },
      { label: "Applications", href: "/dashboard/applications", icon: FileText, feature: "applications" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Identity", href: "/dashboard/identity", icon: Fingerprint },
      { label: "Mailbox", href: "/dashboard/mailbox", icon: Mail },
      { label: "Billing", href: "/dashboard/billing", icon: CreditCard, feature: "billing" },
      { label: "Settings", href: "/dashboard/settings", icon: Settings },
    ],
  },
  {
    title: "Administration",
    items: [
      { label: "Staff Portal", href: "/dashboard/admin", icon: Shield, badge: "Staff" },
    ],
  },
]

export const ADMIN_NAVIGATION: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Overview", href: "/dashboard/admin?tab=overview", icon: Shield }],
  },
  {
    title: "Users & Identity",
    items: [
      { label: "Users", href: "/dashboard/admin?tab=users", icon: Users },
      { label: "Roles", href: "/dashboard/admin?tab=roles", icon: Lock },
      { label: "KYC", href: "/dashboard/admin?tab=verifications", icon: Check },
      { label: "Students", href: "/dashboard/admin?tab=studentVerifications", icon: GraduationCap },
      { label: "Deletions", href: "/dashboard/admin?tab=deletions", icon: XCircle },
    ],
  },
  {
    title: "Servers",
    items: [
      { label: "Servers", href: "/dashboard/admin?tab=servers", icon: Server },
      { label: "Transfers", href: "/dashboard/admin?tab=transfers", icon: ArrowRightLeft },
    ],
  },
  {
    title: "Infrastructure",
    items: [
      { label: "Nodes", href: "/dashboard/admin?tab=nodes", icon: HardDrive },
      { label: "Aegis DDoS", href: "/dashboard/admin?tab=aegis", icon: Shield },
      { label: "Eggs", href: "/dashboard/admin?tab=eggs", icon: Package },
      { label: "Databases", href: "/dashboard/admin?tab=databases", icon: Database },
      { label: "Tunnels", href: "/dashboard/admin?tab=tunnels", icon: Share2 },
      { label: "Backup Configs", href: "/dashboard/admin?tab=backup-configs", icon: Archive },
    ],
  },
  {
    title: "Billing",
    items: [
      { label: "Organisations", href: "/dashboard/admin?tab=organisations", icon: Building2 },
      { label: "Plans", href: "/dashboard/admin?tab=plans", icon: CreditCard },
      { label: "Orders", href: "/dashboard/admin?tab=orders", icon: Receipt },
      { label: "Finances", href: "/dashboard/admin?tab=finances", icon: Wallet, permissions: ["admin:critical:finances"] },
      { label: "Coupons", href: "/dashboard/admin?tab=coupons", icon: Ticket },
      { label: "Payments", href: "/dashboard/admin?tab=payments", icon: Banknote },
    ],
  },
  {
    title: "Security",
    items: [
      { label: "SOC", href: "/dashboard/admin?tab=soc", icon: Shield },
      { label: "Fraud", href: "/dashboard/admin?tab=fraud", icon: AlertTriangle },
      { label: "Audit", href: "/dashboard/admin?tab=audit", icon: FileSearch },
      { label: "Logs", href: "/dashboard/admin?tab=logs", icon: ScrollText },
    ],
  },
  {
    title: "Communication",
    items: [
      { label: "Announcements", href: "/dashboard/admin?tab=announcements", icon: Megaphone },
      { label: "Tickets", href: "/dashboard/admin?tab=tickets", icon: MessageSquare },
      { label: "Company Mailboxes", href: "/dashboard/admin?tab=company-mailboxes", icon: Mail },
      { label: "Chat", href: "/dashboard/admin?tab=chat", icon: MessageCircle },
      { label: "Feedback", href: "/dashboard/admin?tab=feedback", icon: ThumbsUp },
    ],
  },
  {
    title: "Integrations",
    items: [
      { label: "OAuth", href: "/dashboard/admin?tab=oauth", icon: Key },
      { label: "Rollouts", href: "/dashboard/admin?tab=rollouts", icon: BarChart3 },
      { label: "AI Models", href: "/dashboard/admin?tab=ai", icon: Brain },
    ],
  },
  {
    title: "Advanced",
    items: [
      { label: "Metrics", href: "/dashboard/admin?tab=metrics", icon: TrendingUp },
      { label: "Export Jobs", href: "/dashboard/admin?tab=export-jobs", icon: Download },
      { label: "Outbound Email", href: "/dashboard/admin?tab=outbound-emails", icon: Mail },
      { label: "Short URLs", href: "/dashboard/admin?tab=shorturls", icon: Link2 },
      { label: "Settings", href: "/dashboard/admin?tab=settings", icon: Settings },
      { label: "Applications", href: "/dashboard/admin?tab=applications", icon: FileText },
      { label: "ELO", href: "/dashboard/admin?tab=elo", icon: Zap },
    ],
  },
]