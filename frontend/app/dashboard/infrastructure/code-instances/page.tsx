"use client"

import { useEffect, useState } from "react"
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
      setError('Failed to load code instances')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [user])

    // eggId is defaulted to 264; no lookup required

  const stopInstance = async (uuid: string) => {
    if (!confirm('Stop and delete this code instance? Your data will be removed unless saved externally.')) return
    await apiFetch(`${API_ENDPOINTS.infraCodeInstances}/${uuid}/stop`, { method: "POST" })
    await load()
  }

  const createInstance = async () => {
    if (!user) return
    if (!eggId) {
      alert('No code-server egg found — cannot create instance.')
      return
    }
    setCreating(true)
    try {
      const payload: any = {
        eggId,
        name: name || 'Code Instance',
        memory: Number(memory),
        disk: Number(disk),
        cpu: Number(cpu),
        isCodeInstance: true,
      }
      const res = await apiFetch('/api/servers', { method: 'POST', body: JSON.stringify(payload) })
      if (res && res.uuid) {
        setShowCreate(false)
        setName('')
        await load()
      } else if (res && res.error) {
        alert('Create failed: ' + res.error)
      } else {
        alert('Unexpected response from server create')
      }
    } catch (e: any) {
      alert('Failed to create instance: ' + (e?.message || e))
    } finally {
      setCreating(false)
    }
  }

  return (
    <FeatureGuard feature="codeInstances">
      <>
        <ScrollArea className="h-screen">
        <PanelHeader title="Code Instances" description="Temporary Code-Server instances; inactive instances are deleted after 30 minutes of inactivity." />
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Temporary Code-Server instances allows you to run a temporary development environment.</div>
        <div className="space-x-2">
          <Button onClick={load} disabled={loading}>Refresh</Button>
          <Button onClick={() => setShowCreate(true)} variant="default">Create Code Instance</Button>
        </div>
      </div>

      {error && <div className="text-red-500 mb-4">{error}</div>}

      <div className="overflow-x-auto bg-card rounded-md border">
        <table className="min-w-full w-full border-collapse">
          <thead className="bg-muted text-muted-foreground text-sm">
            <tr>
              <th className="p-3 text-left">Name</th>
              <th className="p-3 text-left">UUID</th>
              <th className="p-3 text-left">Resources</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Last Activity</th>
              <th className="p-3 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {instances.map(i => (
              <tr key={i.uuid} className="border-t">
                <td className="p-3">{i.name || 'Code Instance'}</td>
                <td className="p-3"><code className="text-xs">{i.uuid}</code></td>
                <td className="p-3">{i.memory}MB • {i.cpu} CPU • {i.disk}MB</td>
                <td className="p-3">{i.status}</td>
                <td className="p-3">{i.lastActivityAt ? new Date(i.lastActivityAt).toLocaleString() : 'never'}</td>
                <td className="p-3"><Button variant="destructive" size="sm" onClick={() => stopInstance(i.uuid)}>Stop & Delete</Button></td>
              </tr>
            ))}
            {!instances.length && !loading && (
              <tr><td className="p-3" colSpan={6}>No code instances currently provisioned.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Code Instance</DialogTitle>
          </DialogHeader>

          <div className="grid gap-2">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My Code Instance" />
            </div>

            <div>
              <Label>Memory (MB)</Label>
              <Input value={memory} onChange={(e) => setMemory(e.target.value)} />
            </div>

            <div>
              <Label>Disk (MB)</Label>
              <Input value={disk} onChange={(e) => setDisk(e.target.value)} />
            </div>

            <div>
              <Label>CPU (cores)</Label>
              <Input value={cpu} onChange={(e) => setCpu(e.target.value)} />
            </div>

            <div>
              <Label>Instance Template</Label>
              <div className="flex items-center space-x-2">
                <Input value={eggId ? String(eggId) : ''} readOnly />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={createInstance} disabled={creating}>{creating ? 'Creating...' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </ScrollArea>
    </>
  </FeatureGuard>
  )
}
