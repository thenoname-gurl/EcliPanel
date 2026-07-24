"use client"

import { useCallback, useEffect, useState, lazy, Suspense } from "react"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { apiFetch } from "@/lib/api-client"
import { DEFAULT_EDITOR_SETTINGS } from "@/lib/editor-settings"
import { Button } from "@/components/ui/button"
import {
  Shield, ShieldAlert, AlertTriangle, AlertCircle, Bug, RefreshCw,
  ScanLine, Search, ChevronDown, Check, CheckCircle, X, Lightbulb,
  FileSearch, EyeOff, Siren, Server,
} from "lucide-react"
import {
  severityConfig, SeverityBadge, SectionHeader, Field, StatCard,
  inputCls, selectCls,
} from "./shared"

const MonacoEditor = lazy(() => import("@monaco-editor/react").then((m) => ({ default: m.default })))

// ─── Constants ──────────────────────────────────────────────────────────────────

const VALID_OPERATORS = ['equals', 'not_equals', 'contains', 'not_contains', 'regex', 'not_regex', 'gt', 'gte', 'lt', 'lte', 'exists', 'not_exists']

const FIELD_OPTIONS = [
  { v: 'action', l: 'action', src: 'user_log' },
  { v: 'userId', l: 'userId', src: 'user_log' },
  { v: 'targetId', l: 'targetId (server UUID)', src: 'user_log' },
  { v: 'targetType', l: 'targetType', src: 'user_log' },
  { v: 'ipAddress', l: 'ipAddress', src: 'user_log' },
  { v: 'file.name', l: 'file.name', src: 'file_scan' },
  { v: 'process.name', l: 'process.name', src: 'wings_processes' },
  { v: 'process.cpu', l: 'process.cpu', src: 'wings_processes' },
  { v: 'process.memory', l: 'process.memory', src: 'wings_processes' },
  { v: 'metadata.country', l: 'metadata.country', src: 'user_log' },
  { v: 'metadata.command', l: 'metadata.command', src: 'user_log' },
  { v: 'metadata.serverName', l: 'metadata.serverName', src: 'user_log' },
  { v: 'metadata.reason', l: 'metadata.reason', src: 'user_log' },
  { v: 'metadata.powerAction', l: 'metadata.powerAction', src: 'user_log' },
  { v: 'suspended', l: 'suspended (bool)', src: 'server_config' },
  { v: 'cpu', l: 'cpu', src: 'server_config' },
  { v: 'memory', l: 'memory', src: 'server_config' },
  { v: 'state', l: 'state', src: 'server_config' },
  { v: 'image', l: 'image', src: 'server_config' },
  { v: 'serverId', l: 'serverId', src: 'soc_data' },
]

const FIELD_SOURCES: Record<string, string[]> = {
  action: ['user_log'], userId: ['user_log', 'server_config'],
  targetId: ['user_log'], targetType: ['user_log'], ipAddress: ['user_log'],
  serverId: ['soc_data'], uuid: ['server_config'], name: ['server_config'],
  nodeId: ['server_config'], suspended: ['server_config'], cpu: ['server_config'],
  memory: ['server_config'], disk: ['server_config'], state: ['server_config'],
  image: ['server_config'], 'file.name': ['file_scan'],
  'process.name': ['wings_processes'], 'process.pid': ['wings_processes'],
  'process.cpu': ['wings_processes'], 'process.memory': ['wings_processes'],
  metadata: ['user_log', 'soc_data', 'server_config'],
}

function getSourcesForField(field: string): string[] {
  const root = field.split('.')[0]
  return FIELD_SOURCES[root] || FIELD_SOURCES[field] || []
}

// ─── Rule Handbook ──────────────────────────────────────────────────────────────

function RuleHandbook() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const toggle = (k: string) => setExpanded(e => ({ ...e, [k]: !e[k] }))

  const Section = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border border-border rounded overflow-hidden">
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded[id] ? "rotate-180" : ""}`} />
      </button>
      {expanded[id] && <div className="px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">{children}</div>}
    </div>
  )

  return (
    <div className="flex flex-col gap-2 max-h-[65vh] overflow-y-auto rounded border border-border bg-card p-3">
      <p className="text-xs font-semibold text-foreground px-1 pb-1">Detection Rule Handbook</p>
      <Section id="structure" title="Condition Structure">
        <p className="mb-2">Rules use a <b>Wazuh-style JSON condition tree</b> with a top-level <code className="bg-secondary/40 px-1 rounded">operator</code> (and/or) and a <code className="bg-secondary/40 px-1 rounded">rules</code> array.</p>
        <pre className="bg-secondary/20 border border-border rounded p-2 text-[10px] overflow-x-auto">{`{
  "operator": "or",
  "rules": [
    { "field": "file.name", "operator": "regex", "value": "(xmrig|miner)" },
    { "field": "process.name", "operator": "contains", "value": "xmrig" }
  ]
}`}</pre>
      </Section>
      <Section id="operators" title="Condition Operators">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {[
            ['equals', 'Exact match (case-insensitive)'],
            ['not_equals', 'Does not match'],
            ['contains', 'Field contains substring'],
            ['not_contains', 'Does not contain substring'],
            ['regex', 'Matches regex pattern'],
            ['not_regex', 'Does NOT match regex'],
            ['gt / gte', 'Greater than / or equal (numeric)'],
            ['lt / lte', 'Less than / or equal (numeric)'],
            ['exists', 'Field is present — no value needed'],
            ['not_exists', 'Field is absent — no value needed'],
          ].map(([op, desc]) => (
            <div key={op} className="flex gap-2 p-1.5 rounded border border-border/60 bg-secondary/10">
              <code className="shrink-0 bg-secondary/40 px-1 rounded text-[10px] text-foreground font-medium">{op}</code>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section id="fields" title="Field Reference">
        <div className="flex flex-col gap-2">
          {[
            { src: "user_log", desc: "User & agent actions", fields: ["action", "userId", "targetId", "targetType", "ipAddress", "timestamp", "metadata.*"] },
            { src: "soc_data", desc: "Wings telemetry, DPI results, anti-abuse samples", fields: ["serverId", "metrics.cpu", "metrics.networkRx", "metrics.networkTx", "metrics.dpiHits", "metrics.strikeCount"] },
            { src: "server_config", desc: "Server provisioning data", fields: ["uuid", "name", "nodeId", "userId", "suspended", "cpu", "memory", "disk", "state", "image"] },
            { src: "file_scan", desc: "Wings file scan — each file is a separate event", fields: ["file.name"] },
            { src: "wings_processes", desc: "Running processes on servers", fields: ["process.name", "process.pid", "process.cpu", "process.memory"] },
          ].map(({ src, desc, fields }) => (
            <div key={src} className="border border-border/60 rounded p-2 bg-secondary/10">
              <p className="font-semibold text-foreground text-[11px] mb-0.5">{src}</p>
              <p className="mb-1">{desc}</p>
              <div className="flex flex-wrap gap-1">
                {fields.map(f => <code key={f} className="bg-secondary/40 px-1 rounded text-[10px] text-foreground">{f}</code>)}
              </div>
            </div>
          ))}
        </div>
      </Section>
      <Section id="frequency" title="Frequency Thresholds">
        <p className="mb-2">Fire only when conditions match at least <code className="bg-secondary/40 px-1 rounded">count</code> times within a sliding <code className="bg-secondary/40 px-1 rounded">windowSeconds</code> window.</p>
        <pre className="bg-secondary/20 border border-border rounded p-2 text-[10px]">{`{ "count": 5, "windowSeconds": 300 }`}</pre>
      </Section>
      <Section id="correlation" title="Cross-Source Correlation">
        <p className="mb-2">Trigger when N distinct values of a field appear across matched events within the frequency window.</p>
        <pre className="bg-secondary/20 border border-border rounded p-2 text-[10px]">{`{ "field": "targetId", "minSources": 3 }`}</pre>
      </Section>
      <Section id="recipes" title="Common Rule Recipes">
        <div className="flex flex-col gap-1.5">
          {[
            ['Brute force detection', 'user_log | action contains "fail" + frequency {count:5, windowSeconds:300}'],
            ['Crypto miner file scan', 'file_scan | file.name regex "(xmrig|minerd|cpuminer|t-rex)"'],
            ['Miner process detection', 'wings_processes | process.name regex "(xmrig|xmr-stak)"'],
            ['Foreign IP login alert', 'user_log | action contains "login" + metadata.country not_equals "US"'],
            ['High CPU abuse', 'soc_data | metrics.cpu gte 90 + frequency {count:3, windowSeconds:600}'],
            ['Multi-target attack', 'user_log | action contains "fail" + correlation {field:"targetId", minSources:3}'],
          ].map(([title, recipe]) => (
            <div key={title} className="flex flex-col gap-0.5 p-2 rounded border border-border/60 bg-secondary/10">
              <span className="font-semibold text-foreground text-[11px]">{title}</span>
              <span className="text-[10px]">{recipe}</span>
            </div>
          ))}
        </div>
      </Section>
      <Section id="nodesync" title="Node Config Sync">
        <p className="mb-1.5">Wings nodes poll <code className="bg-secondary/40 px-1 rounded">/api/wings/config</code> every 2 minutes.</p>
        <ul className="space-y-1">
          <li><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" /><b className="text-foreground">Synced</b> — node has latest config</li>
          <li><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1.5" /><b className="text-foreground">Stale</b> — click Reapply to force refresh</li>
          <li><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" /><b className="text-foreground">Offline</b> — no heartbeat in 2+ minutes</li>
        </ul>
      </Section>
    </div>
  )
}

// ─── Rule Form ──────────────────────────────────────────────────────────────────

function RuleForm({ initial, onSaved, onCancel }: {
  initial?: any; onSaved: () => void; onCancel: () => void
}) {
  const [name, setName] = useState(initial?.name || '')
  const [desc, setDesc] = useState(initial?.description || '')
  const [severity, setSeverity] = useState(initial?.severity || 'medium')
  const [category, setCategory] = useState(initial?.category || 'other')
  const [sources, setSources] = useState((initial?.sources || ['user_log']).join(', '))
  const [scope, setScope] = useState(initial?.scope || 'global')
  const [scopeId, setScopeId] = useState(initial?.scopeId || '')
  const [conditionsJson, setConditionsJson] = useState(
    JSON.stringify(initial?.conditions || { operator: 'and', rules: [{ field: 'action', operator: 'contains', value: 'fail' }] }, null, 2)
  )
  const [frequencyJson, setFrequencyJson] = useState(initial?.frequency ? JSON.stringify(initial.frequency, null, 2) : '')
  const [correlationJson, setCorrelationJson] = useState(initial?.correlation ? JSON.stringify(initial.correlation, null, 2) : '')
  const [visibility, setVisibility] = useState(initial?.visibility || 'public')
  const [createsIncident, setCreatesIncident] = useState(initial?.createsIncident || false)
  const [saving, setSaving] = useState(false)
  const [validation, setValidation] = useState<{ ok: boolean; messages: string[] } | null>(null)
  const [visualMode, setVisualMode] = useState(false)
  const [visualRoot, setVisualRoot] = useState<any>(() => {
    try {
      return JSON.parse(initial?.conditions
        ? JSON.stringify(initial.conditions)
        : '{"operator":"and","rules":[{"field":"action","operator":"contains","value":"fail"}]}')
    } catch { return { operator: 'and', rules: [{ field: 'action', operator: 'contains', value: 'fail' }] } }
  })

  useEffect(() => { if (visualMode) setConditionsJson(JSON.stringify(visualRoot, null, 2)) }, [visualRoot, visualMode])

  const renderVisualGroup = (group: any, setGroup: (g: any) => void): React.ReactNode => (
    <div className="border border-border/60 rounded p-2.5 flex flex-col gap-2 bg-secondary/10">
      <div className="flex items-center gap-2">
        <select value={group.operator} onChange={e => setGroup({ ...group, operator: e.target.value })}
          className="border border-border bg-card px-2 py-1 text-xs rounded">
          <option value="and">AND — all must match</option>
          <option value="or">OR — any can match</option>
        </select>
        <span className="text-[10px] text-muted-foreground">{group.rules.length} condition(s)</span>
        <div className="flex-1" />
        <button onClick={() => setGroup({ ...group, rules: [...group.rules, { field: 'action', operator: 'contains', value: '' }] })}
          className="text-[10px] px-2 py-1 rounded border border-border hover:bg-secondary/60">+ Condition</button>
        <button onClick={() => setGroup({ ...group, rules: [...group.rules, { operator: 'and', rules: [{ field: 'action', operator: 'contains', value: '' }] }] })}
          className="text-[10px] px-2 py-1 rounded border border-border hover:bg-secondary/60">+ Group</button>
      </div>
      {group.rules.map((r: any, i: number) => (
        <div key={i} className="pl-3 border-l-2 border-primary/20">
          {r.operator && r.rules ? (
            renderVisualGroup(r, (g) => { const n = [...group.rules]; n[i] = g; setGroup({ ...group, rules: n }) })
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <select value={r.field || ''}
                onChange={e => { const n = [...group.rules]; n[i] = { ...r, field: e.target.value }; setGroup({ ...group, rules: n }) }}
                className="border border-border bg-card px-1.5 py-1 text-[10px] rounded min-w-[140px]">
                <option value="">— select field —</option>
                {FIELD_OPTIONS.map(f => {
                  const selectedSrcs = sources.split(',').map((s: string) => s.trim()).filter(Boolean)
                  const srcOk = !f.src || selectedSrcs.includes(f.src)
                  return <option key={f.v} value={f.v}>{f.l}{!srcOk ? ` (needs ${f.src})` : ''}</option>
                })}
              </select>
              <select value={r.operator || 'contains'}
                onChange={e => { const n = [...group.rules]; n[i] = { ...r, operator: e.target.value }; setGroup({ ...group, rules: n }) }}
                className="border border-border bg-card px-1.5 py-1 text-[10px] rounded">
                {VALID_OPERATORS.map(op => <option key={op} value={op}>{op}</option>)}
              </select>
              {!['exists', 'not_exists'].includes(r.operator) && (
                <input value={r.value || ''}
                  onChange={e => { const n = [...group.rules]; n[i] = { ...r, value: e.target.value }; setGroup({ ...group, rules: n }) }}
                  placeholder="value" className="border border-border bg-card px-2 py-1 text-[10px] rounded flex-1 min-w-[80px]" />
              )}
              <button onClick={() => { const n = group.rules.filter((_: any, idx: number) => idx !== i); setGroup({ ...group, rules: n }) }}
                className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-500/15 text-red-500 font-bold">×</button>
            </div>
          )}
        </div>
      ))}
    </div>
  )

  const validateRule = () => {
    const msgs: string[] = []
    const selectedSources = sources.split(',').map((s: string) => s.trim()).filter(Boolean)
    const fieldSourceProblems: string[] = []

    try {
      const c = JSON.parse(conditionsJson)
      if (!c.operator || !['and', 'or'].includes(c.operator)) msgs.push('Conditions: missing or invalid "operator"')
      if (!Array.isArray(c.rules) || c.rules.length === 0) msgs.push('Conditions: "rules" must be a non-empty array')
      const checkRules = (rules: any[]) => {
        for (const r of rules) {
          if (r.operator && r.rules) { checkRules(r.rules); continue }
          if (!r.field) msgs.push('Missing "field" in a condition')
          if (!r.operator) msgs.push('Missing "operator" in a condition')
          else if (!VALID_OPERATORS.includes(r.operator)) msgs.push(`Unknown operator: "${r.operator}"`)
          if (r.operator && !['exists', 'not_exists'].includes(r.operator) && r.value === undefined)
            msgs.push(`Operator "${r.operator}" requires a "value"`)
          if (r.field) {
            const supported = getSourcesForField(r.field)
            if (supported.length > 0 && !supported.some(s => selectedSources.includes(s)))
              fieldSourceProblems.push(`"${r.field}" needs source: ${supported.join(' or ')}`)
          }
        }
      }
      checkRules(c.rules)
      msgs.push(...fieldSourceProblems)
      if (msgs.length === 0) msgs.push('✓ Conditions: valid')
    } catch { msgs.push('✗ Conditions: invalid JSON') }

    if (frequencyJson.trim()) {
      try {
        const f = JSON.parse(frequencyJson)
        if (typeof f.count !== 'number' || f.count < 1) msgs.push('Frequency: "count" must be ≥ 1')
        else if (typeof f.windowSeconds !== 'number' || f.windowSeconds < 1) msgs.push('Frequency: "windowSeconds" must be ≥ 1')
        else msgs.push('✓ Frequency: valid')
      } catch { msgs.push('✗ Frequency: invalid JSON') }
    }

    if (correlationJson.trim()) {
      try {
        const cr = JSON.parse(correlationJson)
        if (typeof cr.field !== 'string' || !cr.field) msgs.push('Correlation: "field" required')
        else if (typeof cr.minSources !== 'number' || cr.minSources < 2) msgs.push('Correlation: "minSources" must be ≥ 2')
        else msgs.push('✓ Correlation: valid')
        if (!frequencyJson.trim()) msgs.push('⚠ Correlation requires a frequency window')
      } catch { msgs.push('✗ Correlation: invalid JSON') }
    }

    const ok = msgs.every(m => m.startsWith('✓') || m.startsWith('⚠'))
    setValidation({ ok, messages: msgs })
  }

  const save = async () => {
    setSaving(true)
    try {
      let conditions
      try { conditions = JSON.parse(conditionsJson) } catch { alert('Invalid conditions JSON'); setSaving(false); return }
      const body: any = {
        name, description: desc, severity, category,
        sources: sources.split(',').map((s: string) => s.trim()).filter(Boolean),
        scope, visibility, createsIncident, conditions,
      }
      if (scope !== 'global') body.scopeId = scopeId
      if (frequencyJson) { try { body.frequency = JSON.parse(frequencyJson) } catch { } }
      if (correlationJson) { try { body.correlation = JSON.parse(correlationJson) } catch { } }
      const url = initial?.id ? `/api/soc/detection-rules/${initial.id}` : '/api/soc/detection-rules'
      await apiFetch(url, { method: initial?.id ? 'PUT' : 'POST', body: JSON.stringify(body) })
      onSaved()
    } catch (e) { console.error('save rule failed', e) }
    finally { setSaving(false) }
  }

  return (
    <div className="rounded border-2 border-primary/20 bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border bg-secondary/30 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{initial?.id ? 'Edit Rule' : 'New Detection Rule'}</h3>
        <button onClick={onCancel} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-secondary/60">✕</button>
      </div>
      <div className="p-4 flex flex-col gap-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Rule Name"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. SSH brute force detection" className={inputCls} /></Field>
          <Field label="Description"><input value={desc} onChange={e => setDesc(e.target.value)} placeholder="What this rule detects…" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Severity">
            <select value={severity} onChange={e => setSeverity(e.target.value)} className={selectCls}>
              {['critical', 'high', 'medium', 'low', 'info'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select value={category} onChange={e => setCategory(e.target.value)} className={selectCls}>
              {['intrusion_detection', 'resource_anomaly', 'server_posture', 'login_anomaly', 'access_control', 'malware', 'configuration', 'other'].map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Visibility">
            <select value={visibility} onChange={e => setVisibility(e.target.value)} className={selectCls}>
              <option value="public">Public</option>
              <option value="staff_only">Staff Only</option>
            </select>
          </Field>
          <Field label="Scope">
            <select value={scope} onChange={e => setScope(e.target.value)} className={selectCls}>
              <option value="global">Global</option>
              <option value="server">Server</option>
              <option value="user">User</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Sources (comma-separated)" hint="user_log, soc_data, server_config, file_scan, wings_processes">
            <input value={sources} onChange={e => setSources(e.target.value)} placeholder="user_log" className={`${inputCls} font-mono`} />
          </Field>
          {scope !== 'global' && <Field label="Scope ID"><input value={scopeId} onChange={e => setScopeId(e.target.value)} className={inputCls} /></Field>}
        </div>
        <div className="flex items-center gap-2 p-3 rounded bg-secondary/30 border border-border/60">
          <input type="checkbox" id="createsIncident" checked={createsIncident} onChange={e => setCreatesIncident(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
          <label htmlFor="createsIncident" className="text-xs text-foreground/80 cursor-pointer">Create incident in Incidents tab (for abuse enforcement tracking)</label>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-medium text-foreground/80">Conditions</label>
            <button
              onClick={() => {
                if (!visualMode) { try { setVisualRoot(JSON.parse(conditionsJson)) } catch { } }
                else setConditionsJson(JSON.stringify(visualRoot, null, 2))
                setVisualMode(!visualMode)
              }}
              className="text-[10px] px-2.5 py-1 rounded border border-border hover:bg-secondary/60 text-muted-foreground transition-colors"
            >{visualMode ? '{ } Code' : '⬡ Visual'}</button>
          </div>
          {visualMode ? (
            <div className="max-h-[350px] overflow-y-auto rounded border border-border bg-secondary/5 p-2">
              {renderVisualGroup(visualRoot, (g) => setVisualRoot({ ...g }))}
            </div>
          ) : (
            <div className="rounded border border-border overflow-hidden" style={{ height: 200 }}>
              <Suspense fallback={<div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground gap-2"><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading editor…</div>}>
                <MonacoEditor language="json" theme="vs-dark" value={conditionsJson}
                  onChange={(v) => setConditionsJson(v || '')}
                  options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 12, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }} />
              </Suspense>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-1 font-mono opacity-60">{'{"operator":"and","rules":[{"field":"action","operator":"contains","value":"fail"}]}'}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-foreground/80 mb-1.5 block">Frequency <span className="text-muted-foreground font-normal">(optional)</span></label>
            <div className="rounded border border-border overflow-hidden" style={{ height: 80 }}>
              <Suspense fallback={<div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>}>
                <MonacoEditor language="json" theme="vs-dark" value={frequencyJson || ' '}
                  onChange={(v) => setFrequencyJson((v || '').trim() === '' ? '' : (v || ''))}
                  options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 11, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }} />
              </Suspense>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono opacity-60">{"{ count: 5, windowSeconds: 300 }"}</p>
          </div>
          <div>
            <label className="text-xs font-medium text-foreground/80 mb-1.5 block">Correlation <span className="text-muted-foreground font-normal">(optional)</span></label>
            <div className="rounded border border-border overflow-hidden" style={{ height: 80 }}>
              <Suspense fallback={<div className="h-full bg-secondary/10 flex items-center justify-center text-xs text-muted-foreground">Loading…</div>}>
                <MonacoEditor language="json" theme="vs-dark" value={correlationJson || ' '}
                  onChange={(v) => setCorrelationJson((v || '').trim() === '' ? '' : (v || ''))}
                  options={{ ...DEFAULT_EDITOR_SETTINGS, fontSize: 11, lineNumbers: 'off', folding: false, minimap: { enabled: false }, scrollBeyondLastLine: false, wordWrap: 'on' }} />
              </Suspense>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 font-mono opacity-60">{"{ field: 'targetId', minSources: 3 }"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 pt-1 border-t border-border/60">
          <Button size="sm" variant="outline" onClick={validateRule} className="gap-1.5 h-8"><Search className="h-3.5 w-3.5" /> Validate</Button>
          <Button size="sm" onClick={save} disabled={saving || !name} className="gap-1.5 h-8">
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {saving ? 'Saving…' : initial?.id ? 'Update Rule' : 'Create Rule'}
          </Button>
          <Button size="sm" variant="outline" onClick={onCancel} className="h-8">Cancel</Button>
        </div>
        {validation && (
          <div className={`rounded border p-3 flex flex-col gap-1 ${validation.ok ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
            {validation.messages.map((m, i) => {
              const isOk = m.startsWith('✓'), isWarn = m.startsWith('⚠')
              const colorCls = isOk ? 'text-green-500' : isWarn ? 'text-yellow-500' : 'text-red-500'
              const Icon = isOk ? CheckCircle : isWarn ? AlertTriangle : X
              return <p key={i} className={`text-xs flex items-start gap-1.5 ${colorCls}`}><Icon className="h-3 w-3 shrink-0 mt-0.5" /><span>{m.replace(/^[✓✗⚠💡]\s?/, '')}</span></p>
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Rules Tab ──────────────────────────────────────────────────────────────────

export default function RulesTab() {
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [showHandbook, setShowHandbook] = useState(false)
  const [nodeStatus, setNodeStatus] = useState<any[]>([])
  const [currentVersion, setCurrentVersion] = useState('')

  const fetchRules = async () => {
    setLoading(true)
    try { const d = await apiFetch('/api/soc/detection-rules'); setRules(d?.rules || []) }
    catch { setRules([]) }
    finally { setLoading(false) }
  }

  const fetchNodeStatus = async () => {
    try {
      const d = await apiFetch('/api/soc/node-status')
      setNodeStatus(d?.nodes || [])
      setCurrentVersion(d?.currentConfigVersion || '')
    } catch { setNodeStatus([]) }
  }

  useEffect(() => { fetchRules(); fetchNodeStatus() }, [])

  const toggleRule = async (id: number, enabled: boolean) => {
    await apiFetch(`/api/soc/detection-rules/${id}`, { method: 'PUT', body: JSON.stringify({ enabled }) })
    fetchRules()
  }

  const deleteRule = async (id: number) => {
    if (!confirm('Delete this rule?')) return
    await apiFetch(`/api/soc/detection-rules/${id}`, { method: 'DELETE' })
    fetchRules()
  }

  if (loading) return (
    <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
      <RefreshCw className="h-4 w-4 animate-spin" /><span className="text-sm">Loading rules…</span>
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{rules.length}</span> detection rule{rules.length !== 1 ? "s" : ""} defined</p>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" onClick={fetchNodeStatus} className="h-8 gap-1.5 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Nodes</Button>
          <Button size="sm" variant="outline" onClick={() => setShowHandbook(!showHandbook)} className="h-8 text-xs">{showHandbook ? 'Hide Handbook' : 'Handbook'}</Button>
          <Button size="sm" onClick={() => { setEditing(null); setShowForm(true) }} className="h-8 gap-1.5 text-xs">+ Add Rule</Button>
        </div>
      </div>

      {nodeStatus.length > 0 && (
        <div className="rounded border border-border bg-card p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><Server className="h-3.5 w-3.5 text-muted-foreground" />Node Config Sync</p>
            <span className="text-[10px] text-muted-foreground font-mono bg-secondary/60 px-1.5 py-0.5 rounded">v{currentVersion}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {nodeStatus.map((n: any) => (
              <div key={n.id} className="flex items-center justify-between gap-2 p-2 rounded bg-secondary/30">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${n.active ? (n.synced ? 'bg-green-500' : 'bg-yellow-500') : 'bg-red-500'}`} />
                  <span className="text-xs font-medium text-foreground">{n.name}</span>
                  {n.active ? (n.synced ? <span className="text-[10px] text-green-500 font-medium">synced</span>
                    : <span className="text-[10px] text-yellow-500">stale (node: {n.nodeConfigVersion || 'none'})</span>)
                    : <span className="text-[10px] text-red-500">offline {Math.round(n.lastSeenMs / 1000)}s ago</span>}
                </div>
                {n.active && !n.synced && (
                  <button onClick={async () => { await apiFetch('/api/wings/command', { method: 'POST', body: JSON.stringify({ nodeId: n.id, action: 'reapply_config' }) }); setTimeout(fetchNodeStatus, 5000) }}
                    className="text-[10px] px-2 py-1 rounded border border-orange-500/40 text-orange-500 hover:bg-orange-500/10 transition-colors font-medium">Reapply</button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground">Nodes fetch config every 2 min. Press Reapply to force immediate refresh.</p>
        </div>
      )}

      {nodeStatus.length === 0 && !loading && (
        <div className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">No Wings nodes connected. Rules only apply when nodes are online and synced.</div>
      )}

      {showHandbook && <RuleHandbook />}

      {rules.length === 0 ? (
        <div className="rounded border border-dashed border-border bg-secondary/10 p-10 text-center flex flex-col items-center gap-2">
          <FileSearch className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-muted-foreground">No custom detection rules</p>
          <p className="text-xs text-muted-foreground">Create rules to detect patterns in logs, server metrics, and more.</p>
          <Button size="sm" className="mt-2 gap-1.5" onClick={() => { setEditing(null); setShowForm(true) }}>+ Create first rule</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((r: any) => {
            const sevCfg = severityConfig[r.severity]
            return (
              <div key={r.id} className={`rounded border bg-card p-3 sm:p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 border-l-[3px] ${sevCfg?.row || "border-l-transparent"} ${sevCfg?.border || "border-border"}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-foreground">{r.name}</span>
                    <SeverityBadge severity={r.severity} />
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary/60 text-muted-foreground border border-border/60">{r.category}</span>
                    {r.visibility === 'staff_only' && <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-purple-500/30 bg-purple-500/10 text-purple-500"><EyeOff className="h-2.5 w-2.5" /> staff only</span>}
                    {r.createsIncident && <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-orange-500/30 bg-orange-500/10 text-orange-500"><Siren className="h-2.5 w-2.5" /> incident</span>}
                    <span className="text-[10px] text-muted-foreground ml-1">{r.triggerCount || 0} hits</span>
                  </div>
                  {r.description && <p className="text-xs text-muted-foreground mt-1">{r.description}</p>}
                  <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">{(r.sources || []).join(', ')} • {r.scope}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => toggleRule(r.id, !r.enabled)}
                    className={`text-[10px] px-2.5 py-1 rounded-full font-semibold border transition-colors ${r.enabled ? 'bg-green-500/15 border-green-500/30 text-green-500' : 'bg-secondary border-border text-muted-foreground'}`}>{r.enabled ? 'ON' : 'OFF'}</button>
                  <button onClick={() => { setEditing(r); setShowForm(true) }} className="text-[10px] px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">Edit</button>
                  <button onClick={() => deleteRule(r.id)} className="text-[10px] px-2.5 py-1 rounded border border-red-500/20 text-red-500 hover:bg-red-500/10 transition-colors">Delete</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showForm && <RuleForm initial={editing} onSaved={() => { setShowForm(false); fetchRules() }} onCancel={() => setShowForm(false)} />}
    </div>
  )
}
