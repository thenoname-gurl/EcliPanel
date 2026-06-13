"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import Link from "next/link"
import {
  Loader2,
  Search,
  Trophy,
  RefreshCw,
  RotateCcw,
  Trash2,
  Edit,
  TrendingUp,
  TrendingDown,
  X,
  ExternalLink,
  Image,
  Flag,
  Check,
  CheckCheck,
  Users,
  BarChart3,
  AlertTriangle,
} from "lucide-react"

type SubTab = "projects" | "votes" | "reports" | "voters"

export default function EloTab({ ctx: _ctx }: { ctx: any }) {
  const [tab, setTab] = useState<SubTab>("projects")

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-1 border-b border-border/50 pb-1">
        <button
          onClick={() => setTab("projects")}
          className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            tab === "projects"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Trophy className="h-3.5 w-3.5" />
          Projects
        </button>
        <button
          onClick={() => setTab("votes")}
          className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            tab === "votes"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <BarChart3 className="h-3.5 w-3.5" />
          Votes
        </button>
        <button
          onClick={() => setTab("reports")}
          className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            tab === "reports"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Flag className="h-3.5 w-3.5" />
          Reports
        </button>
        <button
          onClick={() => setTab("voters")}
          className={`px-3 py-2 text-xs font-medium transition-colors flex items-center gap-1.5 ${
            tab === "voters"
              ? "text-foreground border-b-2 border-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Voters
        </button>
      </div>

      {tab === "projects" && <ProjectsPanel />}
      {tab === "votes" && <VotesPanel />}
      {tab === "reports" && <ReportsPanel />}
      {tab === "voters" && <VotersPanel />}
    </div>
  )
}

function ProjectsPanel() {
  const [projects, setProjects] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [editProject, setEditProject] = useState<any | null>(null)
  const [editElo, setEditElo] = useState("")
  const [editKFactor, setEditKFactor] = useState("")
  const [editTokens, setEditTokens] = useState("")
  const [editTitle, setEditTitle] = useState("")
  const [editDescription, setEditDescription] = useState("")
  const [editReadme, setEditReadme] = useState("")
  const [editGithubUrl, setEditGithubUrl] = useState("")
  const [editDemoUrl, setEditDemoUrl] = useState("")
  const [editScreenshots, setEditScreenshots] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [resetTarget, setResetTarget] = useState<any | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)

  const per = 25

  const fetchProjects = async (p = page, s = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), per: String(per) })
      if (s.trim()) params.set("search", s.trim())
      const data = await apiFetch(`/api/admin/elo?${params}`)
      setProjects(data?.projects || [])
      setTotal(data?.total || 0)
    } catch {
      setProjects([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProjects(1, search)
  }, [])

  const handleSearch = () => {
    setPage(1)
    fetchProjects(1, search)
  }

  const handleEdit = (p: any) => {
    setEditProject(p)
    setEditElo(String(p.eloScore))
    setEditKFactor(String(p.kFactor))
    setEditTokens(String(p.skipTokensRemaining))
    setEditTitle(p.title || "")
    setEditDescription(p.description || "")
    setEditReadme(p.readme || "")
    setEditGithubUrl(p.githubUrl || "")
    setEditDemoUrl(p.demoUrl || "")
    setEditScreenshots(Array.isArray(p.screenshots) ? [...p.screenshots] : [])
  }

  const handleAddScreenshot = () => {
    const url = prompt("Enter screenshot URL:")
    if (url?.trim()) setEditScreenshots(prev => [...prev, url.trim()])
  }

  const handleRemoveScreenshot = (idx: number) => {
    setEditScreenshots(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = async () => {
    if (!editProject) return
    setSaving(true)
    try {
      await apiFetch(`/api/admin/elo/${editProject.id}`, {
        method: "PUT",
        body: JSON.stringify({
          eloScore: Number(editElo),
          kFactor: Number(editKFactor),
          skipTokensRemaining: Number(editTokens),
          title: editTitle || null,
          description: editDescription || null,
          readme: editReadme || null,
          githubUrl: editGithubUrl || null,
          demoUrl: editDemoUrl || null,
          screenshots: editScreenshots.length > 0 ? editScreenshots : null,
        }),
      })
      setEditProject(null)
      fetchProjects(page, search)
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!resetTarget) return
    try {
      await apiFetch(`/api/admin/elo/${resetTarget.id}/reset`, { method: "POST" })
      setResetTarget(null)
      fetchProjects(page, search)
    } catch {
      // ignore
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await apiFetch(`/api/admin/elo/${deleteTarget.id}`, { method: "DELETE" })
      setDeleteTarget(null)
      fetchProjects(page, search)
    } catch {
      // ignore
    }
  }

  const totalPages = Math.ceil(total / per)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-muted-foreground">
          {total} ELO project{total !== 1 ? "s" : ""}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 border border-border/50 bg-secondary/30 px-2 py-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search by name or server ID..."
              className="bg-transparent border-0 text-sm text-foreground outline-none w-48 placeholder:text-muted-foreground/50"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleSearch}>
            <Search className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => fetchProjects(page, search)}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6 gap-3">
          <div className="h-14 w-14 bg-muted/50 flex items-center justify-center">
            <Trophy className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-semibold text-foreground">No ELO projects found</p>
          <p className="text-xs text-muted-foreground">Create an ELO-enabled server to see it here.</p>
        </div>
      ) : (
        <div className="border border-border/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Screenshots</th>
                <th className="text-left px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Owner</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">ELO</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">K</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Votes</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">W/L</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Skips</th>
                <th className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground">#{p.id}</td>
                  <td className="px-4 py-3">
                    <p className="text-sm font-medium text-foreground truncate max-w-[160px]">{p.title}</p>
                    <p className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">{p.serverId}</p>
                  </td>
                  <td className="px-4 py-3">
                    {Array.isArray(p.screenshots) && p.screenshots.length > 0 ? (
                      <div className="flex gap-1">
                        {p.screenshots.slice(0, 3).map((url: string, i: number) => (
                          <a
                            key={i}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block w-8 h-8 overflow-hidden border border-border/30 bg-secondary/30 hover:border-primary/50 transition-colors"
                          >
                            <img
                              src={url}
                              alt=""
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = "none"
                              }}
                            />
                          </a>
                        ))}
                        {p.screenshots.length > 3 && (
                          <span className="text-[10px] text-muted-foreground self-center">
                            +{p.screenshots.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{p.ownerName}</p>
                    <p className="text-[10px] text-muted-foreground">{p.ownerEmail}</p>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-semibold tabular-nums">{p.eloScore}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-muted-foreground">{p.kFactor}</td>
                  <td className="px-4 py-3 text-center text-sm">{p.totalVotes}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1 text-xs">
                      <TrendingUp className="h-3 w-3 text-emerald-500" /> {p.wins}
                      <span className="text-muted-foreground mx-0.5">/</span>
                      <TrendingDown className="h-3 w-3 text-red-500" /> {p.losses}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-sm">
                    {p.skipTokensRemaining}/{p.maxSkipTokens}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge
                      variant="outline"
                      className={
                        p.serverStatus === "suspended"
                          ? "text-destructive border-destructive/30"
                          : p.serverStatus === "orphaned"
                            ? "text-amber-500 border-amber-500/30"
                            : "text-emerald-500 border-emerald-500/30"
                      }
                    >
                      {p.serverStatus}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleEdit(p)}
                        className="border border-border/50 bg-secondary/30 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                        title="Edit"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setResetTarget(p)}
                        className="border border-border/50 bg-secondary/30 p-1.5 text-amber-500 hover:text-amber-400 hover:bg-secondary/60 transition-colors"
                        title="Reset to 1000"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(p)}
                        className="border border-border/50 bg-secondary/30 p-1.5 text-destructive hover:text-destructive/80 hover:bg-secondary/60 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => { setPage(page - 1); fetchProjects(page - 1, search) }}
          >
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => { setPage(page + 1); fetchProjects(page + 1, search) }}
          >
            Next
          </Button>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editProject !== null} onOpenChange={(open) => { if (!open) setEditProject(null) }}>
        <DialogContent className="border-border bg-card max-w-xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">Edit ELO Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-3">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">ELO Score</Label>
                <Input
                  type="number"
                  value={editElo}
                  onChange={(e) => setEditElo(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">K-Factor</Label>
                <Input
                  type="number"
                  value={editKFactor}
                  onChange={(e) => setEditKFactor(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Skip Tokens</Label>
                <Input
                  type="number"
                  value={editTokens}
                  onChange={(e) => setEditTokens(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Title</Label>
              <Input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="mt-1"
                placeholder="Project title"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1 min-h-[80px]"
                placeholder="Project description"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">README</Label>
              <Textarea
                value={editReadme}
                onChange={(e) => setEditReadme(e.target.value)}
                className="mt-1 min-h-[120px] font-mono text-xs"
                placeholder="Markdown content"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">GitHub URL</Label>
              <Input
                value={editGithubUrl}
                onChange={(e) => setEditGithubUrl(e.target.value)}
                className="mt-1 font-mono text-xs"
                placeholder="https://github.com/..."
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Demo URL</Label>
              <Input
                value={editDemoUrl}
                onChange={(e) => setEditDemoUrl(e.target.value)}
                className="mt-1 font-mono text-xs"
                placeholder="https://demo.example.com"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Screenshots</Label>
              <div className="mt-1 space-y-2">
                {editScreenshots.map((url, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2 border border-border/50 bg-secondary/20 px-2 py-1.5 text-xs font-mono text-muted-foreground truncate">
                      <Image className="h-3 w-3 shrink-0" />
                      <span className="truncate">{url}</span>
                    </div>
                    <div className="w-10 h-10 overflow-hidden border border-border/30 shrink-0 bg-secondary/30">
                      <img
                        src={url}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none"
                        }}
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveScreenshot(idx)}
                      className="text-destructive hover:text-destructive/80 p-1"
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <Button size="sm" variant="outline" onClick={handleAddScreenshot}>
                  + Add Screenshot URL
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProject(null)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Dialog */}
      <Dialog open={resetTarget !== null} onOpenChange={(open) => { if (!open) setResetTarget(null) }}>
        <DialogContent className="border-border bg-card max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Reset ELO Project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-3">
            Reset <strong>{resetTarget?.title}</strong> to 1000 ELO? All voting history on this project will be preserved.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleReset}>
              <RotateCcw className="h-4 w-4 mr-2" />
              Reset to 1000
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent className="border-border bg-card max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground text-destructive">Delete ELO Project</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-3">
            This will permanently delete <strong>{deleteTarget?.title}</strong> and all its votes and devlogs. The linked server will <strong>not</strong> be deleted.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function VotesPanel() {
  const [votes, setVotes] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const per = 50

  const fetchVotes = async (p = page, s = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), per: String(per) })
      if (s.trim()) params.set("search", s.trim())
      const data = await apiFetch(`/api/admin/elo/votes?${params}`)
      setVotes(data?.votes || [])
      setTotal(data?.total || 0)
    } catch {
      setVotes([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchVotes(1, "") }, [])

  const handleSearch = () => { setPage(1); fetchVotes(1, search) }

  const handleDeleteVote = async (id: number) => {
    if (!confirm("Delete this vote?")) return
    try {
      await apiFetch(`/api/admin/elo/votes/${id}`, { method: "DELETE" })
      fetchVotes(page, search)
    } catch { /* ignore */ }
  }

  const totalPages = Math.ceil(total / per)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-muted-foreground">{total} vote{total !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border/50 bg-secondary/30 px-2 py-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search voter ID..."
              className="bg-transparent border-0 text-sm text-foreground outline-none w-32 placeholder:text-muted-foreground/50"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleSearch}>
            <Search className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => fetchVotes(page, search)}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : votes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <BarChart3 className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No votes recorded yet.</p>
        </div>
      ) : (
        <div className="border border-border/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Voter</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Project A</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Project B</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Winner</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">ELO Δ</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {votes.map((v) => (
                <tr key={v.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-3 text-xs text-muted-foreground">#{v.id}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/dashboard/elo/users/${v.voterId}`}
                      className="text-sm text-foreground hover:text-primary transition-colors"
                    >
                      {v.voterName}
                    </Link>
                    <p className="text-[10px] text-muted-foreground">ID: {v.voterId}</p>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/dashboard/elo/projects/${v.projectAId}`}
                      className="text-sm text-foreground hover:text-primary transition-colors"
                    >
                      {v.projectATitle}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/dashboard/elo/projects/${v.projectBId}`}
                      className="text-sm text-foreground hover:text-primary transition-colors"
                    >
                      {v.projectBTitle}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Badge variant="outline" className={
                      v.winnerIsA
                        ? "text-emerald-500 border-emerald-500/30"
                        : "text-blue-500 border-blue-500/30"
                    }>
                      {v.winnerIsA ? v.projectATitle : v.projectBTitle}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <span className={`text-[11px] font-mono tabular-nums ${v.eloDeltaA > 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {v.projectATitle}: {v.eloDeltaA > 0 ? "+" : ""}{Math.round(v.eloDeltaA)}
                      </span>
                      <span className={`text-[11px] font-mono tabular-nums ${v.eloDeltaB > 0 ? "text-emerald-500" : "text-red-500"}`}>
                        {v.projectBTitle}: {v.eloDeltaB > 0 ? "+" : ""}{Math.round(v.eloDeltaB)}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center text-[10px] text-muted-foreground whitespace-nowrap">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      onClick={() => handleDeleteVote(v.id)}
                      className="border border-border/50 bg-secondary/30 p-1.5 text-destructive hover:text-destructive/80 hover:bg-secondary/60 transition-colors"
                      title="Delete vote"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1}
            onClick={() => { setPage(page - 1); fetchVotes(page - 1, search) }}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages}
            onClick={() => { setPage(page + 1); fetchVotes(page + 1, search) }}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function ReportsPanel() {
  const [reports, setReports] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open")
  const [loading, setLoading] = useState(true)
  const per = 50

  const fetchReports = async (p = page, f = filter) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), per: String(per) })
      if (f === "open") params.set("resolved", "false")
      else if (f === "resolved") params.set("resolved", "true")
      const data = await apiFetch(`/api/admin/elo/reports?${params}`)
      setReports(data?.reports || [])
      setTotal(data?.total || 0)
    } catch {
      setReports([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchReports(1, filter) }, [])

  const handleResolve = async (id: number) => {
    try {
      await apiFetch(`/api/admin/elo/reports/${id}`, { method: "PUT" })
      fetchReports(page, filter)
    } catch { /* ignore */ }
  }

  const handleDeleteVoteFromReport = async (targetId: number) => {
    if (!confirm("Delete the reported vote?")) return
    try {
      await apiFetch(`/api/admin/elo/votes/${targetId}`, { method: "DELETE" })
      fetchReports(page, filter)
    } catch { /* ignore */ }
  }

  const totalPages = Math.ceil(total / per)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{total} report{total !== 1 ? "s" : ""}</span>
          <div className="flex items-center gap-1 border-l border-border/50 pl-3 ml-1">
            {(["all", "open", "resolved"] as const).map((f) => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1); fetchReports(1, f) }}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  filter === f
                    ? "text-foreground bg-secondary/50"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f === "open" ? "Open" : "Resolved"}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => fetchReports(page, filter)}>
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : reports.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Flag className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            {filter === "open" ? "No open reports." : filter === "resolved" ? "No resolved reports." : "No reports."}
          </p>
        </div>
      ) : (
        <div className="border border-border/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Reporter</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Target</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Reason</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-3 text-xs text-muted-foreground">#{r.id}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/dashboard/elo/users/${r.reporterId}`}
                      className="text-sm text-foreground hover:text-primary transition-colors"
                    >
                      {r.reporterName}
                    </Link>
                    <p className="text-[10px] text-muted-foreground">ID: {r.reporterId}</p>
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant="outline" className="text-[10px]">
                      {r.targetType}
                    </Badge>
                    {r.targetType === "project" ? (
                      <Link
                        href={`/dashboard/elo/projects/${r.targetId}`}
                        className="text-sm text-foreground ml-1.5 hover:text-primary transition-colors"
                      >
                        #{r.targetId}
                      </Link>
                    ) : (
                      <Link
                        href={`/dashboard/elo/users/${r.targetId}`}
                        className="text-sm text-foreground ml-1.5 hover:text-primary transition-colors"
                      >
                        #{r.targetId}
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-3 max-w-[250px]">
                    <p className="text-xs text-foreground truncate">{r.reason}</p>
                  </td>
                  <td className="px-3 py-3 text-center text-[10px] text-muted-foreground">
                    {new Date(r.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {r.resolvedAt ? (
                      <Badge variant="outline" className="text-emerald-500 border-emerald-500/30 text-[10px]">
                        <CheckCheck className="h-3 w-3 mr-1" />
                        Resolved
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-amber-500 border-amber-500/30 text-[10px]">
                        Open
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {r.targetType === "vote" && !r.resolvedAt && (
                        <button
                          onClick={() => handleDeleteVoteFromReport(r.targetId)}
                          className="border border-border/50 bg-secondary/30 p-1.5 text-destructive hover:text-destructive/80 hover:bg-secondary/60 transition-colors"
                          title="Delete reported vote"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                      {!r.resolvedAt && (
                        <button
                          onClick={() => handleResolve(r.id)}
                          className="border border-border/50 bg-secondary/30 p-1.5 text-emerald-500 hover:text-emerald-400 hover:bg-secondary/60 transition-colors"
                          title="Dismiss report"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1}
            onClick={() => { setPage(page - 1); fetchReports(page - 1, filter) }}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages}
            onClick={() => { setPage(page + 1); fetchReports(page + 1, filter) }}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

function VotersPanel() {
  const [voters, setVoters] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const per = 50

  const fetchVoters = async (p = page, s = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(p), per: String(per) })
      if (s.trim()) params.set("search", s.trim())
      const data = await apiFetch(`/api/admin/elo/voters?${params}`)
      setVoters(data?.voters || [])
      setTotal(data?.total || 0)
    } catch {
      setVoters([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchVoters(1, "") }, [])

  const handleSearch = () => { setPage(1); fetchVoters(1, search) }

  const handleResetWarnings = async (id: number) => {
    if (!confirm("Reset vote warnings for this user?")) return
    try {
      await apiFetch(`/api/admin/elo/voters/${id}/reset-warnings`, { method: "PUT" })
      fetchVoters(page, search)
    } catch { /* ignore */ }
  }

  const handleClearTodayVotes = async (id: number) => {
    if (!confirm("Delete today's votes for this user? This resets their cooldown.")) return
    try {
      await apiFetch(`/api/admin/elo/voters/${id}/votes`, { method: "DELETE" })
      fetchVoters(page, search)
    } catch { /* ignore */ }
  }

  const totalPages = Math.ceil(total / per)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm text-muted-foreground">{total} voter{total !== 1 ? "s" : ""}</span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 border border-border/50 bg-secondary/30 px-2 py-1">
            <Search className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search name or ID..."
              className="bg-transparent border-0 text-sm text-foreground outline-none w-32 placeholder:text-muted-foreground/50"
            />
          </div>
          <Button size="sm" variant="outline" onClick={handleSearch}>
            <Search className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => fetchVoters(page, search)}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : voters.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
          <Users className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No voters found.</p>
        </div>
      ) : (
        <div className="border border-border/50 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/50 bg-secondary/20">
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">ID</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Name</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Votes</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Today</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Warnings</th>
                <th className="text-center px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Slots</th>
                <th className="text-right px-3 py-2.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {voters.map((v) => (
                <tr key={v.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                  <td className="px-3 py-3 text-xs text-muted-foreground">#{v.id}</td>
                  <td className="px-3 py-3">
                    <Link
                      href={`/dashboard/elo/users/${v.id}`}
                      className="text-sm text-foreground hover:text-primary transition-colors"
                    >
                      {v.name}
                    </Link>
                    <p className="text-[10px] text-muted-foreground">{v.email}</p>
                  </td>
                  <td className="px-3 py-3 text-center text-sm tabular-nums">{v.totalVotes}</td>
                  <td className="px-3 py-3 text-center text-sm tabular-nums">{v.votesToday}</td>
                  <td className="px-3 py-3 text-center">
                    <Badge
                      variant="outline"
                      className={v.voteWarnings > 0 ? "text-destructive border-destructive/30" : "text-muted-foreground"}
                    >
                      {v.voteWarnings}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-center text-sm">{v.eloServerLimit}</td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {v.voteWarnings > 0 && (
                        <button
                          onClick={() => handleResetWarnings(v.id)}
                          className="border border-border/50 bg-secondary/30 p-1.5 text-amber-500 hover:text-amber-400 hover:bg-secondary/60 transition-colors"
                          title="Reset warnings"
                        >
                          <Check className="h-3 w-3" />
                        </button>
                      )}
                      {v.votesToday > 0 && (
                        <button
                          onClick={() => handleClearTodayVotes(v.id)}
                          className="border border-border/50 bg-secondary/30 p-1.5 text-destructive hover:text-destructive/80 hover:bg-secondary/60 transition-colors"
                          title="Clear today's votes"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1}
            onClick={() => { setPage(page - 1); fetchVoters(page - 1, search) }}>
            Previous
          </Button>
          <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages}
            onClick={() => { setPage(page + 1); fetchVoters(page + 1, search) }}>
            Next
          </Button>
        </div>
      )}
    </div>
  )
}
