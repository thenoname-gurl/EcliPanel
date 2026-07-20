"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Trash2, Loader2, Save, X } from "lucide-react"
import { apiFetch } from "@/lib/api-client"
import { TableLoading, TableEmpty, TableError } from "@/components/ui/table-states"

interface BackupConfig {
  uuid: string
  name: string
  description?: string
  backupDisk: string
  config?: Record<string, any>
  shared: boolean
  maintenanceEnabled: boolean
  createdAt: string
}

export default function BackupConfigsTab() {
  const [configs, setConfigs] = useState<BackupConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BackupConfig | null>(null)
  const [form, setForm] = useState({ name: '', description: '', backupDisk: 'local', configJson: '', shared: false, maintenanceEnabled: true })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch('/api/admin/backup-configurations')
      setConfigs(data?.data || [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setForm({ name: '', description: '', backupDisk: 'local', configJson: '', shared: false, maintenanceEnabled: true })
  }

  const openEdit = (c: BackupConfig) => {
    setEditing(c)
    setForm({
      name: c.name,
      description: c.description || '',
      backupDisk: c.backupDisk,
      configJson: c.config ? JSON.stringify(c.config, null, 2) : '',
      shared: c.shared,
      maintenanceEnabled: c.maintenanceEnabled,
    })
  }

  const save = async () => {
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description,
        backupDisk: form.backupDisk,
        config: form.configJson ? JSON.parse(form.configJson) : null,
        shared: form.shared,
        maintenanceEnabled: form.maintenanceEnabled,
      }
      if (editing) {
        await apiFetch(`/api/admin/backup-configurations/${editing.uuid}`, { method: 'PUT', body: JSON.stringify(payload) })
      } else {
        await apiFetch('/api/admin/backup-configurations', { method: 'POST', body: JSON.stringify(payload) })
      }
      setEditing(null)
      load()
    } catch (e: any) {
      alert(e?.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const del = async (uuid: string) => {
    if (!confirm('Delete this backup configuration?')) return
    try {
      await apiFetch(`/api/admin/backup-configurations/${uuid}`, { method: 'DELETE' })
      load()
    } catch (e: any) {
      alert(e?.message || 'Failed to delete')
    }
  }

  if (loading) return <TableLoading message="Loading backup configurations..." />
  if (error) return <TableError message={error} onRetry={load} />

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Backup Configurations</h2>
          <p className="text-xs text-muted-foreground">Storage backends for server backups (S3, Restic, PBS, Kopia)</p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" /> Create</Button>
      </div>

      {configs.length === 0 ? (
        <TableEmpty message="No backup configurations yet. Create one to define where server backups are stored." />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30">
              <tr>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Type</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Shared</th>
                <th className="text-right px-4 py-2 text-xs font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {configs.map(c => (
                <tr key={c.uuid} className="hover:bg-muted/20">
                  <td className="px-4 py-2">
                    <p className="font-medium">{c.name}</p>
                    {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                  </td>
                  <td className="px-4 py-2">
                    <span className="text-xs bg-muted/50 px-2 py-0.5 rounded font-mono">{c.backupDisk}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{c.shared ? 'Yes' : 'No'}</td>
                  <td className="px-4 py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => del(c.uuid)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(editing !== null || form.name !== '' || (editing === null && configs.length === 0)) && editing !== undefined ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) setEditing(undefined) }}>
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">{editing ? 'Edit' : 'Create'} Backup Configuration</h3>
              <button onClick={() => setEditing(undefined)}><X className="h-4 w-4" /></button>
            </div>

            <input type="text" placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md" />

            <input type="text" placeholder="Description (optional)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md" />

            <select value={form.backupDisk} onChange={e => setForm({ ...form, backupDisk: e.target.value })}
              className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md">
              <option value="local">Local</option>
              <option value="s3">S3</option>
              <option value="restic">Restic</option>
              <option value="pbs">Proxmox Backup Server</option>
              <option value="kopia">Kopia</option>
            </select>

            <textarea placeholder="Config JSON (optional)" value={form.configJson} onChange={e => setForm({ ...form, configJson: e.target.value })}
              className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md font-mono h-24 resize-y" />

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.shared} onChange={e => setForm({ ...form, shared: e.target.checked })} />
              Shared across nodes
            </label>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(undefined)}>Cancel</Button>
              <Button size="sm" onClick={save} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
