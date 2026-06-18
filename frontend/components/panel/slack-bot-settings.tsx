"use client"

import { useState, useEffect } from "react"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { GitBranch, MessageSquare, Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react"

interface McpTool {
  name: string
  description: string
  endpoint: string
  apiKey?: string
}

interface SlackConfig {
  linked: boolean
  slackUserId?: string
  githubLogin?: string | null
  hasGithubToken?: boolean
  mcpTools?: McpTool[]
}

export function SlackBotSettings() {
  const [config, setConfig] = useState<SlackConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [slackUserId, setSlackUserId] = useState("")
  const [mcpTools, setMcpTools] = useState<McpTool[]>([])
  const [newTool, setNewTool] = useState<McpTool>({ name: "", description: "", endpoint: "", apiKey: "" })

  useEffect(() => { fetchConfig() }, [])

  async function fetchConfig() {
    try {
      const data = await (await apiFetch(API_ENDPOINTS.slackConfig)).json() as SlackConfig
      setConfig(data)
      if (data.slackUserId) setSlackUserId(data.slackUserId)
      if (data.mcpTools) setMcpTools(data.mcpTools)
    } catch (err) {
      console.error("Failed to fetch Slack config:", err)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    try {
      await apiFetch(API_ENDPOINTS.slackConfig, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackUserId, mcpTools }),
      })
      fetchConfig()
    } catch (err) {
      console.error("Failed to save config:", err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Slack Bot Setup
          </CardTitle>
          <CardDescription>
            Link your Slack account, GitHub, and custom MCP tools. AI provider uses your <strong>Settings → AI</strong> tab config automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="slack-user-id">Your Slack User ID</Label>
            <Input
              id="slack-user-id" name="slack-member-id" autoComplete="off" autoCorrect="off" spellCheck="false"
              value={slackUserId} onChange={(e) => setSlackUserId(e.target.value)} placeholder="U0123456789"
            />
            <p className="text-xs text-muted-foreground">
              Slack → your profile → Profile → ••• → Copy member ID
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" /> GitHub Integration
          </CardTitle>
          <CardDescription>Link GitHub to let the bot read, edit, and create PRs on your repos.</CardDescription>
        </CardHeader>
        <CardContent>
          {config?.hasGithubToken ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <span>Linked as <strong>{config.githubLogin}</strong></span>
              </div>
              <Button variant="outline" size="sm" onClick={async () => {
                await apiFetch(API_ENDPOINTS.slackGithubUnlink, { method: "DELETE" })
                fetchConfig()
              }}>
                <Trash2 className="h-4 w-4 mr-2" /> Unlink
              </Button>
            </div>
          ) : (
            <Button onClick={() => window.location.href = API_ENDPOINTS.slackGithubStart}>
              <GitBranch className="h-4 w-4 mr-2" /> Link GitHub Account
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Custom MCP Tools</CardTitle>
          <CardDescription>Add MCP servers the bot can use in addition to built-in EcliPanel tools.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mcpTools.map((tool, i) => (
            <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="font-medium">{tool.name}</div>
                <div className="text-xs text-muted-foreground">{tool.endpoint}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setMcpTools(mcpTools.filter((_, j) => j !== i))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Tool name" value={newTool.name} onChange={(e) => setNewTool({ ...newTool, name: e.target.value })} />
            <Input placeholder="Endpoint URL" value={newTool.endpoint} onChange={(e) => setNewTool({ ...newTool, endpoint: e.target.value })} />
            <Input placeholder="Description (optional)" value={newTool.description} onChange={(e) => setNewTool({ ...newTool, description: e.target.value })} className="col-span-2" />
            <Input placeholder="API Key (optional)" type="password" value={newTool.apiKey} onChange={(e) => setNewTool({ ...newTool, apiKey: e.target.value })} className="col-span-2" />
          </div>
          <Button onClick={() => {
            if (!newTool.name || !newTool.endpoint) return
            setMcpTools([...mcpTools, { ...newTool }])
            setNewTool({ name: "", description: "", endpoint: "", apiKey: "" })
          }} disabled={!newTool.name || !newTool.endpoint}>
            <Plus className="h-4 w-4 mr-2" /> Add Tool
          </Button>
        </CardContent>
      </Card>

      <Button onClick={saveConfig} disabled={saving} className="w-full">
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Save Configuration
      </Button>
    </div>
  )
}
