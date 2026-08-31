"use client"
import { toast } from "sonner"

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";
import { PanelHeader } from "@/components/panel/header";
import { PageLayout, StatCard, StatGrid } from "@/components/panel/shared";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { API_ENDPOINTS } from "@/lib/panel-config";
import { useAuth } from "@/hooks/useAuth";
import { useOrgPermissions } from "@/hooks/useOrgPermissions";
import { Users, Server, Network, Activity, Globe, Loader2, CreditCard, Settings, Trash2, Upload, KeyRound } from "lucide-react";

const MembersTab = dynamic(() => import("./tabs/MembersTab").then((m) => ({ default: m.MembersTab })), { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div> });
const ServersTab = dynamic(() => import("./tabs/ServersTab").then((m) => ({ default: m.ServersTab })), { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div> });
const NodesTab = dynamic(() => import("./tabs/NodesTab").then((m) => ({ default: m.NodesTab })), { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div> });
const OrdersTab = dynamic(() => import("./tabs/OrdersTab").then((m) => ({ default: m.OrdersTab })), { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div> });
const DnsTab = dynamic(() => import("./tabs/DnsTab").then((m) => ({ default: m.DnsTab })), { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div> });
const ActivityTab = dynamic(() => import("./tabs/ActivityTab").then((m) => ({ default: m.ActivityTab })), { ssr: false, loading: () => <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />Loading…</div> });

function getAvatarUrl(url?: string): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (url.startsWith("/")) {
    const base = process.env.NEXT_PUBLIC_API_BASE || "";
    if (!base) return url;
    try { return new URL(url, base).toString(); } catch {}
  }
  return undefined;
}

export default function OrganisationDetail() {
  const t = useTranslations("organisationsDetailPage");
  const id = (() => { try { const m = window.location.pathname.match(/\/organisations\/([^/]+)/); return m?.[1]; } catch { return undefined; } })();
  const orgId = id ?? "";
  const perms = useOrgPermissions(orgId);
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [org, setOrg] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  const [activeTab, setActiveTab] = useState("members");
  const [orders, setOrders] = useState<any[]>([]);
  const [servers, setServers] = useState<any[]>([]);
  const [serversLoading, setServersLoading] = useState(false);
  const [nodes, setNodes] = useState<any[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [activity, setActivity] = useState<any[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [dnsAllowed, setDnsAllowed] = useState<boolean | null>(null);
  const [dnsUpselling, setDnsUpselling] = useState(false);
  const [subdomains, setSubdomains] = useState<any[]>([]);
  const [subdomainsLoading, setSubdomainsLoading] = useState(false);
  const [subdomainSelection, setSubdomainSelection] = useState<any | null>(null);
  const [subdomainRecords, setSubdomainRecords] = useState<any[]>([]);
  const [subdomainRecordsLoading, setSubdomainRecordsLoading] = useState(false);
  const [subdomainNewName, setSubdomainNewName] = useState("");
  const [subdomainRecordForm, setSubdomainRecordForm] = useState({ name: "", type: "A", ttl: 3600, content: "", proxied: false, autoTtl: false });
  const [subdomainEditId, setSubdomainEditId] = useState<string | null>(null);
  const [subdomainEditingRecord, setSubdomainEditingRecord] = useState<any | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    apiFetch(API_ENDPOINTS.organisationDetail.replace(":id", id))
      .then((o) => {
        const merged = { ...(user?.org?.id?.toString() === id ? user.org : {}), ...o };
        setOrg(merged);
        setMembers(merged.users || []);
        if (!subdomainNewName && merged.handle) setSubdomainNewName(merged.handle);
        if (perms.canManage || perms.isStaff) {
          apiFetch(API_ENDPOINTS.organisationUsers.replace(":id", id))
            .then((u) => setMembers(Array.isArray(u) ? u : (merged.users || [])))
            .catch(() => {});
        }
        if (perms.canManage) {
          apiFetch(`${API_ENDPOINTS.orders}?orgId=${id}`).then((ords) => setOrders(Array.isArray(ords) ? ords : [])).catch(() => {});
        }
      })
      .catch((err) => { console.error(err); if (user?.org?.id?.toString() === id) setOrg(user.org); })
      .finally(() => setLoading(false));
  }, [id, user, perms.canManage, perms.isStaff]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab) { setActiveTab(tab); if (tab === "dns") loadSubdomains(); }
  }, [searchParams]);

  const loadServers = useCallback(async () => {
    setServersLoading(true);
    try { setServers((await apiFetch(API_ENDPOINTS.organisationServers.replace(":id", orgId))) || []); } catch { setServers([]); }
    finally { setServersLoading(false); }
  }, [orgId]);

  const loadNodes = useCallback(async () => {
    setNodesLoading(true);
    try { setNodes((await apiFetch(API_ENDPOINTS.organisationNodes.replace(":id", orgId))) || []); } catch { setNodes([]); }
    finally { setNodesLoading(false); }
  }, [orgId]);

  const loadActivity = useCallback(async (pageNumber = 1) => {
    setActivityLoading(true);
    const limit = 50;
    try {
      const url = `${API_ENDPOINTS.organisationActivity.replace(":id", orgId)}?limit=${limit}&offset=${(pageNumber - 1) * limit}`;
      const data = await apiFetch(url);
      const items = Array.isArray(data) ? data : [];
      setActivity(items);
      setActivityHasMore(items.length === limit);
      setActivityPage(pageNumber);
    } catch { setActivity([]); setActivityHasMore(false); }
    finally { setActivityLoading(false); }
  }, [orgId]);

  const loadSubdomains = useCallback(async () => {
    if (!org?.handle) { setSubdomains([]); return; }
    setSubdomainsLoading(true);
    try {
      const endpoint = API_ENDPOINTS.organisationDnsZones.replace(":id", orgId);
      const data = await apiFetch(endpoint);
      setDnsAllowed(true);
      const list = (data || []).map((z: any) => ({ ...z, name: String(z.name || "").replace(/\.$/, ""), kind: z.kind ? String(z.kind).toLowerCase() : "cloudflare" }));
      setSubdomains(list);
    } catch (e: any) {
      setDnsAllowed(false);
      setSubdomains([]);
    }
    finally { setSubdomainsLoading(false); }
  }, [orgId, org?.handle]);

  const loadSubdomainRecords = useCallback(async (sub: any) => {
    if (!sub?.id) return;
    setSubdomainSelection(sub);
    setSubdomainRecordsLoading(true);
    try {
      const d = await apiFetch(API_ENDPOINTS.organisationDnsZone.replace(":id", orgId).replace(":zoneId", sub.id));
      const list = d.recordsList || d.rrsets || [];
      setSubdomainRecords((list || []).map((r: any) => ({
        id: r.id || r.records?.[0]?.id,
        name: r.name, type: r.type, ttl: r.ttl,
        content: r.content || r.records?.map((x: any) => x.content).join(" | ") || "",
        proxied: !!r.proxied,
      })));
    } catch { setSubdomainRecords([]); }
    finally { setSubdomainRecordsLoading(false); }
  }, [orgId]);

  const createSubdomain = async (token?: string, zoneId?: string) => {
    const name = subdomainNewName.trim();
    if (!name) return toast(t("alerts.subdomainNameRequired"));
    try {
      const body: any = { name, kind: "Cloudflare" };
      if (token) body.cloudflareToken = token;
      if (zoneId) body.externalZoneId = zoneId;
      await apiFetch(API_ENDPOINTS.organisationDnsZones.replace(":id", orgId), { method: "POST", body: JSON.stringify(body) });
      setSubdomainNewName("");
      await loadSubdomains();
    } catch (e: any) { toast.error(t("alerts.failed", { reason: e.message })); }
  };

  const addSubdomainRecord = async () => {
    if (!subdomainSelection) return;
    const body = { ...subdomainRecordForm };
    if (body.autoTtl) body.ttl = 1;
    try {
      await apiFetch(API_ENDPOINTS.organisationDnsZoneRecords.replace(":id", orgId).replace(":zoneId", subdomainSelection.id), { method: "POST", body: JSON.stringify(body) });
      setSubdomainRecordForm({ name: "", type: "A", ttl: 3600, content: "", proxied: false, autoTtl: false });
      await loadSubdomainRecords(subdomainSelection);
    } catch (e: any) { toast.error(t("alerts.failed", { reason: e.message })); }
  };

  const updateSubdomainRecord = async () => {
    if (!subdomainSelection || !subdomainEditId || !subdomainEditingRecord) return;
    const body = { ...subdomainEditingRecord };
    if (body.autoTtl) body.ttl = 1;
    try {
      await apiFetch(API_ENDPOINTS.organisationDnsZoneRecord.replace(":id", orgId).replace(":zoneId", subdomainSelection.id).replace(":recordId", subdomainEditId), { method: "PUT", body: JSON.stringify(body) });
      setSubdomainEditId(null); setSubdomainEditingRecord(null);
      await loadSubdomainRecords(subdomainSelection);
    } catch (e: any) { toast.error(t("alerts.failedUpdate", { reason: e.message })); }
  };

  const deleteSubdomainRecord = async (record: any) => {
    if (!subdomainSelection || !record?.id) return;
    if (!confirm(t("confirm.deleteRecord"))) return;
    try {
      await apiFetch(API_ENDPOINTS.organisationDnsZoneRecord.replace(":id", orgId).replace(":zoneId", subdomainSelection.id).replace(":recordId", String(record.id)), { method: "DELETE" });
      await loadSubdomainRecords(subdomainSelection);
    } catch (e: any) { toast.error(t("alerts.failedDelete", { reason: e.message })); }
  };

  const handleTabChange = (tab: string) => {
    if (tab === "servers" && servers.length === 0 && !serversLoading) loadServers();
    if (tab === "nodes" && nodes.length === 0 && !nodesLoading) loadNodes();
    if (tab === "activity" && activity.length === 0 && !activityLoading) loadActivity();
    if (tab === "dns" && subdomains.length === 0 && !subdomainsLoading) loadSubdomains();
  };

  const sendInvite = async (email: string) => {
    await apiFetch(API_ENDPOINTS.organisationInvite.replace(":id", id!), { method: "POST", body: JSON.stringify({ email }) });
    toast.success(t("alerts.invitationSent"));
  };
  const removeMember = async (userId: number) => {
    await apiFetch(API_ENDPOINTS.organisationRemoveUser.replace(":id", id!).replace(":userId", String(userId)), { method: "DELETE" });
    setMembers((m) => m.filter((u) => u.id !== userId));
  };
  const changeRole = async (userId: number, newRole: string) => {
    await apiFetch(API_ENDPOINTS.organisationAddUserRole.replace(":id", id!).replace(":userId", String(userId)), { method: "PUT", body: JSON.stringify({ orgRole: newRole }) });
    setMembers((prev) => prev.map((u) => (u.id === userId ? { ...u, orgRole: newRole } : u)));
  };
  const addUserDirect = async (email: string, userId: string, role: string) => {
    const body: any = { orgRole: role || "member" };
    if (userId) body.userId = Number(userId);
    else body.email = email;
    const res = await apiFetch(API_ENDPOINTS.organisationAddUser.replace(":id", id!), { method: "POST", body: JSON.stringify(body) });
    if (res?.target) setMembers((m) => [...m, res.target]);
    return res;
  };
  const resendInvite = async (inviteId: number) => {
    await apiFetch(API_ENDPOINTS.organisationResendInvite.replace(":id", id!).replace(":inviteId", String(inviteId)), { method: "POST" });
    toast.success(t("alerts.inviteResent"));
  };
  const revokeInvite = async (inviteId: number) => {
    await apiFetch(API_ENDPOINTS.organisationRevokeInvite.replace(":id", id!).replace(":inviteId", String(inviteId)), { method: "DELETE" });
    setOrg((o: any) => ({ ...o, invites: (o.invites || []).filter((iv: any) => iv.id !== inviteId) }));
    toast(t("alerts.inviteRevoked"));
  };
  const leaveOrg = async () => {
    if (!confirm(t("confirm.leaveOrg"))) return;
    await apiFetch(API_ENDPOINTS.organisationLeave.replace(":id", orgId), { method: "POST" });
    toast(t("alerts.leftOrg"));
    router.push("/dashboard");
  };

  if (!id) return <p className="p-6 text-sm text-destructive">{t("states.invalidOrganisation")}</p>;
  if (loading) return <p className="p-6 text-sm text-muted-foreground">{t("states.loading")}</p>;
  if (!org) return <p className="p-6 text-sm text-destructive">{t("states.organisationNotFound")}</p>;

  const headerTitle = org.name || t("header.fallbackTitle");
  const tierLabel = org.portalTier === "none" ? t("tiers.none") : (org.portalTier || "free");
  const headerDescription = `${org.handle || ""} · ${tierLabel}`.replace(/^ · /, "");

  return (
    <>
      <PanelHeader title={headerTitle} description={headerDescription} />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <PageLayout>
          {/* Org Header */}
          <div className="border border-border bg-card p-4 flex items-center gap-4 min-w-0 box-border overflow-hidden">
            {org.avatarUrl ? (
              <img src={getAvatarUrl(org.avatarUrl)} alt="org logo" className="h-16 w-16 object-cover border border-border" />
            ) : (
              <div className="h-16 w-16 bg-secondary/50 border border-border flex items-center justify-center text-2xl text-muted-foreground font-bold">
                {org.name?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-foreground truncate">{org.name}</h2>
                <Badge variant="outline" className="text-xs">{tierLabel}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">@{org.handle}</p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {perms.role && perms.role !== "owner" && (
                <Button size="sm" variant="destructive" onClick={leaveOrg} data-telemetry="organisations:leaveorg">{t("actions.leaveOrg")}</Button>
              )}
            </div>
          </div>

          {/* Subscription row */}
          <div className="border border-border bg-card p-3 flex items-center justify-between text-sm flex-wrap gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="text-muted-foreground">{t("labels.subscription")}:</span>
              <Badge variant="outline" className="text-xs capitalize">{tierLabel}</Badge>
              {org.portalTier === "none" && (
                <span className="text-xs text-muted-foreground">{t("tiers.noneDesc")}</span>
              )}
              {dnsAllowed === true && org.portalTier !== "enterprise" && (
                <Badge variant="secondary" className="text-[10px]">{t("labels.dnsAddonActive")}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {dnsAllowed === false && org.portalTier !== "enterprise" && (
                <Button size="sm" variant="outline" onClick={() => { setActiveTab("dns"); handleTabChange("dns"); }}>
                  <Globe className="h-3 w-3 mr-1" /> {t("actions.addDnsAddon")}
                </Button>
              )}
              {perms.canManage && (
                <Button size="sm" variant="outline" onClick={() => router.push("/dashboard/billing")}>
                  {t("actions.manageSubscription")}
                </Button>
              )}
            </div>
          </div>

          {/* Stats */}
          <StatGrid>
            <StatCard title={t("tabs.members")} value={members.length} icon={Users} />
            <StatCard title={t("tabs.servers")} value={servers.length > 0 ? servers.length : "—"} icon={Server} />
            <StatCard title={t("tabs.nodes")} value={nodes.length > 0 ? nodes.length : "—"} icon={Network} />
            <StatCard
              title={t("labels.tier")}
              value={tierLabel}
              icon={Activity}
              subtitle={org.portalTier === "none" ? t("tiers.noneDesc") : undefined}
            />
          </StatGrid>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={(value) => { setActiveTab(value); handleTabChange(value); }} className="w-full">
            <TabsList className="flex gap-2 overflow-x-auto scrollbar-none border border-border bg-secondary/50 px-2">
              <TabsTrigger value="members" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Users className="h-3.5 w-3.5" /> {t("tabs.members")}
              </TabsTrigger>
              {perms.canManage && (
                <TabsTrigger value="billing" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap" onClick={() => router.push(`/dashboard/organisations/${orgId}/billing`)}>
                  <CreditCard className="h-3.5 w-3.5" /> {t("tabs.billing")}
                </TabsTrigger>
              )}
              <TabsTrigger value="servers" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Server className="h-3.5 w-3.5" /> {t("tabs.servers")}
              </TabsTrigger>
              <TabsTrigger value="nodes" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Network className="h-3.5 w-3.5" /> {t("tabs.nodes")}
              </TabsTrigger>
              <TabsTrigger value="dns" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Globe className="h-3.5 w-3.5" /> {t("tabs.dns")}
              </TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                <Activity className="h-3.5 w-3.5" /> {t("tabs.activity")}
              </TabsTrigger>
              {perms.canManage && (
                <TabsTrigger value="settings" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary flex items-center gap-1.5 whitespace-nowrap">
                  <Settings className="h-3.5 w-3.5" /> {t("tabs.settings")}
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="members" className="mt-4">
              <MembersTab
                orgId={orgId} members={members} invites={org.invites || []} perms={perms} currentUserEmail={user?.email}
                onInvite={sendInvite} onRemoveMember={removeMember} onChangeRole={changeRole}
                onAddUser={addUserDirect} onResendInvite={resendInvite} onRevokeInvite={revokeInvite}
              />
            </TabsContent>

            <TabsContent value="servers" className="mt-4">
              <ServersTab orgId={orgId} servers={servers} loading={serversLoading} onRefresh={loadServers} />
            </TabsContent>

            <TabsContent value="nodes" className="mt-4">
              <NodesTab orgId={orgId} nodes={nodes} loading={nodesLoading} onRefresh={loadNodes} isStaff={perms.isStaff} />
            </TabsContent>

            <TabsContent value="dns" className="mt-4">
              {dnsAllowed === null ? (
                <div className="p-8 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" />{t("dns.checking")}</div>
              ) : dnsAllowed ? (
                <DnsTab
                  orgId={orgId} orgHandle={org.handle}
                  subdomains={subdomains} subdomainsLoading={subdomainsLoading}
                  subdomainSelection={subdomainSelection} subdomainRecords={subdomainRecords}
                  subdomainRecordsLoading={subdomainRecordsLoading}
                  subdomainNewName={subdomainNewName}
                  subdomainRecordForm={subdomainRecordForm}
                  subdomainEditId={subdomainEditId}
                  subdomainEditingRecord={subdomainEditingRecord}
                  onSetSubdomainNewName={setSubdomainNewName}
                  onLoadSubdomains={loadSubdomains}
                  onLoadSubdomainRecords={loadSubdomainRecords}
                  onCreateSubdomain={createSubdomain}
                  onDeleteSubdomain={async (sub: any) => {
                    if (!confirm(t("confirm.removeSubdomain", { name: sub.name }))) return;
                    try {
                      await apiFetch(API_ENDPOINTS.organisationDnsZone.replace(":id", orgId).replace(":zoneId", sub.id), { method: "DELETE" });
                      if (subdomainSelection?.id === sub.id) setSubdomainSelection(null);
                      await loadSubdomains();
                    } catch (e: any) { toast.error(t("alerts.failedDeleteSubdomain", { reason: e.message })); }
                  }}
                  onSetSubdomainRecordForm={setSubdomainRecordForm}
                  onAddSubdomainRecord={addSubdomainRecord}
                  onSetSubdomainEditId={setSubdomainEditId}
                  onSetSubdomainEditingRecord={setSubdomainEditingRecord}
                  onUpdateSubdomainRecord={updateSubdomainRecord}
                  onDeleteSubdomainRecord={deleteSubdomainRecord}
                />
              ) : (
                <div className="border border-border bg-card p-8 text-center">
                  <Globe className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-medium text-foreground mb-1">{t("dns.upsellTitle")}</p>
                  <p className="text-xs text-muted-foreground mb-4">{t("dns.upsellDescription")}</p>
                  <Button
                    onClick={async () => {
                      setDnsUpselling(true);
                      try {
                        await apiFetch(API_ENDPOINTS.orders, {
                          method: "POST",
                          body: JSON.stringify({
                            orgId: Number(orgId),
                            amount: 3,
                            description: "DNS Management Add-on",
                            activateMode: "now",
                            notes: "dns_addon:true",
                            items: JSON.stringify([{ description: "DNS Management Add-on (monthly)", quantity: 1, price: 3 }]),
                          }),
                        });
                        toast.success(t("dns.upsellSuccess"));
                        setDnsAllowed(true);
                        loadSubdomains();
                      } catch (e: any) {
                        toast.error(t("dns.upsellFailed", { reason: e?.message || "" }));
                      } finally {
                        setDnsUpselling(false);
                      }
                    }}
                    disabled={dnsUpselling}
                  >
                    {dnsUpselling ? t("dns.upsellProcessing") : t("dns.upsellAction")}
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <ActivityTab
                orgId={orgId} activity={activity} activityLoading={activityLoading}
                activityPage={activityPage} activityHasMore={activityHasMore}
                onLoadActivity={loadActivity}
                canExport={perms.canManage}
              />
            </TabsContent>

            {perms.canManage && (
            <TabsContent value="settings" className="mt-4">
              <div className="border border-border bg-card min-w-0 box-border overflow-hidden">
                <div className="border-b border-border p-4">
                  <p className="text-sm font-medium text-foreground">{t("tabs.settings")}</p>
                </div>

                {/* Avatar upload */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {org.avatarUrl ? (
                      <img src={getAvatarUrl(org.avatarUrl)} alt="org logo" className="h-10 w-10 object-cover border border-border" />
                    ) : (
                      <div className="h-10 w-10 bg-secondary/50 border border-border flex items-center justify-center text-sm font-bold text-muted-foreground">
                        {org.name?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-medium text-foreground">{t("settings.avatar")}</p>
                      <p className="text-xs text-muted-foreground">{t("settings.avatarHint")}</p>
                    </div>
                  </div>
                  <label className="cursor-pointer">
                    <span className="border border-border bg-secondary/50 px-3 py-1.5 text-xs text-foreground hover:bg-secondary/80 transition-colors inline-flex items-center gap-1">
                      <Upload className="h-3 w-3" />
                      {logoUploading ? t("actions.uploading") : t("actions.uploadLogo")}
                    </span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={logoUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]; if (!file) return;
                        setLogoUploading(true);
                        try {
                          const fd = new FormData(); fd.append("file", file);
                          const res = await apiFetch(API_ENDPOINTS.orgAvatar.replace(":id", id!), { method: "POST", body: fd });
                          setOrg((o: any) => ({ ...o, avatarUrl: res.url }));
                        } catch (err: any) { toast.error(t("alerts.uploadFailed", { reason: err.message })); }
                        finally { setLogoUploading(false); }
                      }}
                    />
                  </label>
                </div>

                {/* Name */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("settings.name")}</p>
                    <p className="text-xs text-muted-foreground">{org.name}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    const n = prompt(t("settings.namePrompt"), org.name);
                    if (n && n.trim()) {
                      apiFetch(API_ENDPOINTS.organisationDetail.replace(":id", id!), { method: "PUT", body: JSON.stringify({ name: n.trim() }) })
                        .then(() => setOrg({ ...org, name: n.trim() }))
                        .catch((e: any) => toast(e?.message));
                    }
                  }}>
                    {t("actions.edit")}
                  </Button>
                </div>

                {/* Handle (display only) */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("settings.handle")}</p>
                    <p className="text-xs text-muted-foreground">@{org.handle}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{t("settings.handleLocked")}</span>
                </div>

                {/* Tier */}
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("settings.subscription")}</p>
                    <p className="text-xs text-muted-foreground capitalize">{org.portalTier || "none"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/organisations/${orgId}/billing`)}>
                    <CreditCard className="h-3 w-3 mr-1" /> {t("actions.manageSubscription")}
                  </Button>
                </div>

                {/* Ownership transfer */}
                {perms.isOwner && (
                <div className="p-4 border-b border-border flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{t("settings.transferOwnership")}</p>
                    <p className="text-xs text-muted-foreground">{t("settings.transferOwnershipHint")}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    const uid = prompt(t("settings.transferUserIdPrompt"));
                    if (uid) {
                      const member = members.find((m: any) => String(m.id) === uid.trim());
                      if (!member) return toast(t("settings.userNotMember"));
                      apiFetch(API_ENDPOINTS.organisationAddUserRole.replace(":id", id!).replace(":userId", uid.trim()), { method: "PUT", body: JSON.stringify({ orgRole: "owner" }) })
                        .then(() => { setOrg({ ...org, ownerId: Number(uid) }); toast(t("settings.ownershipTransferred")); })
                        .catch((e: any) => toast(e?.message));
                    }
                  }}>
                    <KeyRound className="h-3 w-3 mr-1" /> {t("settings.transfer")}
                  </Button>
                </div>
                )}

                {/* Delete organisation */}
                {perms.isOwner && (
                <div className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-destructive">{t("settings.deleteOrg")}</p>
                    <p className="text-xs text-muted-foreground">{t("settings.deleteOrgHint")}</p>
                  </div>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (!confirm(t("confirm.deleteOrg"))) return;
                    if (!confirm(t("confirm.deleteOrgServers", { name: org.name }))) return;
                    try {
                      await apiFetch(API_ENDPOINTS.organisationDetail.replace(":id", id!), { method: "DELETE" });
                      router.push("/dashboard/organisations");
                    } catch (e: any) { toast.error(t("alerts.failed", { reason: e?.message || "" })); }
                  }} data-telemetry="organisations:deleteorg">
                    <Trash2 className="h-3 w-3 mr-1" /> {t("actions.deleteOrg")}
                  </Button>
                </div>
                )}
              </div>
            </TabsContent>
            )}
          </Tabs>
        </PageLayout>
      </ScrollArea>
    </>
  );
}
