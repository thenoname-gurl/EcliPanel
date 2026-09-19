"use client"

import { useState, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Trash2, RefreshCw, Search, Globe, Package } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

type SharedBlock = {
  id: number; name: string; description: string | null; code: string
  authorUserId: number; authorName: string | null; downloads: number
  tags: string[]; createdAt: string
}

type BlockPack = {
  id: number; name: string; description: string | null; authorUserId: number
  authorName: string | null; items: { name: string; code: string }[]
  tags: string[]; isPublic: boolean; downloads: number; createdAt: string
}

type Tab = "shared" | "packs"

export default function ModerationTab() {
  const { toast } = useToast()
  const [tab, setTab] = useState<Tab>("shared")
  const [shared, setShared] = useState<SharedBlock[]>([])
  const [packs, setPacks] = useState<BlockPack[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const TAKE = 50

  const loadShared = useCallback(async (reset = true) => {
    setLoading(true)
    try {
      const skip = reset ? 0 : (page - 1) * TAKE
      const params: Record<string, string> = { skip: String(skip), take: String(TAKE) }
      if (search) params.search = search
      const qs = new URLSearchParams(params).toString()
      const data = (await apiFetch(`/api/infrastructure/visual-editor/admin/shared-blocks?${qs}`)) as SharedBlock[]
      if (reset) { setShared(data); setPage(1) }
      else { setShared(prev => [...prev, ...data]) }
      setHasMore(data.length >= TAKE)
    } catch { if (reset) setShared([]) }
    finally { setLoading(false) }
  }, [page, search])

  const loadPacks = useCallback(async (reset = true) => {
    setLoading(true)
    try {
      const skip = reset ? 0 : (page - 1) * TAKE
      const params: Record<string, string> = { skip: String(skip), take: String(TAKE) }
      if (search) params.search = search
      const qs = new URLSearchParams(params).toString()
      const data = (await apiFetch(`/api/infrastructure/visual-editor/admin/block-packs?${qs}`)) as BlockPack[]
      if (reset) { setPacks(data); setPage(1) }
      else { setPacks(prev => [...prev, ...data]) }
      setHasMore(data.length >= TAKE)
    } catch { if (reset) setPacks([]) }
    finally { setLoading(false) }
  }, [page, search])

  useEffect(() => {
    if (tab === "shared") loadShared(true)
    else loadPacks(true)
  }, [tab, search, loadShared, loadPacks])

  const deleteShared = async (id: number, name: string) => {
    if (!confirm(`Remove shared block "${name}"?`)) return
    try {
      await apiFetch(`/api/infrastructure/visual-editor/admin/shared-blocks/${id}`, { method: "DELETE" })
      setShared(prev => prev.filter(s => s.id !== id))
      toast({ title: "Removed", description: `"${name}" has been removed` })
    } catch { toast({ title: "Failed to remove", variant: "destructive" }) }
  }

  const deletePack = async (id: number, name: string) => {
    if (!confirm(`Remove block pack "${name}"?`)) return
    try {
      await apiFetch(`/api/infrastructure/visual-editor/admin/block-packs/${id}`, { method: "DELETE" })
      setPacks(prev => prev.filter(p => p.id !== id))
      toast({ title: "Removed", description: `Pack "${name}" has been removed` })
    } catch { toast({ title: "Failed to remove", variant: "destructive" }) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Visual Editor Marketplace</h3>
          <span className="text-xs text-muted-foreground/50">Moderate shared blocks & packs</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
            onClick={() => tab === "shared" ? loadShared(true) : loadPacks(true)}>
            <RefreshCw className="h-3 w-3" /> Refresh
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex gap-0.5 border border-border/20 rounded p-0.5">
          <button onClick={() => { setTab("shared"); setSearch(""); setPage(1) }}
            className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors
              ${tab === "shared" ? "bg-primary/20 text-primary" : "text-muted-foreground/50 hover:text-foreground hover:bg-accent/30"}`}>
            Shared Blocks ({shared.length})
          </button>
          <button onClick={() => { setTab("packs"); setSearch(""); setPage(1) }}
            className={`px-2.5 py-1 text-[11px] rounded font-medium transition-colors
              ${tab === "packs" ? "bg-primary/20 text-primary" : "text-muted-foreground/50 hover:text-foreground hover:bg-accent/30"}`}>
            Block Packs ({packs.length})
          </button>
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search..." className="h-7 pl-7 text-xs" />
        </div>
      </div>

      {loading && shared.length === 0 && packs.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground/30" />
        </div>
      ) : (
        <div className="space-y-1">
          {tab === "shared" && shared.length === 0 && (
            <p className="text-xs text-muted-foreground/40 text-center py-8">No shared blocks found.</p>
          )}
          {tab === "packs" && packs.length === 0 && (
            <p className="text-xs text-muted-foreground/40 text-center py-8">No block packs found.</p>
          )}

          {tab === "shared" && shared.map(entry => (
            <div key={entry.id}
              className="flex items-center gap-3 p-3 border border-border/20 bg-card/30 hover:bg-accent/20 transition-colors group">
              <div className="w-7 h-7 rounded flex items-center justify-center bg-primary/10 shrink-0">
                <Globe className="h-3.5 w-3.5 text-primary/60" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate">{entry.name}</div>
                <div className="text-[10px] text-muted-foreground/50 truncate">
                  {entry.description || entry.code.slice(0, 80)}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground/40">{entry.authorName || 'Anonymous'}</span>
                  <span className="text-[10px] text-muted-foreground/20">|</span>
                  <span className="text-[10px] text-muted-foreground/40">{entry.downloads} downloads</span>
                  <span className="text-[10px] text-muted-foreground/20">|</span>
                  <span className="text-[10px] text-muted-foreground/40">user #{entry.authorUserId}</span>
                  {entry.tags.length > 0 && (
                    <>
                      <span className="text-[10px] text-muted-foreground/20">|</span>
                      <div className="flex gap-0.5">
                        {entry.tags.slice(0, 4).map(t => (
                          <span key={t} className="text-[9px] px-1 py-0 rounded bg-primary/10 text-primary/50">{t}</span>
                        ))}
                        {entry.tags.length > 4 && <span className="text-[9px] text-muted-foreground/30">+{entry.tags.length - 4}</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="destructive" className="h-6 text-[10px] gap-1"
                  onClick={() => deleteShared(entry.id, entry.name)}>
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ))}

          {tab === "packs" && packs.map(pack => (
            <div key={pack.id}
              className="flex items-center gap-3 p-3 border border-border/20 bg-card/30 hover:bg-accent/20 transition-colors group">
              <div className="w-7 h-7 rounded flex items-center justify-center bg-amber-400/10 shrink-0">
                <Package className="h-3.5 w-3.5 text-amber-400/60" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium truncate flex items-center gap-1.5">
                  {pack.name}
                  {pack.isPublic
                    ? <span className="text-[9px] text-green-400/60 bg-green-500/10 px-1 rounded">Public</span>
                    : <span className="text-[9px] text-muted-foreground/40 bg-muted/30 px-1 rounded">Private</span>}
                </div>
                <div className="text-[10px] text-muted-foreground/50 truncate">
                  {pack.description || `${pack.items.length} blocks`}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-[10px] text-muted-foreground/40">{pack.authorName || 'Anonymous'}</span>
                  <span className="text-[10px] text-muted-foreground/20">|</span>
                  <span className="text-[10px] text-muted-foreground/40">{pack.items.length} blocks</span>
                  {pack.isPublic && (
                    <>
                      <span className="text-[10px] text-muted-foreground/20">|</span>
                      <span className="text-[10px] text-muted-foreground/40">{pack.downloads} downloads</span>
                    </>
                  )}
                  <span className="text-[10px] text-muted-foreground/20">|</span>
                  <span className="text-[10px] text-muted-foreground/40">user #{pack.authorUserId}</span>
                  {pack.tags.length > 0 && (
                    <>
                      <span className="text-[10px] text-muted-foreground/20">|</span>
                      <div className="flex gap-0.5">
                        {pack.tags.slice(0, 4).map(t => (
                          <span key={t} className="text-[9px] px-1 py-0 rounded bg-amber-400/10 text-amber-400/50">{t}</span>
                        ))}
                        {pack.tags.length > 4 && <span className="text-[9px] text-muted-foreground/30">+{pack.tags.length - 4}</span>}
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="destructive" className="h-6 text-[10px] gap-1"
                  onClick={() => deletePack(pack.id, pack.name)}>
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {hasMore && (
        <Button size="sm" variant="outline" className="h-7 text-xs"
          onClick={() => { setPage(p => p + 1); tab === "shared" ? loadShared(false) : loadPacks(false) }}
          disabled={loading}>
          {loading ? <RefreshCw className="h-3 w-3 animate-spin mr-1" /> : null}
          Load more
        </Button>
      )}
    </div>
  )
}
