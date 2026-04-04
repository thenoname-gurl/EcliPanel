"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { useAuth } from "@/hooks/useAuth"
import { PanelHeader } from "@/components/panel/header"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"

interface CodeInstance {
  uuid: string
  name?: string
  nodeId: number
  memory: number
  disk: number
  cpu: number
  status: string
  lastActivityAt?: string
  createdAt?: string
  codeInstanceMinutesUsed: number
}

export default function CodeInstancesPage() {
  const t = useTranslations("infrastructureCodeInstancesPage")
  const { user } = useAuth()
  const [instances, setInstances] = useState<CodeInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState("")
  const [memory, setMemory] = useState("4096")
  const [disk, setDisk] = useState("51200")
  const [cpu, setCpu] = useState("3")
  const [eggId, setEggId] = useState<number | null>(264)
  const [eggsLoading, setEggsLoading] = useState(false)

  const load = async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const data = await apiFetch(API_ENDPOINTS.infraCodeInstances)
      setInstances(data || [])
    } catch (e) {
      setError(t("errors.failedLoad"))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [user])

  const stopInstance = async (uuid: string) => {
    if (!confirm(t("confirm.stopDelete"))) return
    await apiFetch(`${API_ENDPOINTS.infraCodeInstances}/${uuid}/stop`, { method: "POST" })
    await load()
  }

  const createInstance = async () => {
    if (!user) return
    if (!eggId) {
      alert(t("errors.noEggFound"))
      return
    }
    setCreating(true)
    try {
      const payload: any = {
        eggId,
        name: name || t("defaults.instanceName"),
        memory: Number(memory),
        disk: Number(disk),
        cpu: Number(cpu),
        isCodeInstance: true,
      }
      const res = await apiFetch('/api/servers', { method: 'POST', body: JSON.stringify(payload) })
      if (res && res.uuid) {
        setShowCreate(false)
        setName("")
        await load()
      } else if (res && res.error) {
        alert(t("errors.createFailed", { reason: res.error }))
      } else {
        alert(t("errors.unexpectedCreateResponse"))
      }
    } catch (e: any) {
      alert(t("errors.failedCreate", { reason: e?.message || e }))
    } finally {
      setCreating(false)
    }
  }

  return (
    <FeatureGuard feature="codeInstances">
      <>
        <ScrollArea className="h-screen">
        <PanelHeader title={t("header.title")} description={t("header.description")} />
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">{t("intro")}</div>
        <div className="space-x-2">
          <Button onClick={load} disabled={loading}>{t("actions.refresh")}</Button>
          <Button onClick={() => setShowCreate(true)} variant="default">{t("actions.createCodeInstance")}</Button>
        </div>
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="overflow-x-auto bg-card rounded-md border">
        <table className="min-w-full w-full border-collapse">
          <thead className="bg-muted text-muted-foreground text-sm">
            <tr>
              <th className="p-3 text-left">{t("table.name")}</th>
              <th className="p-3 text-left">{t("table.uuid")}</th>
              <th className="p-3 text-left">{t("table.resources")}</th>
              <th className="p-3 text-left">{t("table.status")}</th>
              <th className="p-3 text-left">{t("table.lastActivity")}</th>
              <th className="p-3 text-left">{t("table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {instances.map(i => (
              <tr key={i.uuid} className="border-t">
                <td className="p-3">{i.name || t("defaults.instanceName")}</td>
                <td className="p-3"><code className="text-xs">{i.uuid}</code></td>
                <td className="p-3">{t("table.resourcesValue", { memory: i.memory, cpu: i.cpu, disk: i.disk })}</td>
                <td className="p-3">{i.status}</td>
                <td className="p-3">{i.lastActivityAt ? new Date(i.lastActivityAt).toLocaleString() : t("states.never")}</td>
                <td className="p-3"><Button variant="destructive" size="sm" onClick={() => stopInstance(i.uuid)}>{t("actions.stopDelete")}</Button></td>
              </tr>
            ))}
            {!instances.length && !loading && (
              <tr><td className="p-3" colSpan={6}>{t("states.noInstances")}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dialog.title")}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-2">
            <div>
              <Label>{t("form.name")}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("form.namePlaceholder")} />
            </div>

            <div>
              <Label>{t("form.memory")}</Label>
              <Input value={memory} onChange={(e) => setMemory(e.target.value)} />
            </div>

            <div>
              <Label>{t("form.disk")}</Label>
              <Input value={disk} onChange={(e) => setDisk(e.target.value)} />
            </div>

            <div>
              <Label>{t("form.cpu")}</Label>
              <Input value={cpu} onChange={(e) => setCpu(e.target.value)} />
            </div>

            <div>
              <Label>{t("form.instanceTemplate")}</Label>
              <div className="flex items-center space-x-2">
                <Input value={eggId ? String(eggId) : ''} readOnly />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>{t("actions.cancel")}</Button>
            <Button onClick={createInstance} disabled={creating}>{creating ? t("actions.creating") : t("actions.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ScrollArea>
    </>
  </FeatureGuard>
  )
}
