"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/hooks/useAuth"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"

export default function DnsPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [zones, setZones] = useState<any[]>([])
  const [redirecting, setRedirecting] = useState(true)
  const [loadingZones, setLoadingZones] = useState<boolean>(true)
  const [newName, setNewName] = useState("")
  const [selected, setSelected] = useState<any|null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [loadingRecords, setLoadingRecords] = useState<boolean>(false)
  const [recordForm, setRecordForm] = useState({ name: "", type: "A", ttl: 3600, content: "", proxied: false })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<any|null>(null)

  useEffect(() => {
    const goToOrgDns = async () => {
      if (!user) return

      if (user.org && user.org.id) {
        router.replace(`/dashboard/organisations/${user.org.id}?tab=dns`)
        return
      }

      if (user.role === 'admin' || user.role === '*') {
        try {
          const adminOrgs = await apiFetch(API_ENDPOINTS.adminOrganisations)
          const staffOrg = (adminOrgs || []).find((o: any) => o.isStaff)
          if (staffOrg) {
            router.replace(`/dashboard/organisations/${staffOrg.id}?tab=dns`)
            return
          }
        } catch (_) {
          // skip
        }
      }

      router.replace('/dashboard/organisations')
    }

    if (redirecting) {
      goToOrgDns().finally(() => setRedirecting(false))
    }
  }, [user, router, redirecting])

  const demoActive = !!user?.demoExpiresAt && new Date(user.demoExpiresAt) > new Date();

  const canManageSelected = (sel: any|null) => {
    if (!sel || !user) return false;
    if (user.role === 'admin' || user.role === '*') return true;
    const handle = user.org?.handle?.replace(/\.$/, '');
    if (!handle) return false;
    const name = String(sel.name || '').replace(/\.$/, '');
    if (name === handle || name.endsWith(`.${handle}`)) {
      return (user.orgRole === 'admin' || user.orgRole === 'owner');
    }
    return false;
  }

  const load = () => {
    setLoadingZones(true)
    apiFetch(API_ENDPOINTS.infraDnsZones)
      .then((data) => {
        const list = (data || []).map((z: any) => ({
          ...z,
          name: String(z.name || '').replace(/\.$/, ''),
          kind: z.kind ? String(z.kind).toLowerCase() : 'cloudflare',
        }));
        setZones(list);
      })
      .catch(() => setZones([]))
      .finally(() => setLoadingZones(false))
  }

  useEffect(() => {
    load()
    if (user?.org?.handle) {
      setNewName(user.org.handle)
    }
  }, [user])

  const createZone = async () => {
    if (demoActive) {
      alert('Demo mode is active. DNS zone creation is disabled in demo mode.');
      return;
    }
    if (!newName) return
    try {
      await apiFetch(API_ENDPOINTS.infraDnsZones, { method: 'POST', body: JSON.stringify({ name: newName, kind: 'Cloudflare' }) });
      setNewName("")
      load()
    } catch (e: any) {
      alert('error '+e.message)
    }
  }

  if (redirecting) {
    return (
      <div className="p-6 text-sm text-muted-foreground">Redirecting to your organisation DNS subdomains...</div>
    )
  }

  return (
    <>
      <PanelHeader title="DNS" description="Manage Cloudflare Sub-Domains DNS for your organisation" />
      {demoActive ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 mx-6">
          <p className="text-sm font-medium text-warning-foreground">
            Demo mode is active. DNS changes are simulated and will not affect real zones.
          </p>
        </div>
      ) : null}
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw] box-border">
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="subdomain (eg app.example.com)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground w-64"
              />
              <Button onClick={createZone} disabled={demoActive} title={demoActive ? 'Disabled in demo mode' : undefined}>Create Subdomain</Button>
            </div>
            {user?.org?.handle && (
              <p className="text-xs text-muted-foreground">
                Subdomain name auto-set to your organisation handle: <span className="font-mono font-medium text-foreground">{user.org.handle}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {loadingZones ? (
              <p className="text-sm text-muted-foreground">Loading subdomains...</p>
            ) : zones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No subdomains found. Create a subdomain above or contact a staff admin to add a root zone.</p>
            ) : (
              zones.map((z) => (
                <div
                  key={z.id}
                  onClick={() => {
                    setSelected(z);
                    setLoadingRecords(true);
                    setRecords([]);
                    apiFetch(API_ENDPOINTS.infraDns + "/zones/" + z.id)
                      .then((d) => {
                        const list = d.recordsList || d.rrsets || [];
                        const normalized = (list || []).map((r: any) => {
                          if (r.content) return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: r.content, proxied: !!r.proxied };
                          if (r.records && r.records.length) return { id: r.id || r.records[0].id, name: r.name, type: r.type, ttl: r.ttl, content: r.records.map((x:any)=>x.content).join(' | '), proxied: !!r.proxied };
                          return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: '', proxied: !!r.proxied };
                        });
                        setRecords(normalized || []);
                      })
                      .catch(() => setRecords([]))
                      .finally(() => setLoadingRecords(false));
                  }}
                  className={`rounded-lg border border-border bg-card p-3 flex justify-between items-center cursor-pointer ${selected && selected.id === z.id ? 'ring-2 ring-primary' : ''}`}
                >
                  <span className="font-mono text-sm">{z.name}</span>
                  <span className="text-xs text-muted-foreground">{z.kind}</span>
                </div>
              ))
            )}
          </div>
        </div>
        {selected && (
          <div className="p-6 border-t border-border">
            <h3 className="text-lg font-medium">Zone: {selected.name}</h3>
            <p className="text-sm text-muted-foreground">ID: {selected.id}</p>
            <div className="mt-4">
              {loadingRecords ? (
                <p className="text-sm text-muted-foreground">Loading records...</p>
              ) : records.length === 0 ? (
                <p className="text-sm text-muted-foreground">No DNS records found for this zone. Use the form below to add one.</p>
              ) : (
                records.map((r,idx) => (
                  <div key={r.id || idx} className="flex items-center gap-3 mb-2 justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col">
                        <span className="font-mono text-sm">{r.name}</span>
                        <span className="text-xs text-muted-foreground">{r.type} • ttl {r.ttl}</span>
                      </div>
                      <div className="font-mono text-sm text-foreground">{r.content}</div>
                      <div className="text-xs text-muted-foreground ml-2">{r.proxied ? 'proxied' : 'dns'}</div>
                    </div>
                    {canManageSelected(selected) ? (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditingId(r.id);
                            setEditingRecord({ ...r });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={async () => {
                            if (!confirm('Delete this record?')) return;
                            try {
                              await apiFetch(API_ENDPOINTS.infraDns + `/zones/${selected.id}/records/${r.id}`, { method: 'DELETE' });
                              apiFetch(API_ENDPOINTS.infraDns + `/zones/${selected.id}`)
                                .then((d) => {
                                  const list = d.recordsList || d.rrsets || [];
                                  const normalized = (list || []).map((r: any) => {
                                    if (r.content) return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: r.content };
                                    if (r.records && r.records.length) return { id: r.id || r.records[0].id, name: r.name, type: r.type, ttl: r.ttl, content: r.records.map((x:any)=>x.content).join(' | ') };
                                    return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: '' };
                                  });
                                  setRecords(normalized || []);
                                })
                                .catch(() => {});
                            } catch (e: any) {
                              alert('failed '+e.message);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">Read-only</div>
                    )}
                  </div>
                ))
              )}
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
                <input
                  placeholder="name" value={recordForm.name}
                  onChange={e=>setRecordForm({...recordForm,name:e.target.value})}
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm"
                />
                <select
                  value={recordForm.type}
                  onChange={e=>setRecordForm({...recordForm,type:e.target.value})}
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm"
                >
                  <option>A</option>
                  <option>AAAA</option>
                  <option>CNAME</option>
                  <option>TXT</option>
                  {user && (user.role === 'admin' || user.role === '*') && (
                    <>
                      <option>MX</option>
                      <option>NS</option>
                    </>
                  )}
                </select>
                <input
                  type="number" placeholder="ttl" value={recordForm.ttl}
                  onChange={e=>setRecordForm({...recordForm,ttl:parseInt(e.target.value)})}
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm"
                />
                <input
                  placeholder="content" value={recordForm.content}
                  onChange={e=>setRecordForm({...recordForm,content:e.target.value})}
                  className="rounded-lg border border-border bg-input px-3 py-2 text-sm"
                />
              </div>
              <div className="mt-2 flex items-center gap-3">
                <label className="text-xs text-muted-foreground flex items-center gap-2">
                  <input type="checkbox" checked={!!recordForm.proxied} onChange={e=>setRecordForm({...recordForm,proxied: e.target.checked})} />
                  <span>Proxy through Cloudflare</span>
                </label>
              </div>
              <div className="mt-2">
                <Button
                  disabled={!canManageSelected(selected)}
                  onClick={async () => {
                    if (demoActive) {
                      alert('Demo mode is active. DNS record changes are disabled in demo mode.');
                      return;
                    }
                      try {
                      await apiFetch(API_ENDPOINTS.infraDns + `/zones/${selected.id}/records`, {
                        method: 'POST',
                        body: JSON.stringify({
                          name: recordForm.name,
                          type: recordForm.type,
                          ttl: recordForm.ttl,
                          content: recordForm.content,
                          proxied: recordForm.proxied,
                        }),
                      });
                      apiFetch(API_ENDPOINTS.infraDns + `/zones/${selected.id}`)
                        .then((d) => setRecords(d.rrsets || []))
                        .catch(() => {});
                    } catch (e: any) {
                      alert('failed '+e.message);
                    }
                  }}
                  disabled={demoActive}
                  title={demoActive ? 'Disabled in demo mode' : undefined}
                >
                  Add record
                </Button>
              </div>
              {canManageSelected(selected) && editingId && editingRecord && (
                <div className="mt-4 p-3 border rounded-md bg-muted">
                  <h4 className="text-sm font-medium">Edit record</h4>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <input placeholder="name" value={editingRecord.name}
                      onChange={e=>setEditingRecord({...editingRecord,name:e.target.value})}
                      className="rounded-lg border border-border bg-input px-3 py-2 text-sm" />
                    <select value={editingRecord.type} onChange={e=>setEditingRecord({...editingRecord,type:e.target.value})} className="rounded-lg border border-border bg-input px-3 py-2 text-sm">
                      <option>A</option>
                      <option>AAAA</option>
                      <option>CNAME</option>
                      <option>TXT</option>
                      {user && (user.role === 'admin' || user.role === '*') && (
                        <>
                          <option>MX</option>
                          <option>NS</option>
                        </>
                      )}
                    </select>
                    <input type="number" placeholder="ttl" value={editingRecord.ttl}
                      onChange={e=>setEditingRecord({...editingRecord,ttl:parseInt(e.target.value)})}
                      className="rounded-lg border border-border bg-input px-3 py-2 text-sm" />
                    <input placeholder="content" value={editingRecord.content}
                      onChange={e=>setEditingRecord({...editingRecord,content:e.target.value})}
                      className="rounded-lg border border-border bg-input px-3 py-2 text-sm" />
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <label className="text-xs text-muted-foreground flex items-center gap-2">
                      <input type="checkbox" checked={!!editingRecord.proxied} onChange={e=>setEditingRecord({...editingRecord,proxied:e.target.checked})} />
                      <span>Proxy through Cloudflare</span>
                    </label>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button onClick={async ()=>{
                      try {
                        await apiFetch(API_ENDPOINTS.infraDns + `/zones/${selected.id}/records/${editingId}`, { method: 'PUT', body: JSON.stringify({ name: editingRecord.name, type: editingRecord.type, ttl: editingRecord.ttl, content: editingRecord.content, proxied: editingRecord.proxied }) });
                        apiFetch(API_ENDPOINTS.infraDns + `/zones/${selected.id}`)
                          .then((d) => {
                            const list = d.recordsList || d.rrsets || [];
                            const normalized = (list || []).map((r: any) => {
                              if (r.content) return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: r.content, proxied: !!r.proxied };
                              if (r.records && r.records.length) return { id: r.id || r.records[0].id, name: r.name, type: r.type, ttl: r.ttl, content: r.records.map((x:any)=>x.content).join(' | '), proxied: !!r.proxied };
                              return { id: r.id, name: r.name, type: r.type, ttl: r.ttl, content: '', proxied: !!r.proxied };
                            });
                            setRecords(normalized || []);
                            setEditingId(null);
                            setEditingRecord(null);
                          })
                          .catch(()=>{});
                      } catch(e:any){ alert('failed '+e.message) }
                    }}>Save</Button>
                    <Button variant="outline" onClick={()=>{ setEditingId(null); setEditingRecord(null); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </ScrollArea>
    </>
  )
}
