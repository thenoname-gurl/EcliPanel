'use client';
import { toast } from "sonner"

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, Plus, Trash2, Loader2, Play, Square, Copy, ChevronDown, ChevronRight, ChevronLeft, GripVertical, Calendar as CalendarIcon, List } from 'lucide-react';
import { format } from 'date-fns';
import { apiFetch } from '@/lib/api-client';
import { API_ENDPOINTS } from '@/lib/panel-config';
import { Button } from '@/components/ui/button';
import { TableLoading, TableEmpty, TableError } from '@/components/ui/table-states';
import { FormAdvancedSection } from '@/components/ui/form-advanced-section';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type TriggerType = 'cron' | 'power_action' | 'server_state' | 'backup_status' | 'schedule_completion' | 'resource_usage' | 'resource_usage_over_time' | 'console_line' | 'crash';
type ConditionType = 'none' | 'and' | 'or' | 'xor' | 'not' | 'server_state' | 'uptime' | 'resource_usage' | 'backup_exists' | 'backup_age' | 'file_exists' | 'variable_exists' | 'variable_equals' | 'variable_contains' | 'variable_starts_with' | 'variable_ends_with';
type StepType = 'sleep' | 'ensure' | 'if' | 'else_if' | 'else' | 'end_if' | 'exit' | 'format' | 'match_regex' | 'wait_for_console_line' | 'wait_for_state' | 'send_power' | 'send_command' | 'create_backup' | 'restore_backup' | 'delete_backup' | 'move_backup' | 'export_backup' | 'http_request' | 'create_directory' | 'write_file' | 'copy_file' | 'delete_files' | 'rename_files' | 'compress_files' | 'decompress_file' | 'update_startup_variable' | 'update_startup_command' | 'update_startup_docker_image';

// ─── Cron helpers (5-field, Vixie-style: dom+dow both restricted → OR) ──────

function cronField(expr: string, min: number, max: number): Set<number> {
  const allowed = new Set<number>();
  for (const part of expr.split(',')) {
    let step = 1;
    let range = part;
    if (part.includes('/')) {
      const [r, s] = part.split('/');
      range = r;
      step = parseInt(s, 10) || 1;
    }
    let start = min;
    let end = max;
    if (range !== '*' && range !== '') {
      const [a, b] = range.split('-');
      start = parseInt(a, 10);
      end = b !== undefined ? parseInt(b, 10) : start;
    }
    for (let v = start; v <= end; v += step) {
      if (v >= min && v <= max) allowed.add(v);
    }
  }
  return allowed;
}

export function nextCronOccurrences(expr: string, from: Date, count: number): Date[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return [];
  const [minS, hourS, domS, monS, dowS] = parts;
  const minutes = cronField(minS, 0, 59);
  const hours = cronField(hourS, 0, 23);
  const doms = cronField(domS, 1, 31);
  const months = cronField(monS, 1, 12);
  const dows = cronField(dowS, 0, 6);
  if (!minutes.size || !hours.size || !doms.size || !months.size || !dows.size) return [];

  const domRestricted = domS !== '*';
  const dowRestricted = dowS !== '*';
  const out: Date[] = [];
  const candidate = new Date(from);
  candidate.setSeconds(0, 0);
  candidate.setMinutes(candidate.getMinutes() + 1);
  // Cap at ~2 years of scanning so sparse crons (e.g. yearly) still resolve
  const limit = new Date(from).getTime() + 730 * 86400000;
  while (out.length < count && candidate.getTime() < limit) {
    const min = candidate.getMinutes();
    const hour = candidate.getHours();
    const dom = candidate.getDate();
    const mon = candidate.getMonth() + 1;
    const dow = candidate.getDay();
    const domOk = doms.has(dom);
    const dowOk = dows.has(dow);
    const dayOk = domRestricted && dowRestricted ? domOk || dowOk : domOk && dowOk;
    if (months.has(mon) && dayOk && hours.has(hour) && minutes.has(min)) {
      out.push(new Date(candidate));
    }
    candidate.setMinutes(min + 1);
  }
  return out;
}

// Upcoming cron runs for the schedules list, used to seed the calendar
function upcomingRuns(schedules: any[], now: Date, perSchedule: number): { date: Date; name: string; expr: string }[] {
  const runs: { date: Date; name: string; expr: string }[] = [];
  for (const s of schedules) {
    if (s.enabled === false) continue;
    for (const tr of s.triggers || []) {
      if (tr?.type === 'cron' && tr.schedule) {
        for (const d of nextCronOccurrences(tr.schedule, now, perSchedule)) {
          runs.push({ date: d, name: s.name, expr: tr.schedule });
        }
      }
    }
  }
  return runs.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// Monday-first month grid, same shape as the panel calendar page
function getMonthDays(year: number, month: number): { date: Date; isPadding: boolean }[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days: { date: Date; isPadding: boolean }[] = []
  for (let i = first.getDay() - 1; i >= 0; i--) {
    days.push({ date: new Date(year, month, -(i)), isPadding: true })
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isPadding: false })
  }
  const rem = days.length % 7 === 0 ? 0 : 7 - (days.length % 7)
  for (let i = 1; i <= rem; i++) {
    days.push({ date: new Date(year, month, last.getDate() + i), isPadding: true })
  }
  return days
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface ScheduleForm {
  uuid: string;
  name: string;
  enabled: boolean;
  triggers: any[];
  condition: any;
  steps: any[];
}

const emptyForm = (): ScheduleForm => ({ uuid: '', name: '', enabled: true, triggers: [], condition: { type: 'none' }, steps: [] });

const newTrigger = (type: TriggerType): any => {
  switch (type) {
    case 'cron': return { type: 'cron', schedule: '0 0 * * *' };
    case 'resource_usage': return { type: 'resource_usage', metric: 'cpu', comparator: 'greater_than', value: 80, for_seconds: 60 };
    case 'resource_usage_over_time': return { type: 'resource_usage_over_time', metric: 'cpu', comparator: 'greater_than', value: 80, sustained_for_seconds: 300, sample_interval_seconds: 30 };
    case 'power_action': return { type: 'power_action', action: 'start' };
    case 'server_state': return { type: 'server_state', state: 'running' };
    case 'backup_status': return { type: 'backup_status', status: 'completed' };
    case 'schedule_completion': return { type: 'schedule_completion', schedule: '', successful: true };
    case 'console_line': return { type: 'console_line', contains: '' };
    case 'crash': return { type: 'crash' };
  }
};

const newStep = (type: StepType): any => {
  const base = { uuid: crypto.randomUUID(), type, ignore_failure: false };
  switch (type) {
    case 'send_power': return { ...base, action: 'restart' };
    case 'send_command': return { ...base, command: '' };
    case 'create_backup': return { ...base, name: 'schedule-backup', ignored_files: [], backup_group_uuid: '', compression_type: '', output_into: null };
    case 'restore_backup': return { ...base, selector: 'latest', backup_group_uuid: '' };
    case 'delete_backup': return { ...base, selector: 'oldest', name_pattern: '' };
    case 'move_backup': return { ...base, backup_group_uuid: '', destination_adapter: '' };
    case 'export_backup': return { ...base, backup_group_uuid: '', path: '/home/container/exports', archive_format: 'tar.gz' };
    case 'http_request': return { ...base, method: 'get', url: 'https://', headers: [], body: '', timeout: 30000, ignore_error_status: false, output_status_into: null, output_body_into: null };
    case 'wait_for_state': return { ...base, state: 'running', timeout: 60 };
    case 'wait_for_console_line': return { ...base, contains: '', timeout: 30, case_insensitive: false };
    case 'copy_file': return { ...base, file: '', destination: '' };
    case 'create_directory': return { ...base, root: '/home/container', name: '' };
    case 'write_file': return { ...base, file: '', content: '', append: false };
    case 'delete_files': return { ...base, root: '/home/container', files: [] };
    case 'compress_files': return { ...base, root: '/home/container', files: [], format: 'tar.gz', name: 'archive' };
    case 'decompress_file': return { ...base, root: '/home/container', file: '' };
    case 'sleep': return { ...base, duration: 5 };
    case 'exit': return { ...base, successful: true };
    default: return base;
  }
};

export function SchedulesTab({ serverId }: { serverId: string }) {
  const t = useTranslations('serverDetailPage');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<ScheduleForm>(emptyForm());
  const [expandedSchedules, setExpandedSchedules] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  const runs = useMemo(() => upcomingRuns(schedules, new Date(), 8), [schedules]);
  const runCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of runs) {
      const key = toDateKey(r.date);
      m.set(key, (m.get(key) || 0) + 1);
    }
    return m;
  }, [runs]);
  const calDays = useMemo(
    () => getMonthDays(calMonth.getFullYear(), calMonth.getMonth()),
    [calMonth],
  );
  const todayKey = toDateKey(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const runsOnSelectedDay = useMemo(
    () => runs.filter(r => selectedDayKey !== null && toDateKey(r.date) === selectedDayKey),
    [runs, selectedDayKey],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch(API_ENDPOINTS.serverSchedules.replace(':id', serverId));
      const list = data?.schedules?.data || (Array.isArray(data) ? data : []);
      setSchedules(list);
    } catch {
      setError('Failed to load schedules');
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setForm(emptyForm()); setEditing(false); setDialogOpen(true); };
  const openEdit = async (s: any) => {
    setDialogOpen(true);
    setEditing(true);
    setForm({ uuid: s.uuid, name: s.name, enabled: s.enabled, triggers: s.triggers || [], condition: s.condition || { type: 'none' }, steps: [] });
    // The list endpoint only carries step counts; load the real steps
    try {
      const detail = await apiFetch(API_ENDPOINTS.serverSchedule.replace(':id', serverId).replace(':sid', s.uuid));
      const steps = (detail?.schedule?.steps || []).map((st: any) => ({ uuid: st.uuid, ...(st.action || {}) }));
      setForm(f => ({ ...f, steps }));
    } catch {
      // keep editing even if detail fails; steps just start empty
    }
  };

  const saveSchedule = async () => {
    setSaving(true);
    try {
      const payload = { name: form.name, enabled: form.enabled, triggers: form.triggers, condition: form.condition, steps: form.steps };
      if (editing) {
        await apiFetch(API_ENDPOINTS.serverScheduleUpdate.replace(':id', serverId).replace(':sid', form.uuid), { method: 'POST', body: JSON.stringify(payload) });
      } else {
        await apiFetch(API_ENDPOINTS.serverSchedules.replace(':id', serverId), { method: 'POST', body: JSON.stringify(payload) });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast.error(t('schedules.failed', { reason: e?.message || 'Unknown error' }));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (s: any) => {
    try {
      await apiFetch(API_ENDPOINTS.serverScheduleUpdate.replace(':id', serverId).replace(':sid', s.uuid), { method: 'POST', body: JSON.stringify({ enabled: !s.enabled }) });
      load();
    } catch (e: any) { toast.error(t('schedules.failed', { reason: e?.message })); }
  };

  const deleteSchedule = async (sid: string) => {
    if (!confirm('Delete this schedule?')) return;
    try {
      await apiFetch(API_ENDPOINTS.serverScheduleDelete.replace(':id', serverId).replace(':sid', sid), { method: 'DELETE' });
      load();
    } catch (e: any) { toast.error(t('schedules.failed', { reason: e?.message })); }
  };

  const triggerSchedule = async (sid: string) => {
    try {
      await apiFetch(API_ENDPOINTS.serverScheduleTrigger.replace(':id', serverId).replace(':sid', sid), { method: 'POST' });
      toast('Schedule triggered');
    } catch (e: any) { toast.error(t('schedules.failed', { reason: e?.message })); }
  };

  const addTrigger = (type: TriggerType) => { setForm({ ...form, triggers: [...form.triggers, newTrigger(type)] }); };
  const removeTrigger = (idx: number) => { setForm({ ...form, triggers: form.triggers.filter((_, i) => i !== idx) }); };
  const updateTrigger = (idx: number, updates: any) => {
    setForm({ ...form, triggers: form.triggers.map((t, i) => i === idx ? { ...t, ...updates } : t) });
  };

  const addStep = (type: StepType) => { setForm({ ...form, steps: [...form.steps, newStep(type)] }); };
  const removeStep = (idx: number) => { setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx) }); };
  const updateStep = (idx: number, updates: any) => {
    setForm({ ...form, steps: form.steps.map((s, i) => i === idx ? { ...s, ...updates } : s) });
  };

  const toggleExpand = (uuid: string) => {
    setExpandedSchedules(prev => { const next = new Set(prev); next.has(uuid) ? next.delete(uuid) : next.add(uuid); return next; });
  };

  const TRIGGER_TYPES: { value: TriggerType; label: string }[] = [
    { value: 'cron', label: 'Cron Schedule' },
    { value: 'power_action', label: 'Power Action' },
    { value: 'server_state', label: 'Server State' },
    { value: 'backup_status', label: 'Backup Status' },
    { value: 'schedule_completion', label: 'Schedule Completion' },
    { value: 'resource_usage', label: 'Resource Usage (instant)' },
    { value: 'resource_usage_over_time', label: 'Resource Usage (sustained)' },
    { value: 'console_line', label: 'Console Line' },
    { value: 'crash', label: 'Server Crash' },
  ];

  const STEP_TYPES: { value: StepType; label: string; category: string }[] = [
    { value: 'send_power', label: 'Power Action', category: 'basic' },
    { value: 'send_command', label: 'Send Command', category: 'basic' },
    { value: 'wait_for_state', label: 'Wait for State', category: 'basic' },
    { value: 'wait_for_console_line', label: 'Wait for Console', category: 'basic' },
    { value: 'sleep', label: 'Sleep', category: 'basic' },
    { value: 'create_backup', label: 'Create Backup', category: 'backup' },
    { value: 'restore_backup', label: 'Restore Backup', category: 'backup' },
    { value: 'delete_backup', label: 'Delete Backup', category: 'backup' },
    { value: 'move_backup', label: 'Move Backup', category: 'backup' },
    { value: 'export_backup', label: 'Export Backup to Filesystem', category: 'backup' },
    { value: 'http_request', label: 'HTTP Request', category: 'web' },
    { value: 'copy_file', label: 'Copy File', category: 'files' },
    { value: 'create_directory', label: 'Create Directory', category: 'files' },
    { value: 'write_file', label: 'Write File', category: 'files' },
    { value: 'delete_files', label: 'Delete Files', category: 'files' },
    { value: 'rename_files', label: 'Rename Files', category: 'files' },
    { value: 'compress_files', label: 'Compress Files', category: 'files' },
    { value: 'decompress_file', label: 'Decompress File', category: 'files' },
    { value: 'update_startup_variable', label: 'Update Startup Variable', category: 'startup' },
    { value: 'update_startup_command', label: 'Update Startup Command', category: 'startup' },
    { value: 'update_startup_docker_image', label: 'Update Docker Image', category: 'startup' },
    { value: 'if', label: 'If Condition', category: 'flow' },
    { value: 'else_if', label: 'Else If', category: 'flow' },
    { value: 'else', label: 'Else', category: 'flow' },
    { value: 'end_if', label: 'End If', category: 'flow' },
    { value: 'exit', label: 'Exit', category: 'flow' },
  ];

  if (loading) return <TableLoading message="Loading schedules..." />;
  if (error) return <TableError message={error} onRetry={load} />;

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-muted-foreground" />
          <h3 className="text-lg font-semibold">{t('schedules.title')}</h3>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex border border-border rounded-md overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              data-telemetry="servers:viewlist"
            >
              <List className="h-3 w-3" /> List
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs transition-colors ${viewMode === 'calendar' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              data-telemetry="servers:viewcalendar"
            >
              <CalendarIcon className="h-3 w-3" /> Calendar
            </button>
          </div>
          <Button size="sm" onClick={openCreate}><Plus className="h-3.5 w-3.5 mr-1.5" /> New Schedule</Button>
        </div>
      </div>

      {/* Schedule calendar */}
      {viewMode === 'calendar' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
          <div className="border border-border/50 rounded-lg bg-card/20 p-3 self-start">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-foreground">
                {format(calMonth, 'MMMM yyyy')}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1))}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  aria-label="Previous month"
                  data-telemetry="servers:cal-prev"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button
                  onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1))}
                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  aria-label="Next month"
                  data-telemetry="servers:cal-next"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => (
                <span key={d} className="text-center text-[9px] uppercase tracking-wide text-muted-foreground/60">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {calDays.map(({ date, isPadding }, i) => {
                const ds = toDateKey(date)
                const isToday = ds === todayKey
                const isSelected = ds === selectedDayKey
                const count = runCounts.get(ds) ?? 0
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDayKey(isSelected ? null : ds)}
                    className={cn(
                      "relative text-[10px] w-full aspect-square rounded flex items-center justify-center transition-colors",
                      isPadding
                        ? "text-muted-foreground/25 pointer-events-none"
                        : "text-foreground hover:bg-secondary/60",
                      isSelected && !isToday && "bg-primary/15 text-primary font-semibold",
                      isToday && "bg-primary text-primary-foreground font-semibold",
                    )}
                    data-telemetry="servers:cal-day"
                  >
                    {date.getDate()}
                    {count > 0 && !isToday && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary/60" />
                    )}
                  </button>
                )
              })}
            </div>
            <p className="text-[9px] text-muted-foreground mt-2">
              Dots mark days with scheduled runs. Click a day to filter the list.
            </p>
          </div>
          <div className="space-y-1.5 min-w-0">
            <h3 className="text-[10px] font-semibold text-foreground uppercase tracking-wider mb-2">
              {selectedDayKey
                ? format(new Date(selectedDayKey + 'T00:00:00'), 'EEE, MMM d') + ' · ' + runsOnSelectedDay.length
                : 'Upcoming runs · ' + runs.length}
            </h3>
            {(selectedDayKey ? runsOnSelectedDay : runs).length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border/50 rounded-lg">
                No runs {selectedDayKey ? 'this day' : 'configured'}.
              </p>
            ) : (
              (selectedDayKey ? runsOnSelectedDay : runs.slice(0, 24)).map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 p-2 rounded-lg border border-green-500/20 bg-green-500/[0.04]"
                >
                  <div className="w-0.5 h-8 rounded-full shrink-0 mt-0.5 bg-primary/60" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-foreground truncate">{r.name}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {format(r.date, 'MMM d, yyyy · HH:mm')}
                    </p>
                  </div>
                  <span className="text-[9px] text-muted-foreground/60 font-mono shrink-0 hidden sm:inline pt-0.5">
                    {r.expr}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Schedule list */}
      {viewMode !== 'list' ? null : schedules.length === 0 ? (
        <TableEmpty message={t('schedules.empty')} />
      ) : (
        <div className="space-y-2">
          {schedules.map((s: any) => {
            const isExpanded = expandedSchedules.has(s.uuid);
            return (
              <div key={s.uuid} className="border border-border rounded-lg overflow-hidden">
                <button onClick={() => toggleExpand(s.uuid)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left">
                  {isExpanded ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                  <span className="font-medium text-sm flex-1 truncate">{s.name}</span>
                  <span className={`h-2 w-2 rounded-full flex-shrink-0 ${s.enabled ? 'bg-green-500' : 'bg-muted-foreground'}`} />
                  <span className="text-xs text-muted-foreground">{s.enabled ? 'Active' : 'Disabled'}</span>
                  <span className="text-[10px] text-muted-foreground">{(s.triggers || []).length} trigger(s)</span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); triggerSchedule(s.uuid); }}><Play className="h-3 w-3" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={e => { e.stopPropagation(); openEdit(s); }}>Edit</Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={e => { e.stopPropagation(); deleteSchedule(s.uuid); }}><Trash2 className="h-3 w-3" /></Button>
                </button>
                {isExpanded && (
                  <div className="border-t border-border p-3 space-y-3 text-sm">
                    <div>
                      <span className="font-medium text-muted-foreground">Triggers: </span>
                      {(s.triggers || []).map((tr: any, i: number) => (
                        <span key={i} className="inline-block bg-muted/50 px-2 py-0.5 rounded text-xs mr-1 mb-1">
                          {TRIGGER_TYPES.find(tt => tt.value === tr.type)?.label || tr.type}
                          {tr.schedule ? `: ${tr.schedule}` : ''}{tr.metric ? `: ${tr.metric}` : ''}
                        </span>
                      ))}
                      {(s.triggers || []).length === 0 && <span className="text-muted-foreground">None</span>}
                    </div>
                    <div>
                      <span className="font-medium text-muted-foreground">Steps: </span>
                      <span className="text-xs">{s.steps_count ?? (s.steps || []).length} step(s)</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit Schedule Modal */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 overflow-y-auto pt-10 pb-10">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-2xl mx-4 space-y-4">
            <h4 className="font-semibold text-lg">{editing ? 'Edit Schedule' : 'Create Schedule'}</h4>

            <input type="text" placeholder="Schedule name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-border bg-muted/30 px-3 py-2 text-sm rounded-md" />

            {/* Triggers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Triggers</label>
                <select onChange={e => addTrigger(e.target.value as TriggerType)} className="text-xs border border-border bg-muted/30 px-2 py-1 rounded" defaultValue="">
                  <option value="" disabled>+ Add trigger</option>
                  {TRIGGER_TYPES.map(tt => <option key={tt.value} value={tt.value}>{tt.label}</option>)}
                </select>
              </div>
              {form.triggers.map((tr: any, idx: number) => (
                <div key={idx} className="border border-border rounded p-3 space-y-2 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">{tr.type}</span>
                    <button onClick={() => removeTrigger(idx)} className="text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  {tr.type === 'cron' && (
                    <input type="text" value={tr.schedule || ''} onChange={e => updateTrigger(idx, { schedule: e.target.value })} placeholder="Cron expression (e.g. 0 0 * * *)" className="w-full border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                  )}
                  {(tr.type === 'resource_usage' || tr.type === 'resource_usage_over_time') && (
                    <div className="flex gap-2 flex-wrap">
                      <select value={tr.metric} onChange={e => updateTrigger(idx, { metric: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                        <option value="cpu">CPU</option>
                        <option value="memory">Memory</option>
                        <option value="disk">Disk</option>
                        <option value="network_rx">Network RX</option>
                        <option value="network_tx">Network TX</option>
                      </select>
                      <select value={tr.comparator} onChange={e => updateTrigger(idx, { comparator: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                        <option value="greater_than">{'>'}</option>
                        <option value="greater_than_or_equals">{'>='}</option>
                        <option value="smaller_than">{'<'}</option>
                        <option value="smaller_than_or_equals">{'<='}</option>
                        <option value="equal">{'='}</option>
                      </select>
                      <input type="number" value={tr.value || 0} onChange={e => updateTrigger(idx, { value: Number(e.target.value) })} className="w-full sm:w-20 border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                      {tr.type === 'resource_usage' && (
                        <input type="number" value={tr.for_seconds || 0} onChange={e => updateTrigger(idx, { for_seconds: Number(e.target.value) })} placeholder="For N seconds" className="w-full sm:w-28 border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                      )}
                      {tr.type === 'resource_usage_over_time' && (
                        <>
                          <input type="number" value={tr.sustained_for_seconds || 300} onChange={e => updateTrigger(idx, { sustained_for_seconds: Number(e.target.value) })} placeholder="Sustained secs" className="w-full sm:w-28 border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                          <input type="number" value={tr.sample_interval_seconds || 30} onChange={e => updateTrigger(idx, { sample_interval_seconds: Number(e.target.value) })} placeholder="Sample interval" className="w-full sm:w-28 border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                        </>
                      )}
                    </div>
                  )}
                  {tr.type === 'power_action' && (
                    <select value={tr.action} onChange={e => updateTrigger(idx, { action: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                      <option value="start">Start</option><option value="stop">Stop</option><option value="restart">Restart</option><option value="kill">Kill</option>
                    </select>
                  )}
                  {tr.type === 'console_line' && (
                    <input type="text" value={tr.contains || ''} onChange={e => updateTrigger(idx, { contains: e.target.value })} placeholder="Text to match in console" className="w-full border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                  )}
                </div>
              ))}
            </div>

            {/* Steps */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Steps</label>
                <select onChange={e => addStep(e.target.value as StepType)} className="text-xs border border-border bg-muted/30 px-2 py-1 rounded" defaultValue="">
                  <option value="" disabled>+ Add step</option>
                  {STEP_TYPES.map(st => <option key={st.value} value={st.value}>[{st.category}] {st.label}</option>)}
                </select>
              </div>
              {form.steps.map((step: any, idx: number) => (
                <div key={idx} className="border border-border rounded p-3 space-y-2 bg-muted/10">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs font-medium">{step.type}</span>
                      <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <input type="checkbox" checked={step.ignore_failure || false} onChange={e => updateStep(idx, { ignore_failure: e.target.checked })} />
                        Ignore failure
                      </label>
                    </div>
                    <button onClick={() => removeStep(idx)} className="text-destructive"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  {step.type === 'send_power' && (
                    <select value={step.action || 'restart'} onChange={e => updateStep(idx, { action: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                      <option value="start">Start</option><option value="stop">Stop</option><option value="restart">Restart</option><option value="kill">Kill</option>
                    </select>
                  )}
                  {step.type === 'send_command' && (
                    <input type="text" value={step.command || ''} onChange={e => updateStep(idx, { command: e.target.value })} placeholder="Command to run" className="w-full border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                  )}
                  {step.type === 'create_backup' && (
                    <div className="flex gap-2 flex-wrap">
                      <input type="text" value={step.name || ''} onChange={e => updateStep(idx, { name: e.target.value })} placeholder="Backup name" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1 min-w-[120px]" />
                      <input type="text" value={step.backup_group_uuid || ''} onChange={e => updateStep(idx, { backup_group_uuid: e.target.value })} placeholder="Group UUID" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded w-full sm:w-40" />
                      <select value={step.compression_type || ''} onChange={e => updateStep(idx, { compression_type: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                        <option value="">Default</option><option value="tar.gz">tar.gz</option><option value="tar.zst">zstd</option><option value="tar.lz4">lz4</option><option value="tar.xz">xz</option><option value="zip">zip</option>
                      </select>
                      <input
                        type="text"
                        value={step.output_into?.variable || ''}
                        onChange={e => updateStep(idx, { output_into: e.target.value ? { variable: e.target.value } : null })}
                        placeholder="Output backup UUID into variable"
                        className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1 min-w-[160px]"
                      />
                    </div>
                  )}
                  {step.type === 'http_request' && (
                    <div className="space-y-2">
                      <div className="flex gap-2 flex-wrap">
                        <select value={step.method || 'get'} onChange={e => updateStep(idx, { method: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                          <option value="get">GET</option><option value="post">POST</option><option value="put">PUT</option><option value="patch">PATCH</option><option value="delete">DELETE</option><option value="head">HEAD</option>
                        </select>
                        <input type="text" value={step.url || ''} onChange={e => updateStep(idx, { url: e.target.value })} placeholder="https://example.com/api" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1 min-w-[160px]" />
                        <input type="number" value={step.timeout ?? 30000} onChange={e => updateStep(idx, { timeout: Number(e.target.value) })} placeholder="Timeout (ms)" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded w-full sm:w-32" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-[10px] text-muted-foreground">Headers</span>
                        {(step.headers || []).map((h: any, hi: number) => (
                          <div key={hi} className="flex gap-1.5">
                            <input type="text" value={h.name || ''} placeholder="Header name" onChange={e => updateStep(idx, { headers: (step.headers || []).map((x: any, xi: number) => xi === hi ? { ...x, name: e.target.value } : x) })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1 min-w-0" />
                            <input type="text" value={h.value || ''} placeholder="Value ({{var}} ok)" onChange={e => updateStep(idx, { headers: (step.headers || []).map((x: any, xi: number) => xi === hi ? { ...x, value: e.target.value } : x) })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1 min-w-0" />
                            <button onClick={() => updateStep(idx, { headers: (step.headers || []).filter((_: any, xi: number) => xi !== hi) })} className="text-destructive px-1"><Trash2 className="h-3 w-3" /></button>
                          </div>
                        ))}
                        <button onClick={() => updateStep(idx, { headers: [...(step.headers || []), { name: '', value: '' }] })} className="text-xs text-primary self-start">+ Add header</button>
                      </div>
                      <input type="text" value={step.body || ''} onChange={e => updateStep(idx, { body: e.target.value })} placeholder="Request body ({{var}} ok)" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded w-full" />
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                          <input type="checkbox" checked={step.ignore_error_status || false} onChange={e => updateStep(idx, { ignore_error_status: e.target.checked })} />
                          Ignore error status
                        </label>
                        <input type="text" value={step.output_status_into?.variable || ''} onChange={e => updateStep(idx, { output_status_into: e.target.value ? { variable: e.target.value } : null })} placeholder="Output HTTP status into" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded w-full sm:w-52" />
                        <input type="text" value={step.output_body_into?.variable || ''} onChange={e => updateStep(idx, { output_body_into: e.target.value ? { variable: e.target.value } : null })} placeholder="Output response body into" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded w-full sm:w-52" />
                      </div>
                    </div>
                  )}
                  {step.type === 'restore_backup' && (
                    <div className="flex gap-2 flex-wrap">
                      <select value={step.selector || 'latest'} onChange={e => updateStep(idx, { selector: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                        <option value="latest">Latest</option><option value="oldest">Oldest</option><option value="newest">Newest (by name)</option>
                      </select>
                      <input type="text" value={step.backup_group_uuid || ''} onChange={e => updateStep(idx, { backup_group_uuid: e.target.value })} placeholder="Group UUID (optional)" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                    </div>
                  )}
                  {step.type === 'export_backup' && (
                    <div className="flex gap-2 flex-wrap">
                      <input type="text" value={step.path || ''} onChange={e => updateStep(idx, { path: e.target.value })} placeholder="Export path" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1" />
                      <input type="text" value={step.backup_group_uuid || ''} onChange={e => updateStep(idx, { backup_group_uuid: e.target.value })} placeholder="Group UUID" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded w-40" />
                      <select value={step.archive_format || 'tar.gz'} onChange={e => updateStep(idx, { archive_format: e.target.value })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                        <option value="tar.gz">tar.gz</option><option value="tar.zst">zstd</option><option value="zip">zip</option>
                      </select>
                    </div>
                  )}
                  {step.type === 'sleep' && (
                    <input type="number" value={step.duration || 5} onChange={e => updateStep(idx, { duration: Number(e.target.value) })} placeholder="Seconds" className="w-full sm:w-24 border border-border bg-muted/30 px-2 py-1 text-xs rounded" />
                  )}
                  {(step.type === 'copy_file' || step.type === 'create_directory' || step.type === 'write_file') && (
                    <div className="flex gap-2 flex-wrap">
                      {step.type === 'copy_file' && <><input type="text" value={step.file || ''} onChange={e => updateStep(idx, { file: e.target.value })} placeholder="Source" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1" /><input type="text" value={step.destination || ''} onChange={e => updateStep(idx, { destination: e.target.value })} placeholder="Destination" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1" /></>}
                      {step.type === 'create_directory' && <><input type="text" value={step.root || ''} onChange={e => updateStep(idx, { root: e.target.value })} placeholder="Root path" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1" /><input type="text" value={step.name || ''} onChange={e => updateStep(idx, { name: e.target.value })} placeholder="Dir name" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1" /></>}
                      {step.type === 'write_file' && <><input type="text" value={step.file || ''} onChange={e => updateStep(idx, { file: e.target.value })} placeholder="File path" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1" /><input type="text" value={step.content || ''} onChange={e => updateStep(idx, { content: e.target.value })} placeholder="Content" className="border border-border bg-muted/30 px-2 py-1 text-xs rounded flex-1" /></>}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <FormAdvancedSection label="Condition">
              <select value={form.condition?.type || 'none'} onChange={e => setForm({ ...form, condition: { type: e.target.value as ConditionType } })} className="border border-border bg-muted/30 px-2 py-1 text-xs rounded">
                <option value="none">None (always run)</option>
                <option value="server_state">Server State</option>
                <option value="uptime">Uptime</option>
                <option value="resource_usage">Resource Usage</option>
                <option value="backup_exists">Backup Exists</option>
                <option value="backup_age">Backup Age</option>
                <option value="file_exists">File Exists</option>
                <option value="and">AND (all sub-conditions)</option>
                <option value="or">OR (any sub-condition)</option>
                <option value="xor">XOR (exactly one)</option>
                <option value="not">NOT (invert)</option>
              </select>
            </FormAdvancedSection>

            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={saveSchedule} disabled={saving || !form.name.trim()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Play className="h-4 w-4 mr-1.5" />}
                {editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}