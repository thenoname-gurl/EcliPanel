"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/hooks/useAuth"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Button } from "@/components/ui/button"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"

export default function DnsPage() {
  const { user } = useAuth()
  const [zones, setZones] = useState<any[]>([])
  const [newName, setNewName] = useState("")
  const [selected, setSelected] = useState<any|null>(null)
  const [records, setRecords] = useState<any[]>([])
  const [recordForm, setRecordForm] = useState({ name: "", type: "A", ttl: 3600, content: "" })
  const demoActive = !!user?.demoExpiresAt && new Date(user.demoExpiresAt) > new Date();

  const load = () => {
    apiFetch(API_ENDPOINTS.infraDnsZones)
      .then((data) => setZones(data || []))
      .catch(() => setZones([]))
  }

  useEffect(() => {
    load()
    // Auto-set zone name to org handle if user has an org
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
      await apiFetch(API_ENDPOINTS.infraDnsZones, { method: 'POST', body: JSON.stringify({ name: newName, kind: 'Native' }) });
      setNewName("")
      load()
    } catch (e: any) {
      alert('error '+e.message)
    }
  }

  return (
    <>
      <PanelHeader title="DNS Zones" description="Manage PowerDNS zones for your enterprise organisations" />
      {demoActive ? (
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 mx-6">
          <p className="text-sm font-medium text-warning-foreground">
            Demo mode is active. DNS changes are simulated and will not affect real zones.
          </p>
        </div>
      ) : null}
      <ScrollArea className="flex-1">
        <div className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="zone name (eg example.com)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-lg border border-border bg-input px-3 py-2 text-sm text-foreground w-64"
              />
              <Button onClick={createZone} disabled={demoActive} title={demoActive ? 'Disabled in demo mode' : undefined}>Create Zone</Button>
            </div>
            {user?.org?.handle && (
              <p className="text-xs text-muted-foreground">
                Zone name auto-set to your organisation handle: <span className="font-mono font-medium text-foreground">{user.org.handle}</span>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {zones.map((z) => (
              <div
                key={z.id}
                onClick={() => {
                  setSelected(z);
                  apiFetch(API_ENDPOINTS.infraDns + "/zones/" + z.id)
                    .then((d) => setRecords(d.rrsets || []))
                    .catch(() => setRecords([]));
                }}
                className={`rounded-lg border border-border bg-card p-3 flex justify-between items-center cursor-pointer ${selected && selected.id === z.id ? 'ring-2 ring-primary' : ''}`}
              >
                <span className="font-mono text-sm">{z.name}</span>
                <span className="text-xs text-muted-foreground">{z.kind}</span>
              </div>
            ))}
            {zones.length === 0 && <p className="text-sm text-muted-foreground">No zones found.</p>}
          </div>
        </div>
        {selected && (
          <div className="p-6 border-t border-border">
            <h3 className="text-lg font-medium">Zone: {selected.name}</h3>
            <div className="mt-4">
              {records.map((r,idx) => (
                <div key={idx} className="flex items-center gap-3 mb-2">
                  <span className="font-mono text-xs">{r.name}</span>
                  <span className="text-xs">{r.type}</span>
                  <span className="font-mono text-xs">{r.ttl}</span>
                  <span className="font-mono text-xs">{(r.records||[]).map((x:any)=>x.content).join(' | ')}</span>
                </div>
              ))}
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
                      <option>SMTP</option>
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
              <div className="mt-2">
                <Button
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
                          records: [{ content: recordForm.content }],
                        }),
                      });
                      // reload
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
            </div>
          </div>
        )}
      </ScrollArea>
    </>
  )
}
