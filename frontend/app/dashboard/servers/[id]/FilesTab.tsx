"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { MonacoFileEditor } from "./MonacoFileEditor"
import { formatBytes, displayPath, MONACO_LANGUAGE_MAP } from "./serverTabHelpers"
import { LoadingState } from "./serverTabShared"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Folder, FileText, ChevronRight, FolderPlus, FilePlus, Trash2, Pencil, Copy, Download, X, Save, RefreshCw, Loader2, Plus, Shield, Archive } from "lucide-react"

export function FilesTab({ serverId, sftpInfo, editorSettings }: { serverId: string; sftpInfo?: { host: string; port: number; username?: string; proxied?: boolean } | null; editorSettings?: any }) {
  const [path, setPath] = useState("/")
  const [files, setFiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState("")
  const [saving, setSaving] = useState(false)
  const [showNewFileForm, setShowNewFileForm] = useState(false)
  const [showNewFolderForm, setShowNewFolderForm] = useState(false)
  const [newName, setNewName] = useState("")
  const [selectedNames, setSelectedNames] = useState<string[]>([])
  const [bulkBusy, setBulkBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const breadcrumbs = path.split("/").filter(Boolean)

  const loadFiles = useCallback(async (p: string) => {
    setLoading(true)
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverFiles.replace(":id", serverId) + `?path=${encodeURIComponent(p)}`
      )
      setFiles(Array.isArray(data) ? data : [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [serverId])

  useEffect(() => {
    loadFiles(path)
  }, [path, loadFiles])

  useEffect(() => {
    setSelectedNames([])
  }, [path])

  const fileNameOf = (f: any) => f.name || f.attributes?.name || ""
  const selectableFiles = files.map(fileNameOf).filter(Boolean)
  const allSelected = selectableFiles.length > 0 && selectableFiles.every((n) => selectedNames.includes(n))

  const toggleOne = (name: string) => {
    setSelectedNames((prev) => prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name])
  }

  const toggleAll = () => {
    setSelectedNames((prev) => allSelected ? [] : selectableFiles)
  }

  const openFile = async (filePath: string) => {
    try {
      const data = await apiFetch(
        API_ENDPOINTS.serverFileContents.replace(":id", serverId) + `?path=${encodeURIComponent(filePath)}`
      )
      setFileContent(typeof data === "string" ? data : JSON.stringify(data, null, 2))
      setEditingFile(filePath)
    } catch (e: any) {
      alert("Failed to open file: " + e.message)
    }
  }

  const saveFile = async () => {
    if (!editingFile) return
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileWrite.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: editingFile, content: fileContent }),
      })
      setEditingFile(null)
    } catch (e: any) {
      alert("Save failed: " + e.message)
    } finally {
      setSaving(false)
    }
  }

  const deleteFile = async (filePath: string) => {
    if (!confirm(`Delete ${filePath}?`)) return
    try {
      await apiFetch(API_ENDPOINTS.serverFileDelete.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: filePath }),
      })
      loadFiles(path)
    } catch (e: any) {
      alert("Delete failed: " + e.message)
    }
  }

  const createDirectory = async () => {
    if (!newName.trim()) return
    const trimmed = newName.trim()
    const existing = files.find((f: any) => (f.name || f.attributes?.name) === trimmed)
    if (existing) {
      const isDir = existing.is_file === false || existing.type === "folder" || existing.type === "directory"
      alert(isDir ? `A directory named "${trimmed}" already exists.` : `A file named "${trimmed}" already exists.`)
      return
    }
    try {
      await apiFetch(API_ENDPOINTS.serverFileCreateDir.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: path + trimmed }),
      })
      setNewName("")
      setShowNewFolderForm(false)
      loadFiles(path)
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const createNewFile = async () => {
    if (!newName.trim()) return
    const trimmed = newName.trim()
    const existing = files.find((f: any) => (f.name || f.attributes?.name) === trimmed)
    if (existing) {
      const isDir = existing.is_file === false || existing.type === "folder" || existing.type === "directory"
      alert(isDir ? `Cannot create file "${trimmed}" — a directory with that name already exists.` : `A file named "${trimmed}" already exists. Opening it instead.`)
      if (!isDir) openFile(path + trimmed)
      return
    }
    try {
      await apiFetch(API_ENDPOINTS.serverFileWrite.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path: path + trimmed, content: "" }),
      })
      setNewName("")
      setShowNewFileForm(false)
      loadFiles(path)
    } catch (e: any) {
      alert("Failed: " + e.message)
    }
  }

  const archiveSelected = async () => {
    if (selectedNames.length === 0) return
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileArchive.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ root: path, files: selectedNames }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert("Archive failed: " + e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const moveSelected = async () => {
    if (selectedNames.length === 0) return
    const destination = prompt("Move selected items to folder (relative to current directory). Example: backups or nested/folder", "")
    if (destination === null) return
    const cleanDest = destination.trim().replace(/^\/+|\/+$/g, "")
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileMove.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ root: path, files: selectedNames, destination: cleanDest }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert("Move failed: " + e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  const chmodSelected = async () => {
    if (selectedNames.length === 0) return
    const mode = prompt("Set permission mode (octal) for selected items, e.g. 0644 or 0755", "0644")
    if (!mode) return
    if (!/^[0-7]{3,4}$/.test(mode)) {
      alert("Invalid mode. Use octal e.g. 0644 or 0755")
      return
    }
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileChmod.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ root: path, files: selectedNames.map((fileName) => ({ file: fileName, mode })) }),
      })
      setSelectedNames([])
      await loadFiles(path)
      alert(`Permissions updated to ${mode}`)
    } catch (e: any) {
      alert("Bulk permission update failed: " + (e?.message || e))
    } finally {
      setBulkBusy(false)
    }
  }

  const chmodFile = async (filePath: string) => {
    const mode = prompt("Set permission mode (octal), e.g. 0644", "0644")
    if (!mode) return
    if (!/^[0-7]{3,4}$/.test(mode)) {
      alert("Invalid mode. Use octal e.g. 0644 or 0755")
      return
    }

    try {
      await apiFetch(API_ENDPOINTS.serverFileChmod.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({
          root: path,
          files: [{ file: filePath, mode }],
        }),
      })
      await loadFiles(path)
      alert(`Permissions updated to ${mode}`)
    } catch (e: any) {
      alert("Permission update failed: " + (e?.message || e))
    }
  }

  const deleteSelected = async () => {
    if (selectedNames.length === 0) return
    if (!confirm(`Delete ${selectedNames.length} selected item(s)?`)) return
    setBulkBusy(true)
    try {
      await apiFetch(API_ENDPOINTS.serverFileDelete.replace(":id", serverId), {
        method: "POST",
        body: JSON.stringify({ path, files: selectedNames, bulk: true }),
      })
      setSelectedNames([])
      await loadFiles(path)
    } catch (e: any) {
      alert("Bulk delete failed: " + e.message)
    } finally {
      setBulkBusy(false)
    }
  }

  if (editingFile) {
    const ext = editingFile.split(".").pop()?.toLowerCase() || ""
    const monacoLang = MONACO_LANGUAGE_MAP[ext] || "plaintext"

    return (
      <div className="flex flex-col">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <button onClick={() => setEditingFile(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-mono text-foreground truncate">{displayPath(editingFile)}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" onClick={() => setEditingFile(null)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveFile} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
              Save
            </Button>
          </div>
        </div>
        <MonacoFileEditor
          value={fileContent}
          onChange={(v) => setFileContent(v ?? "")}
          language={monacoLang}
          editorSettings={editorSettings}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {sftpInfo && sftpInfo.username && (
        <div className="flex items-center gap-3 border-b border-border bg-secondary/10 px-4 py-2.5">
          <Folder className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <code className="text-xs font-mono text-muted-foreground flex-1 truncate">
            sftp {sftpInfo.username}@{sftpInfo.host} -P {sftpInfo.port}
          </code>
          <button
            onClick={() => navigator.clipboard.writeText(`sftp ${sftpInfo!.username}@${sftpInfo!.host} -P ${sftpInfo!.port}`)}
            className="text-xs text-primary hover:underline shrink-0 flex items-center gap-1"
          >
            <Copy className="h-3 w-3" /> Copy
          </button>
          {sftpInfo.proxied && <span className="text-[10px] text-yellow-400/80 shrink-0">proxied</span>}
        </div>
      )}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-1.5 text-sm">
          <button onClick={() => setPath("/")} className="text-primary hover:underline font-mono">/home/container</button>
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <button
                onClick={() => setPath("/" + breadcrumbs.slice(0, i + 1).join("/") + "/")}
                className="text-primary hover:underline font-mono"
              >
                {crumb}
              </button>
            </span>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" className="hidden" onChange={async (e) => {
            const files = e.target.files
            if (!files || files.length === 0) return
            setUploading(true)
            try {
              for (let i = 0; i < files.length; i++) {
                const f = files[i]
                const content = await f.text()
                await apiFetch(API_ENDPOINTS.serverFileWrite.replace(":id", serverId), {
                  method: "POST",
                  body: JSON.stringify({ path: path + f.name, content }),
                })
              }
              await loadFiles(path)
            } catch (err: any) {
              alert('Upload failed: ' + (err?.message || err))
            } finally {
              setUploading(false)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }
          }} />
          {selectedNames.length > 0 && (
            <>
              <span className="text-xs text-muted-foreground">{selectedNames.length} selected</span>
              <button
                onClick={archiveSelected}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60"
              >
                <Archive className="h-3 w-3" /> Archive Selected
              </button>
              <button
                onClick={moveSelected}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60"
              >
                <Folder className="h-3 w-3" /> Move Selected
              </button>
              <button
                onClick={chmodSelected}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80 disabled:opacity-60"
              >
                <Shield className="h-3 w-3" /> Chmod Selected
              </button>
              <button
                onClick={deleteSelected}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 rounded-md bg-destructive/20 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/30 disabled:opacity-60"
              >
                <Trash2 className="h-3 w-3" /> Delete Selected
              </button>
            </>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
            disabled={uploading || bulkBusy}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Upload
          </button>
          <button
            onClick={() => { setShowNewFileForm(true); setShowNewFolderForm(false); setNewName("") }}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
          >
            <FilePlus className="h-3 w-3" /> New File
          </button>
          <button
            onClick={() => { setShowNewFolderForm(true); setShowNewFileForm(false); setNewName("") }}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
          >
            <FolderPlus className="h-3 w-3" /> New Folder
          </button>
          <button
            onClick={() => loadFiles(path)}
            className="flex items-center gap-1.5 rounded-md bg-secondary px-3 py-1.5 text-xs text-secondary-foreground hover:bg-secondary/80"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </div>

      {(showNewFileForm || showNewFolderForm) && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2 bg-secondary/20">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={showNewFileForm ? "filename.txt" : "folder-name"}
            className="rounded-md border border-border bg-input px-3 py-1.5 text-sm text-foreground outline-none flex-1"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") showNewFileForm ? createNewFile() : createDirectory()
              if (e.key === "Escape") { setShowNewFileForm(false); setShowNewFolderForm(false) }
            }}
          />
          <Button size="sm" onClick={showNewFileForm ? createNewFile : createDirectory}>Create</Button>
          <Button size="sm" variant="ghost" onClick={() => { setShowNewFileForm(false); setShowNewFolderForm(false) }}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <div>
        <div className="hidden sm:grid grid-cols-[28px_1fr_100px_160px_100px] gap-2 bg-secondary/50 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-3.5 w-3.5"
            />
          </span>
          <span>Name</span>
          <span>Size</span>
          <span>Modified</span>
          <span className="text-right">Actions</span>
        </div>

        {path !== "/" && (
          <button
            onClick={() => {
              const parts = path.split("/").filter(Boolean)
              parts.pop()
              setPath(parts.length ? "/" + parts.join("/") + "/" : "/")
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-secondary/20 border-t border-border"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> ..
          </button>
        )}

        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" /> Loading files...
          </div>
        ) : files.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            Empty directory
          </div>
        ) : (
          files.map((file: any, i: number) => {
            const fname = file.name || file.attributes?.name || "unknown"
            const isDir = file.directory === true || file.is_file === false || file.type === "folder" || file.type === "directory"
            const fsize = file.size || file.attributes?.size || 0
            const fmod = file.modified || file.modified_at || file.attributes?.modified_at

            return (
              <div
                key={i}
                className="group flex items-center justify-between sm:grid sm:grid-cols-[28px_1fr_100px_160px_100px] gap-2 px-4 py-2.5 text-sm border-t border-border hover:bg-secondary/20 transition-colors"
              >
                <span>
                  <input
                    type="checkbox"
                    checked={selectedNames.includes(fname)}
                    onChange={() => toggleOne(fname)}
                    className="h-3.5 w-3.5"
                  />
                </span>
                <button
                  onClick={() => isDir ? setPath(path + fname + "/") : openFile(path + fname)}
                  className="flex items-center gap-2 text-foreground text-left hover:text-primary transition-colors truncate min-w-0"
                >
                  {isDir ? (
                    <Folder className="h-4 w-4 text-primary/70 flex-shrink-0" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <span className="truncate">{fname}</span>
                  <span className="text-xs text-muted-foreground sm:hidden flex-shrink-0">
                    {!isDir ? formatBytes(fsize) : ""}
                  </span>
                </button>
                <span className="hidden sm:block text-xs text-muted-foreground">
                  {!isDir ? formatBytes(fsize) : "\u2014"}
                </span>
                <span className="hidden sm:block text-xs text-muted-foreground">
                  {fmod ? new Date(fmod).toLocaleDateString() : "\u2014"}
                </span>
                <div className="flex items-center justify-end gap-1 flex-shrink-0 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  {!isDir && (
                    <button
                      onClick={() => openFile(path + fname)}
                      className="rounded p-1 text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isDir && (
                    <button
                      onClick={async () => {
                        const newName = prompt('Rename file to', fname)
                        if (!newName || newName === fname) return
                        try {
                          await apiFetch(API_ENDPOINTS.serverFileRename.replace(":id", serverId), {
                            method: 'PUT',
                            body: JSON.stringify({
                              root: path,
                              files: [{ from: fname, to: newName }],
                            }),
                          })
                          await loadFiles(path)
                        } catch (e: any) {
                          alert('Rename failed: ' + (e?.message || e))
                        }
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                      title="Rename"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {!isDir && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await fetch(
                            API_ENDPOINTS.serverFileDownload.replace(":id", serverId) + `?path=${encodeURIComponent(path + fname)}`,
                            {
                              credentials: 'include',
                              headers: {
                                Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
                              },
                            }
                          )
                          if (!res.ok) {
                            const text = await res.text()
                            throw new Error(text || `HTTP ${res.status}`)
                          }
                          const blob = await res.blob()
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = fname
                          document.body.appendChild(a)
                          a.click()
                          a.remove()
                          URL.revokeObjectURL(url)
                        } catch (e: any) {
                          alert('Download failed: ' + (e?.message || e))
                        }
                      }}
                      className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                      title="Download"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => chmodFile(path + fname)}
                    className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                    title="Change permissions"
                  >
                    <Shield className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => deleteFile(path + fname)}
                    className="rounded p-1 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
