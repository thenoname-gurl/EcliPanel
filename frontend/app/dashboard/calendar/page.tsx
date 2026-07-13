"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import { useTranslations } from "next-intl"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { PanelHeader } from "@/components/panel/header"
import { ScrollArea } from "@/components/ui/scroll-area"
import { FeatureGuard } from "@/components/panel/feature-guard"
import { RolloutGuard } from "@/components/panel/rollout-guard"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useAuth } from "@/hooks/useAuth"
import {
  DEFAULT_CALENDAR_SETTINGS, TODO_CATEGORIES,
  type CalendarSettings,
} from "@/lib/calendar-settings"
import { generateIcs, downloadIcs, parseIcs } from "@/lib/ics-utils"
import {
  ChevronLeft, ChevronRight, Plus, X, Check, Trash2, Clock,
  Sparkles, AlertCircle, ArrowUp, ArrowDown, CalendarDays, ListTodo,
  Bot, Settings, Share2, Upload, Users, Loader2, Grid3X3, Rows,
  Maximize2, LayoutList, Bell,
} from "lucide-react"

/* ── Types ─────────────────────────────────────────── */

interface CalendarEvent {
  id: number
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
  color: string
  recurring: string
  recurringEnd: string
  isAppointment?: boolean
  appointmentEmail?: string
  appointmentName?: string
  bookingType?: string
  maxCapacity?: number
}

interface TodoItem {
  id: number
  title: string
  description: string
  priority: string
  dueDate: string
  dueTime: string
  estimatedMinutes: number
  completed: boolean
  createdAt: string
  category: string
}

interface ExpandedInstance extends CalendarEvent {
  instanceDate: string
  isRecurringInstance: boolean
}

type ViewMode = "day" | "week" | "month" | "agenda"
type Section = "calendar" | "tasks" | "bookings"

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]
const COLORS = [
  "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#6366f1",
]
const HOURS = Array.from({ length: 24 }, (_, i) => i)
const ROW_H = 56 // px per hour — slightly taller for readability

/* ── Helpers ────────────────────────────────────────── */

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function formatTime(t: string): string {
  if (!t) return ""
  const [hh, mm] = t.split(":").map(Number)
  const period = hh >= 12 ? "pm" : "am"
  const h = hh % 12 || 12
  return mm === 0 ? `${h}${period}` : `${h}:${String(mm).padStart(2, "0")}${period}`
}

function timeToHours(t: string): number {
  if (!t) return 0
  const [hh, mm] = t.split(":").map(Number)
  return hh + (mm || 0) / 60
}

function getWeekStart(d: Date): Date {
  const r = new Date(d)
  r.setDate(r.getDate() - r.getDay())
  return r
}

function getMonthDays(year: number, month: number): { date: Date; isPadding: boolean }[] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const days: { date: Date; isPadding: boolean }[] = []
  for (let i = first.getDay() - 1; i >= 0; i--) {
    days.push({ date: addDays(first, -i - 1), isPadding: true })
  }
  for (let d = 1; d <= last.getDate(); d++) {
    days.push({ date: new Date(year, month, d), isPadding: false })
  }
  const rem = days.length % 7 === 0 ? 0 : 7 - (days.length % 7)
  for (let i = 1; i <= rem; i++) {
    days.push({ date: addDays(last, i), isPadding: true })
  }
  return days
}

function expandRecurring(
  events: CalendarEvent[],
  from: string,
  cutoff: string,
): ExpandedInstance[] {
  const out: ExpandedInstance[] = []
  for (const ev of events) {
    if (ev.recurring === "none" || !ev.recurring) {
      if (ev.date >= from && ev.date <= cutoff) {
        out.push({ ...ev, instanceDate: ev.date, isRecurringInstance: false })
      }
      continue
    }
    const end =
      ev.recurringEnd && ev.recurringEnd < cutoff ? ev.recurringEnd : cutoff
    const start = ev.date > from ? ev.date : from
    if (start > end) continue
    const d1 = new Date(ev.date)
    const cur = new Date(start)
    while (toDateStr(cur) <= end) {
      const ds = toDateStr(cur)
      const diff = Math.round(
        (cur.getTime() - d1.getTime()) / 86_400_000,
      )
      let match = false
      if (ev.recurring === "daily") match = true
      else if (ev.recurring === "weekly") match = diff % 7 === 0
      else if (ev.recurring === "monthly")
        match = d1.getDate() === cur.getDate()
      if (match) {
        out.push({ ...ev, instanceDate: ds, isRecurringInstance: ds !== ev.date })
      }
      cur.setDate(cur.getDate() + 1)
    }
  }
  out.sort(
    (a, b) =>
      a.instanceDate.localeCompare(b.instanceDate) ||
      a.startTime.localeCompare(b.startTime),
  )
  return out
}

function eventsForDate(events: CalendarEvent[], dateStr: string): CalendarEvent[] {
  return events.filter((e) => {
    if (e.date === dateStr) return true
    if (!e.recurring || e.recurring === "none") return false
    if (e.recurringEnd && dateStr > e.recurringEnd) return false
    if (dateStr < e.date) return false
    const diff = Math.round(
      (new Date(dateStr).getTime() - new Date(e.date).getTime()) / 86_400_000,
    )
    if (e.recurring === "daily") return true
    if (e.recurring === "weekly") return diff % 7 === 0
    if (e.recurring === "monthly")
      return new Date(e.date).getDate() === new Date(dateStr).getDate()
    return false
  })
}

function todosForDate(todos: TodoItem[], dateStr: string): TodoItem[] {
  return todos.filter((t) => !t.completed && t.dueDate === dateStr)
}

function systemEventsForDate(events: any[], dateStr: string): any[] {
  return events.filter((e: any) => e.date === dateStr)
}

function dropTimeFromEvent(e: React.DragEvent, hour: number): { startTime: string; endTime: string } {
  const rect = e.currentTarget.getBoundingClientRect()
  const yOffset = e.clientY - rect.top
  const minutes = Math.round((yOffset / ROW_H) * 60)
  const clamped = Math.max(0, Math.min(59, minutes))
  const startH = hour + clamped / 60
  const startTime = `${String(Math.floor(startH)).padStart(2, '0')}:${String(clamped).padStart(2, '0')}`
  let duration = 1
  try {
    const parsed = JSON.parse(e.dataTransfer.getData('text/plain'))
    duration = parsed.duration || 1
  } catch { /* ignore */ }
  const endH = startH + duration
  const endMinutes = Math.round((endH % 1) * 60)
  const endTime = `${String(Math.floor(endH)).padStart(2, '0')}:${String(endMinutes).padStart(2, '0')}`
  return { startTime, endTime }
}

function priorityStyle(p: string) {
  if (p === "high")
    return {
      bg: "bg-red-500/10 border-red-500/20",
      text: "text-red-600",
      dot: "#dc2626",
    }
  if (p === "medium")
    return {
      bg: "bg-amber-500/10 border-amber-500/20",
      text: "text-amber-600",
      dot: "#d97706",
    }
  return {
    bg: "bg-green-500/10 border-green-500/20",
    text: "text-green-600",
    dot: "#16a34a",
  }
}

function exportEventIcs(ev: CalendarEvent) {
  const ics = generateIcs([
    {
      title: ev.title,
      description: ev.description || "",
      date: ev.date,
      startTime: ev.startTime,
      endTime: ev.endTime,
    },
  ])
  downloadIcs(ics, `${ev.title.replace(/\s+/g, "-")}-${ev.date}.ics`)
}

const VIEW_ICONS: Record<ViewMode, React.ReactNode> = {
  day: <Maximize2 className="h-3.5 w-3.5" />,
  week: <Rows className="h-3.5 w-3.5" />,
  month: <Grid3X3 className="h-3.5 w-3.5" />,
  agenda: <LayoutList className="h-3.5 w-3.5" />,
}

interface EventForm {
  title: string
  description: string
  startTime: string
  endTime: string
  color: string
  recurring: string
  recurringEnd: string
}

interface TodoForm {
  title: string
  description: string
  priority: string
  dueDate: string
  dueTime: string
  estimatedMinutes: number
  category: string
}

const defaultEventForm = (): EventForm => ({
  title: "",
  description: "",
  startTime: "09:00",
  endTime: "10:00",
  color: "#8b5cf6",
  recurring: "none",
  recurringEnd: "",
})

const defaultTodoForm = (dueDate = ""): TodoForm => ({
  title: "",
  description: "",
  priority: "medium",
  dueDate,
  dueTime: "",
  estimatedMinutes: 30,
  category: "general",
})

export default function CalendarPage() {
  const t = useTranslations("calendarPage")
  const { user } = useAuth()

  const [view, setView] = useState<ViewMode>("month")
  const [section, setSection] = useState<Section>("calendar")
  const [currentDate, setCurrentDate] = useState(new Date())
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [systemEvents, setSystemEvents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [aiPlanning, setAiPlanning] = useState(false)
  const [aiSuggestion, setAiSuggestion] = useState("")

  const [eventDialogOpen, setEventDialogOpen] = useState(false)
  const [todoDialogOpen, setTodoDialogOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null)
  const [selectedDate, setSelectedDate] = useState(toDateStr(new Date()))
  const [eventForm, setEventForm] = useState<EventForm>(defaultEventForm())
  const [todoForm, setTodoForm] = useState<TodoForm>(defaultTodoForm())

  const [notifEnabledForEvent, setNotifEnabledForEvent] = useState<Record<number, boolean>>({})

  const toggleEventNotification = useCallback(async (eventId: number, enabled: boolean) => {
    try {
      await apiFetch(API_ENDPOINTS.calendarEventNotification.replace(':id', String(eventId)), {
        method: 'POST',
        body: JSON.stringify({ enabled }),
      })
      setNotifEnabledForEvent((prev) => ({ ...prev, [eventId]: enabled }))
    } catch { /* ignore */ }
  }, [])

  const today = useMemo(() => toDateStr(new Date()), [])
  const monthStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}`

  const load = useCallback(async () => {
    try {
      const year = String(currentDate.getFullYear())
      const [evData, tdData, sysData] = await Promise.all([
        apiFetch(`${API_ENDPOINTS.calendarEvents}?month=${monthStr}`),
        apiFetch(API_ENDPOINTS.calendarTodos),
        apiFetch(`/api/calendar/system-events?country=US&year=${year}`).catch(() => null),
      ])
      if (Array.isArray(evData)) setEvents(evData)
      if (Array.isArray(tdData)) setTodos(tdData)
      if (sysData && Array.isArray(sysData)) setSystemEvents(sysData)
    } catch {
      /* ignore the minion */
    } finally {
      setLoading(false)
    }
  }, [monthStr])

  useEffect(() => {
    load()
  }, [load])

  const navigate = useCallback(
    (dir: -1 | 1) => {
      setCurrentDate((prev) => {
        const d = new Date(prev)
        if (view === "day" || view === "agenda") d.setDate(d.getDate() + dir)
        else if (view === "week") d.setDate(d.getDate() + 7 * dir)
        else d.setMonth(d.getMonth() + dir)
        return d
      })
    },
    [view],
  )

  const goToday = useCallback(() => setCurrentDate(new Date()), [])

  const calSettings: CalendarSettings = useMemo(
    () => ({ ...DEFAULT_CALENDAR_SETTINGS, ...(user?.settings?.calendar ?? {}) }),
    [user],
  )

  const sortedTodos = useMemo(
    () =>
      [...todos].sort((a, b) => {
        const pa = a.priority === "high" ? 0 : a.priority === "medium" ? 1 : 2
        const pb = b.priority === "high" ? 0 : b.priority === "medium" ? 1 : 2
        if (pa !== pb) return pa - pb
        if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
        if (a.dueDate) return -1
        if (b.dueDate) return 1
        return 0
      }),
    [todos],
  )

  const cutoff = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() + 3)
    return toDateStr(d)
  }, [])

  const expandedEvents = useMemo(
    () => expandRecurring(events, today, cutoff),
    [events, today, cutoff],
  )

  const nowStr = new Date().toTimeString().slice(0, 5)

  const ongoingEvents = useMemo(
    () =>
      expandedEvents.filter(
        (ev) =>
          ev.instanceDate === today &&
          ev.startTime <= nowStr &&
          ev.endTime > nowStr,
      ),
    [expandedEvents, today, nowStr],
  )

  const upcomingEvents = useMemo(
    () =>
      expandedEvents
        .filter((ev) => {
          if (ev.instanceDate < today) return false
          if (ev.instanceDate === today && ev.endTime <= nowStr) return false
          return true
        })
        .slice(0, 8),
    [expandedEvents, today, nowStr],
  )

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate])
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart])

  const headerLabel = useMemo(() => {
    const d = currentDate
    if (view === "day" || view === "agenda") {
      return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`
    }
    if (view === "week") {
      const ws = getWeekStart(d)
      const we = addDays(ws, 6)
      if (ws.getMonth() === we.getMonth()) {
        return `${MONTHS[ws.getMonth()]} ${ws.getDate()}–${we.getDate()}, ${ws.getFullYear()}`
      }
      return `${MONTHS[ws.getMonth()]} ${ws.getDate()} – ${MONTHS[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`
    }
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
  }, [currentDate, view])

  const openNewEvent = useCallback((dateStr: string, startHour?: number) => {
    const h = startHour ?? 9
    const endH = Math.min(h + 1, 23)
    setSelectedDate(dateStr)
    setEditingEvent(null)
    setEventForm({
      ...defaultEventForm(),
      startTime: `${String(h).padStart(2, "0")}:00`,
      endTime: `${String(endH).padStart(2, "0")}:00`,
    })
    setEventDialogOpen(true)
  }, [])

  const openEditEvent = useCallback((ev: CalendarEvent) => {
    setSelectedDate(ev.date)
    setEditingEvent(ev)
    setEventForm({
      title: ev.title,
      description: ev.description,
      startTime: ev.startTime,
      endTime: ev.endTime,
      color: ev.color,
      recurring: ev.recurring,
      recurringEnd: ev.recurringEnd ?? "",
    })
    setEventDialogOpen(true)
    // Fetch notification status for this event
    apiFetch(API_ENDPOINTS.calendarEventNotification.replace(':id', String(ev.id)))
      .then((res: any) => {
        if (res && typeof res.enabled === 'boolean') {
          setNotifEnabledForEvent((prev) => ({ ...prev, [ev.id]: res.enabled }))
        }
      })
      .catch(() => {})
  }, [])

  const openNewTodo = useCallback((dateStr: string) => {
    setEditingTodo(null)
    setTodoForm(defaultTodoForm(dateStr))
    setTodoDialogOpen(true)
  }, [])

  const openEditTodo = useCallback((td: TodoItem) => {
    setEditingTodo(td)
    setTodoForm({
      title: td.title,
      description: td.description,
      priority: td.priority,
      dueDate: td.dueDate ?? "",
      dueTime: td.dueTime ?? "",
      estimatedMinutes: td.estimatedMinutes ?? 30,
      category: td.category ?? "general",
    })
    setTodoDialogOpen(true)
  }, [])

  const onEventDrop = useCallback(async (evId: number, newDate: string, newStartTime: string, newEndTime: string) => {
    try {
      await apiFetch(API_ENDPOINTS.calendarEvent.replace(":id", String(evId)), {
        method: "PUT",
        body: JSON.stringify({ date: newDate, startTime: newStartTime, endTime: newEndTime }),
      })
      setEvents((prev) => prev.map((e) =>
        e.id === evId ? { ...e, date: newDate, startTime: newStartTime, endTime: newEndTime } : e
      ))
    } catch { /* ignore */ }
  }, [])

  const saveEvent = useCallback(async () => {
    if (!eventForm.title.trim()) return
    const body = {
      title: eventForm.title.trim(),
      description: eventForm.description.trim(),
      date: selectedDate,
      startTime: eventForm.startTime,
      endTime: eventForm.endTime,
      color: eventForm.color,
      recurring: eventForm.recurring,
      recurringEnd: eventForm.recurringEnd || null,
    }
    try {
      if (editingEvent) {
        await apiFetch(
          API_ENDPOINTS.calendarEvent.replace(":id", String(editingEvent.id)),
          { method: "PUT", body: JSON.stringify(body) },
        )
      } else {
        await apiFetch(API_ENDPOINTS.calendarEvents, {
          method: "POST",
          body: JSON.stringify(body),
        })
      }
      setEventDialogOpen(false)
      load()
    } catch { /* uwu */ }
  }, [editingEvent, eventForm, selectedDate, load])

  const deleteEvent = useCallback(
    async (ev: CalendarEvent) => {
      try {
        await apiFetch(
          API_ENDPOINTS.calendarEvent.replace(":id", String(ev.id)),
          { method: "DELETE" },
        )
        setEventDialogOpen(false)
        load()
      } catch { /* owo */ }
    },
    [load],
  )

  const saveTodo = useCallback(async () => {
    if (!todoForm.title.trim()) return
    try {
      if (editingTodo) {
        await apiFetch(
          API_ENDPOINTS.calendarTodo.replace(":id", String(editingTodo.id)),
          { method: "PUT", body: JSON.stringify(todoForm) },
        )
      } else {
        await apiFetch(API_ENDPOINTS.calendarTodos, {
          method: "POST",
          body: JSON.stringify(todoForm),
        })
      }
      setTodoDialogOpen(false)
      load()
    } catch { /* uwu */ }
  }, [editingTodo, todoForm, load])

  const deleteTodo = useCallback(
    async (td: TodoItem) => {
      try {
        await apiFetch(
          API_ENDPOINTS.calendarTodo.replace(":id", String(td.id)),
          { method: "DELETE" },
        )
        setTodoDialogOpen(false)
        load()
      } catch { /* uwu */ }
    },
    [load],
  )

  const toggleTodo = useCallback(
    async (td: TodoItem) => {
      try {
        await apiFetch(
          API_ENDPOINTS.calendarTodoToggle.replace(":id", String(td.id)),
          { method: "PUT" },
        )
        load()
      } catch { /* uwu */ }
    },
    [load],
  )

  const handleAiPlan = useCallback(async () => {
    setAiPlanning(true)
    setAiSuggestion("")
    try {
      const todoCtx = sortedTodos
        .filter((t) => !t.completed)
        .slice(0, 10)
        .map(
          (t) =>
            `${t.title} (${t.priority})${t.dueDate ? ` due ${t.dueDate}` : ""}`,
        )
        .join("\n")
      const evCtx = events
        .slice(0, 10)
        .map((e) => `${e.title} on ${e.date} ${e.startTime}–${e.endTime}`)
        .join("\n")
      const prompt = `You are an AI planner. Help organize this week (starting ${toDateStr(weekStart)}).

Upcoming events:
${evCtx || "None"}

Open todos:
${todoCtx || "None"}

Suggest a concise daily plan for this week, prioritizing high-priority items first.`
      const res = await apiFetch(API_ENDPOINTS.openaiChat, {
        method: "POST",
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
        timeout: 30_000,
      })
      setAiSuggestion(
        res?.choices?.[0]?.message?.content ?? res?.reply ?? "",
      )
    } catch {
      setAiSuggestion("Failed to generate plan. Please try again.")
    } finally {
      setAiPlanning(false)
    }
  }, [sortedTodos, events, weekStart])

  const scheduleTodos = useCallback(() => {
    const unscheduled = sortedTodos
      .filter((t) => !t.completed && t.dueDate && t.estimatedMinutes > 0)

    type Slot = { start: number; total: number; remaining: number }

    const dailyWorkSlots: Record<string, Slot[]> = {}
    const dailyBreakSlots: Record<string, Slot[]> = {}

    const buildWorkSlots = (dateStr: string): Slot[] => {
      if (dailyWorkSlots[dateStr]) return dailyWorkSlots[dateStr]
      const booked = eventsForDate(events, dateStr).map((e) => ({
        start: timeToHours(e.startTime),
        end: timeToHours(e.endTime),
      }))
      const blocked = [
        ...booked,
        ...calSettings.breaks.map((b) => ({ start: b.start, end: b.end })),
      ].sort((a, b) => a.start - b.start)
      let cursor = calSettings.workStart
      const free: { start: number; end: number }[] = []
      for (const b of blocked) {
        if (b.start > cursor)
          free.push({ start: cursor, end: Math.min(b.start, calSettings.workEnd) })
        cursor = Math.max(cursor, b.end)
      }
      if (cursor < calSettings.workEnd)
        free.push({ start: cursor, end: calSettings.workEnd })
      dailyWorkSlots[dateStr] = free.map((s) => ({
        start: s.start,
        total: (s.end - s.start) * 60,
        remaining: (s.end - s.start) * 60,
      }))
      return dailyWorkSlots[dateStr]
    }

    const buildBreakSlots = (dateStr: string): Slot[] => {
      if (dailyBreakSlots[dateStr]) return dailyBreakSlots[dateStr]
      const booked = eventsForDate(events, dateStr).map((e) => ({
        start: timeToHours(e.startTime),
        end: timeToHours(e.endTime),
      }))
      dailyBreakSlots[dateStr] = calSettings.breaks.flatMap((br) => {
        let cursor = br.start
        const free: { start: number; end: number }[] = []
        for (const b of booked.filter((b) => b.start < br.end && b.end > br.start)) {
          if (b.start > cursor) free.push({ start: cursor, end: Math.min(b.start, br.end) })
          cursor = Math.max(cursor, b.end)
        }
        if (cursor < br.end) free.push({ start: cursor, end: br.end })
        return free.map((s) => ({
          start: s.start,
          total: (s.end - s.start) * 60,
          remaining: (s.end - s.start) * 60,
        }))
      })
      return dailyBreakSlots[dateStr]
    }

    const updates: Promise<unknown>[] = []
    for (const td of unscheduled) {
      let remaining = td.estimatedMinutes
      if (remaining <= 0) continue
      const isFreeTime = td.category === "freetime"
      const dayPtr = new Date()
      let suggestedTime = ""
      let dayCount = 0
      while (remaining > 0 && dayCount < 30) {
        const dateStr = toDateStr(dayPtr)
        if (dateStr > td.dueDate) break
        const canPlan =
          isFreeTime || calSettings.workDays.includes(dayPtr.getDay())
        if (canPlan) {
          const slotSets = isFreeTime
            ? [buildBreakSlots(dateStr), buildWorkSlots(dateStr)]
            : [buildWorkSlots(dateStr)]
          for (const slots of slotSets) {
            for (const sl of slots) {
              if (sl.remaining <= 0 || remaining <= 0) continue
              const consumed = sl.total - sl.remaining
              const assign = Math.min(remaining, sl.remaining)
              sl.remaining -= assign
              remaining -= assign
              if (!suggestedTime) {
                const h = sl.start + Math.floor(consumed / 60)
                suggestedTime = `${String(Math.min(h, 23)).padStart(2, "0")}:00`
              }
            }
          }
        }
        dayPtr.setDate(dayPtr.getDate() + 1)
        dayCount++
      }
      if (suggestedTime) {
        updates.push(
          apiFetch(
            API_ENDPOINTS.calendarTodo.replace(":id", String(td.id)),
            { method: "PUT", body: JSON.stringify({ dueTime: suggestedTime }) },
          ),
        )
      }
    }
    Promise.all(updates).then(() => load())
  }, [sortedTodos, events, calSettings, load])

  const handleIcsImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const parsed = parseIcs(reader.result as string)
        Promise.all(
          parsed.map((ev) =>
            apiFetch(API_ENDPOINTS.calendarEvents, {
              method: "POST",
              body: JSON.stringify(ev),
            }).catch(() => {}),
          ),
        ).then(() => load())
      }
      reader.readAsText(file)
      e.target.value = ""
    },
    [load],
  )

  const handleIcsExport = useCallback(() => {
    const ics = generateIcs(
      expandedEvents.map((ev) => ({
        title: ev.title,
        description: ev.description,
        date: ev.instanceDate,
        startTime: ev.startTime,
        endTime: ev.endTime,
      })),
    )
    downloadIcs(ics, `calendar-${monthStr}.ics`)
  }, [expandedEvents, monthStr])

  const saveCalSettings = useCallback(
    (s: CalendarSettings) => {
      apiFetch(
        API_ENDPOINTS.userDetail.replace(":id", String(user?.id)),
        { method: "PUT", body: JSON.stringify({ settings: { calendar: s } }) },
      ).catch(() => {})
    },
    [user],
  )

  return (
    <FeatureGuard feature="calendar">
      <RolloutGuard rolloutKey="calendar" fallback={
        <div className="flex flex-col items-center justify-center py-24 px-6 gap-4 max-w-md mx-auto text-center">
          <div className="h-16 w-16 bg-secondary/50 flex items-center justify-center">
            <CalendarDays className="h-8 w-8 text-muted-foreground/30" />
          </div>
          <div>
            <p className="text-base font-semibold text-foreground">Calendar is being rolled out</p>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">This feature is being gradually released. It should be available to you soon.</p>
          </div>
        </div>
      }>
      <PanelHeader title={t("title")} description={t("description")} />
      <ScrollArea className="flex-1 overflow-x-hidden max-w-[100vw]">
        <div className="flex flex-col">
          {/* ── Section tabs ──────────────────────────── */}
          <div className="flex items-center gap-1 px-3 md:px-6 py-2 border-b border-border/30 bg-muted/10">
            {(["calendar", "tasks", "bookings"] as const).map((sec) => (
              <button
                key={sec}
                onClick={() => setSection(sec)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all",
                  section === sec
                    ? "bg-background text-foreground shadow-sm border border-border/50"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {sec === "calendar" && <CalendarDays className="h-3.5 w-3.5" />}
                {sec === "tasks" && <ListTodo className="h-3.5 w-3.5" />}
                {sec === "bookings" && <Users className="h-3.5 w-3.5" />}
                {sec === "calendar" ? "Calendar" : sec === "tasks" ? "Tasks" : "Bookings"}
              </button>
            ))}

            <div className="flex-1" />

            {section === "tasks" && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={scheduleTodos}
                  className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex items-center gap-1"
                 data-telemetry="calendar:scheduletodos">
                  <Sparkles className="h-3 w-3" /> Auto-schedule
                </button>
                <button
                  onClick={handleAiPlan}
                  disabled={aiPlanning}
                  className="px-2.5 py-1.5 text-[10px] font-medium rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors flex items-center gap-1 disabled:opacity-60"
                 data-telemetry="calendar:aiplan">
                  <Bot className={cn("h-3 w-3", aiPlanning && "animate-spin")} />
                  AI Plan
                </button>
              </div>
            )}
          </div>

          {/* ── Calendar toolbar ──────────────────────── */}
          {section === "calendar" && (
            <div className="flex flex-wrap items-center gap-2 px-3 md:px-6 py-2 md:py-3 border-b border-border/50 bg-card/30">
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => navigate(-1)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={goToday}
                    className="px-2 md:px-3 py-1 md:py-1.5 text-[11px] md:text-xs font-medium rounded-lg border border-border/60 text-foreground hover:bg-secondary/60 transition-colors"
                   data-telemetry="calendar:gotoday">
                    Today
                  </button>
                  <button
                    onClick={() => navigate(1)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <h1 className="text-sm md:text-base font-semibold text-foreground truncate">{headerLabel}</h1>
              </div>

              <div className="flex items-center gap-1.5 ml-auto">
                {/* View switcher */}
                <div className="flex bg-secondary/40 border border-border/60 rounded-lg p-0.5">
                  {(Object.keys(VIEW_ICONS) as ViewMode[]).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={cn(
                        "flex items-center gap-1 px-1.5 md:px-2.5 py-1 text-[11px] font-medium rounded-md transition-all",
                        view === v
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {VIEW_ICONS[v]}
                      <span className="hidden md:inline capitalize">{v}</span>
                    </button>
                  ))}
                </div>

                {/* ICS import / export */}
                <div className="hidden sm:flex items-center gap-1">
                  <label
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors cursor-pointer"
                    title="Import ICS"
                  >
                    <Upload className="h-4 w-4" />
                    <input
                      type="file"
                      accept=".ics"
                      className="hidden"
                      onChange={handleIcsImport}
                    />
                  </label>
                  <button
                    onClick={handleIcsExport}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    title="Export ICS"
                   data-telemetry="calendar:icsexport">
                    <Share2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Quick add event */}
                <Button
                  size="sm"
                  onClick={() => openNewEvent(toDateStr(currentDate))}
                  className="text-xs gap-1 h-7 md:h-8"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Event</span>
                </Button>
              </div>
            </div>
          )}

          {/* ── Body ──────────────────────────────────── */}
          <div className="flex flex-1 min-h-0">
            {section === "calendar" && (
              <>
                <CalendarSidebar
                  currentDate={currentDate}
                  today={today}
                  onDateSelect={(d) => {
                    setCurrentDate(d)
                    setView("day")
                  }}
                  ongoingEvents={ongoingEvents}
                  upcomingEvents={upcomingEvents}
                  events={events}
                  calSettings={calSettings}
                  onSaveSettings={saveCalSettings}
                />
                <div className="flex-1 min-w-0 p-2 md:p-4">
                  {view === "month" && (
                    <MonthView
                      currentDate={currentDate}
                      today={today}
                      events={events}
                      systemEvents={systemEvents}
                      todos={sortedTodos}
                      onDateSelect={(d) => {
                        setCurrentDate(d)
                        setView("day")
                      }}
                      onNewEvent={openNewEvent}
                      onEditEvent={openEditEvent}
                      onEditTodo={openEditTodo}
                      load={load}
                    />
                  )}
                  {view === "week" && (
                    <WeekView
                      currentDate={currentDate}
                      today={today}
                      events={events}
                      systemEvents={systemEvents}
                      todos={sortedTodos}
                      onDateSelect={(d) => {
                        setCurrentDate(d)
                        setView("day")
                      }}
                      onNewEvent={openNewEvent}
                      onEventDrop={onEventDrop}
                      onEditEvent={openEditEvent}
                      onEditTodo={openEditTodo}
                      onToggleTodo={toggleTodo}
                      calSettings={calSettings}
                    />
                  )}
                  {view === "day" && (
                    <DayView
                      currentDate={currentDate}
                      today={today}
                      events={events}
                      systemEvents={systemEvents}
                      todos={sortedTodos}
                      onNewEvent={openNewEvent}
                      onNewTodo={openNewTodo}
                      onEventDrop={onEventDrop}
                      onEditEvent={openEditEvent}
                      onEditTodo={openEditTodo}
                      onToggleTodo={toggleTodo}
                      calSettings={calSettings}
                    />
                  )}
                  {view === "agenda" && (
                    <AgendaView
                      currentDate={currentDate}
                      today={today}
                      expandedEvents={expandedEvents}
                      todos={sortedTodos}
                      onEditEvent={openEditEvent}
                      onEditTodo={openEditTodo}
                      onToggleTodo={toggleTodo}
                    />
                  )}
                </div>
              </>
            )}

            {section === "tasks" && (
              <TodoView
                todos={sortedTodos}
                today={today}
                weekStart={toDateStr(weekStart)}
                weekEnd={toDateStr(weekEnd)}
                onTodosChange={load}
                aiPlanning={aiPlanning}
                aiSuggestion={aiSuggestion}
                onAiPlan={handleAiPlan}
              />
            )}

            {section === "bookings" && (
              <BookingsView onEventsChange={load} />
            )}
          </div>
        </div>
      </ScrollArea>

      {/* ── Shared dialogs ────────────────────────────── */}
      <EventDialog
        open={eventDialogOpen}
        onOpenChange={setEventDialogOpen}
        editingEvent={editingEvent}
        selectedDate={selectedDate}
        form={eventForm}
        setForm={setEventForm}
        onSave={saveEvent}
        onDelete={() => editingEvent && deleteEvent(editingEvent)}
        notificationEnabled={editingEvent ? notifEnabledForEvent[editingEvent.id] : false}
        onToggleNotification={(enabled) => editingEvent && toggleEventNotification(editingEvent.id, enabled)}
      />
      <TodoDialog
        open={todoDialogOpen}
        onOpenChange={setTodoDialogOpen}
        editingTodo={editingTodo}
        form={todoForm}
        setForm={setTodoForm}
        onSave={saveTodo}
        onDelete={() => editingTodo && deleteTodo(editingTodo)}
      />
    </RolloutGuard>
    </FeatureGuard>
  )
}

/* ══════════════════════════════════════════════════════
   SIDEBAR
══════════════════════════════════════════════════════ */

function CalendarSidebar({
  currentDate, today, onDateSelect, ongoingEvents, upcomingEvents,
  events, calSettings, onSaveSettings,
}: {
  currentDate: Date
  today: string
  onDateSelect: (d: Date) => void
  ongoingEvents: ExpandedInstance[]
  upcomingEvents: ExpandedInstance[]
  events: CalendarEvent[]
  calSettings: CalendarSettings
  onSaveSettings: (s: CalendarSettings) => void
}) {
  const [miniMonth, setMiniMonth] = useState(() => new Date())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const miniDays = useMemo(
    () => getMonthDays(miniMonth.getFullYear(), miniMonth.getMonth()),
    [miniMonth],
  )

  const eventCountByDate = useMemo(() => {
    const map: Record<string, number> = {}
    for (const ev of events) {
      map[ev.date] = (map[ev.date] ?? 0) + 1
    }
    return map
  }, [events])

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-border/50 bg-card/20">
      {/* Mini calendar */}
      <div className="p-3 border-b border-border/40">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-foreground">
            {MONTHS[miniMonth.getMonth()]} {miniMonth.getFullYear()}
          </span>
          <div className="flex items-center gap-0.5">
            <button
              onClick={() =>
                setMiniMonth(
                  new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1),
                )
              }
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <button
              onClick={() => setMiniMonth(new Date())}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <CalendarDays className="h-3 w-3" />
            </button>
            <button
              onClick={() =>
                setMiniMonth(
                  new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1),
                )
              }
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-px">
          {DAYS.map((d) => (
            <div
              key={d}
              className="text-[9px] text-muted-foreground text-center font-medium pb-1"
            >
              {d[0]}
            </div>
          ))}
          {miniDays.map(({ date, isPadding }, i) => {
            const ds = toDateStr(date)
            const isToday = ds === today
            const isSelected = ds === toDateStr(currentDate)
            const count = eventCountByDate[ds] ?? 0
            return (
              <button
                key={i}
                onClick={() => onDateSelect(date)}
                className={cn(
                  "relative text-[10px] w-full aspect-square rounded flex items-center justify-center transition-colors",
                  isPadding
                    ? "text-muted-foreground/25 pointer-events-none"
                    : "text-foreground hover:bg-secondary/60",
                  isSelected && !isToday && "bg-primary/15 text-primary font-semibold",
                  isToday && "bg-primary text-primary-foreground font-semibold",
                )}
              >
                {date.getDate()}
                {count > 0 && !isToday && (
                  <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-primary/60" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Ongoing */}
      {ongoingEvents.length > 0 && (
        <div className="px-3 pt-3 pb-1 border-b border-border/30">
          <h3 className="text-[10px] font-semibold text-green-500 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
            Ongoing · {ongoingEvents.length}
          </h3>
          <div className="space-y-1.5">
            {ongoingEvents.slice(0, 3).map((ev) => (
              <div
                key={`og-${ev.id}-${ev.instanceDate}`}
                className="flex items-start gap-2 p-2 rounded-lg border border-green-500/20 bg-green-500/[0.04]"
              >
                <div
                  className="w-0.5 h-8 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: ev.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground truncate">{ev.title}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {formatTime(ev.startTime)}–{formatTime(ev.endTime)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upcoming */}
      <div className="px-3 pt-3 pb-1 flex-1 overflow-y-auto">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Upcoming
        </h3>
        {upcomingEvents.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No upcoming events</p>
        ) : (
          <div className="space-y-1.5">
            {upcomingEvents.map((ev) => (
              <div
                key={`up-${ev.id}-${ev.instanceDate}`}
                className="flex items-start gap-2 p-2 rounded-lg border border-border/50 hover:bg-secondary/30 transition-colors cursor-pointer"
              >
                <div
                  className="w-0.5 h-8 rounded-full shrink-0 mt-0.5"
                  style={{ backgroundColor: ev.color }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium text-foreground truncate">{ev.title}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {ev.instanceDate === today ? "Today" : ev.instanceDate} ·{" "}
                    {formatTime(ev.startTime)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Settings button */}
      <div className="p-3 border-t border-border/40">
        <button
          onClick={() => setSettingsOpen(true)}
          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary/60 transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Calendar settings
        </button>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={calSettings}
        onSave={(s) => {
          onSaveSettings(s)
          setSettingsOpen(false)
        }}
      />
    </aside>
  )
}

/* ══════════════════════════════════════════════════════
   MONTH VIEW
══════════════════════════════════════════════════════ */

function MonthView({
  currentDate, today, events, systemEvents, todos, onDateSelect, onNewEvent, onEditEvent, onEditTodo, load,
}: {
  currentDate: Date
  today: string
  events: CalendarEvent[]
  systemEvents: any[]
  todos: TodoItem[]
  onDateSelect: (d: Date) => void
  onNewEvent: (dateStr: string) => void
  onEditEvent: (ev: CalendarEvent) => void
  onEditTodo: (td: TodoItem) => void
  load: () => void
}) {
  const days = useMemo(
    () => getMonthDays(currentDate.getFullYear(), currentDate.getMonth()),
    [currentDate],
  )

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-card/10">
      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 border-b border-border/40 bg-muted/20">
        {DAYS.map((d) => (
          <div
            key={d}
            className="px-1 md:px-2 py-1.5 md:py-2 text-[9px] md:text-[10px] font-medium text-muted-foreground uppercase tracking-wider text-center"
          >
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d.slice(0, 1)}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map(({ date, isPadding }, i) => {
          const ds = toDateStr(date)
          const isToday = ds === today
          const dayEvents = eventsForDate(events, ds).sort((a, b) =>
            a.startTime.localeCompare(b.startTime),
          )
          const dayTodos = todosForDate(todos, ds)

          // Interleave events + todos sorted by time
          const items: (
            | { kind: "event"; ev: CalendarEvent }
            | { kind: "todo"; td: TodoItem }
          )[] = [
            ...dayEvents.map((ev) => ({ kind: "event" as const, ev })),
            ...dayTodos.map((td) => ({ kind: "todo" as const, td })),
          ].sort((a, b) => {
            const aT = a.kind === "event" ? a.ev.startTime : a.td.dueTime || "23:59"
            const bT = b.kind === "event" ? b.ev.startTime : b.td.dueTime || "23:59"
            return aT.localeCompare(bT)
          })

          return (
            <div
              key={i}
              onClick={() => !isPadding && onDateSelect(date)}
              className={cn(
                "min-h-[80px] md:min-h-[110px] p-1 md:p-1.5 border-b border-r border-border/30 transition-colors relative group",
                isPadding ? "bg-muted/[0.03]" : "cursor-pointer hover:bg-secondary/10",
              )}
            >
              {/* Date number */}
              <div className="flex items-center justify-between mb-0.5 md:mb-1">
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-5 h-5 md:w-6 md:h-6 text-[10px] md:text-[11px] rounded-full font-medium",
                    isToday
                      ? "bg-primary text-primary-foreground"
                      : isPadding
                        ? "text-muted-foreground/30"
                        : "text-foreground",
                  )}
                >
                  {date.getDate()}
                </span>
                {!isPadding && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onNewEvent(ds)
                    }}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-all"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Items */}
              <div className="space-y-0.5">
                {systemEventsForDate(systemEvents, ds).slice(0, 2).map((sev: any) => (
                  <div
                    key={`sev-${sev.id}`}
                    className="text-[9px] px-1.5 py-0.5 rounded truncate text-muted-foreground/60 italic"
                    title={sev.description}
                  >
                    {sev.title}
                  </div>
                ))}
                {items.slice(0, Math.max(0, 4 - systemEventsForDate(systemEvents, ds).length)).map((item) =>
                  item.kind === "event" ? (
                    <EventChip
                      key={`ev-${item.ev.id}`}
                      event={item.ev}
                      compact
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditEvent(item.ev)
                      }}
                    />
                  ) : (
                    <TodoChip
                      key={`td-${item.td.id}`}
                      todo={item.td}
                      compact
                      onClick={(e) => {
                        e.stopPropagation()
                        onEditTodo(item.td)
                      }}
                    />
                  ),
                )}
                {items.length > Math.max(0, 4 - systemEventsForDate(systemEvents, ds).length) && (
                  <span className="text-[9px] text-muted-foreground pl-1">
                    +{items.length - Math.max(0, 4 - systemEventsForDate(systemEvents, ds).length)} more
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   WEEK VIEW
══════════════════════════════════════════════════════ */

function WeekView({
  currentDate, today, events, systemEvents, todos, onDateSelect, onNewEvent, onEventDrop, onEditEvent, onEditTodo, onToggleTodo, calSettings,
}: {
  currentDate: Date
  today: string
  events: CalendarEvent[]
  systemEvents: any[]
  todos: TodoItem[]
  onDateSelect: (d: Date) => void
  onNewEvent: (dateStr: string, startHour?: number) => void
  onEventDrop?: (evId: number, newDate: string, newStartTime: string, newEndTime: string) => void
  onEditEvent: (ev: CalendarEvent) => void
  onEditTodo: (td: TodoItem) => void
  onToggleTodo: (td: TodoItem) => void
  calSettings: CalendarSettings
}) {
  const ws = useMemo(() => getWeekStart(currentDate), [currentDate])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(ws, i)),
    [ws],
  )
  const scrollRef = useRef<HTMLDivElement>(null)
  const totalH = 24 * ROW_H

  // Scroll to work start on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = calSettings.workStart * ROW_H - 32
    }
  }, [calSettings.workStart])

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-card/10 flex flex-col">
      {/* Day headers */}
      <div className="flex border-b border-border/40 bg-muted/20 shrink-0">
        <div className="w-10 md:w-14 shrink-0 border-r border-border/30" />
        {weekDays.map((d) => {
          const ds = toDateStr(d)
          const isToday = ds === today
          const evCount = eventsForDate(events, ds).length
          return (
            <div
              key={ds}
              onClick={() => onDateSelect(d)}
              className={cn(
                "flex-1 px-1 md:px-2 py-1.5 md:py-2 text-center border-r border-border/30 last:border-r-0 cursor-pointer hover:bg-secondary/20 transition-colors",
                isToday && "bg-primary/[0.04]",
              )}
            >
              <div className="text-[9px] md:text-[10px] font-medium text-muted-foreground">{DAYS[d.getDay()]}</div>
              <div
                className={cn(
                  "inline-flex items-center justify-center w-6 h-6 md:w-7 md:h-7 text-[10px] md:text-xs rounded-full mt-0.5 font-medium",
                  isToday
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground",
                )}
              >
                {d.getDate()}
              </div>
              {evCount > 0 && (
                <div className="hidden md:block text-[9px] text-muted-foreground mt-0.5">
                  {evCount} event{evCount !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Scrollable timeline */}
      <div ref={scrollRef} className="overflow-auto flex-1 max-h-[50vh] md:max-h-[65vh]">
        <div className="flex" style={{ height: totalH }}>
          {/* Hour labels */}
          <div className="w-10 md:w-14 shrink-0 border-r border-border/30 relative bg-card/10">
            {HOURS.map((h) => (
              <div
                key={h}
                className="relative border-t border-border/10"
                style={{ height: ROW_H }}
              >
                <span
                  className={cn(
                    "absolute -top-2.5 right-2 text-[9px] select-none",
                    h >= calSettings.workStart && h < calSettings.workEnd
                      ? "text-muted-foreground"
                      : "text-muted-foreground/30",
                  )}
                >
                  {String(h).padStart(2, "0")}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {weekDays.map((d) => {
            const ds = toDateStr(d)
            const dayEvents = eventsForDate(events, ds).sort((a, b) =>
              a.startTime.localeCompare(b.startTime),
            )
            const dayTodos = todosForDate(todos, ds).filter((t) => t.dueTime)
            const isToday = ds === today

            return (
              <div
                key={ds}
                data-day-col={ds}
                className={cn(
                  "flex-1 relative border-r border-border/20 last:border-r-0",
                  isToday && "bg-primary/[0.015]",
                )}
                style={{ height: totalH }}
              >
                {/* Hour grid lines */}
                {HOURS.map((h) => (
                  <div
                    key={h}
                    onClick={() => onNewEvent(ds, h)}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const data = e.currentTarget.closest('[data-day-col]')?.getAttribute('data-day-col')
                      if (!onEventDrop || !data) return
                      const { startTime, endTime } = dropTimeFromEvent(e, h)
                      try {
                        const parsed = JSON.parse(e.dataTransfer.getData('text/plain'))
                        onEventDrop(parsed.id, data, startTime, endTime)
                      } catch { /* ignore */ }
                    }}
                    className="absolute left-0 right-0 border-t border-border/10 hover:bg-secondary/20 transition-colors cursor-pointer"
                    style={{ top: h * ROW_H, height: ROW_H }}
                  />
                ))}

                {/* Half-hour dashes */}
                {HOURS.map((h) => (
                  <div
                    key={`half-${h}`}
                    className="absolute left-0 right-0 border-t border-dashed border-border/[0.06] pointer-events-none"
                    style={{ top: h * ROW_H + ROW_H / 2 }}
                  />
                ))}

                {/* Work-hours highlight */}
                <div
                  className="absolute left-0 right-0 bg-primary/[0.025] pointer-events-none"
                  style={{
                    top: calSettings.workStart * ROW_H,
                    height: (calSettings.workEnd - calSettings.workStart) * ROW_H,
                  }}
                />

                {/* Now indicator */}
                {isToday && (
                  <NowLine />
                )}

                {/* System events (holidays) */}
                {systemEventsForDate(systemEvents, ds).map((sev: any) => {
                  const sysH = 6 // show holidays in early morning area
                  return (
                    <div
                      key={`sev-${sev.id}`}
                      className="absolute left-0 right-0 flex items-center gap-1 px-1.5 pointer-events-none"
                      style={{ top: sysH * ROW_H, height: 18 }}
                      title={sev.description}
                    >
                      <span className="text-[8px] text-muted-foreground/40">&#127799;</span>
                      <span className="text-[9px] text-muted-foreground/50 italic truncate">{sev.title}</span>
                    </div>
                  )
                })}

                {/* Events */}
                {layoutEvents(dayEvents).map(({ ev, left, width }) => {
                  const startH = timeToHours(ev.startTime)
                  const endH = Math.max(timeToHours(ev.endTime), startH + 0.25)
                  return (
                    <EventChip
                      key={`ev-${ev.id}`}
                      event={ev}
                      onClick={() => onEditEvent(ev)}
                      style={{
                        top: startH * ROW_H,
                        height: Math.max((endH - startH) * ROW_H, 20),
                        left: `${left * 100}%`,
                        width: `${width * 100}%`,
                      }}
                    />
                  )
                })}

                {/* Todos */}
                {dayTodos.map((td) => {
                  const h = timeToHours(td.dueTime)
                  const estH = Math.max((td.estimatedMinutes || 30) / 60, 0.25)
                  return (
                    <TodoChip
                      key={`td-${td.id}`}
                      todo={td}
                      onClick={() => onEditTodo(td)}
                      onToggle={() => onToggleTodo(td)}
                      style={{
                        top: h * ROW_H,
                        height: Math.max(estH * ROW_H, 20),
                        left: "60%",
                        width: "38%",
                      }}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Layout overlapping events side by side ─────────── */

function layoutEvents(events: CalendarEvent[]) {
  // Simple greedy column layout
  type Placed = {
    ev: CalendarEvent
    col: number
    totalCols: number
    left: number
    width: number
  }
  const placed: Placed[] = []
  const cols: number[] = [] // end time of last event in each column

  for (const ev of events) {
    const start = timeToHours(ev.startTime)
    const end = Math.max(timeToHours(ev.endTime), start + 0.25)
    let col = cols.findIndex((endT) => endT <= start)
    if (col === -1) {
      col = cols.length
      cols.push(end)
    } else {
      cols[col] = end
    }
    placed.push({ ev, col, totalCols: 0, left: 0, width: 0 })
  }

  const total = cols.length || 1
  for (const p of placed) {
    p.totalCols = total
    p.left = p.col / total
    p.width = 1 / total
  }
  return placed
}

/* ══════════════════════════════════════════════════════
   DAY VIEW
══════════════════════════════════════════════════════ */

function DayView({
  currentDate, today, events, systemEvents, todos, onNewEvent, onNewTodo, onEventDrop, onEditEvent, onEditTodo, onToggleTodo, calSettings,
}: {
  currentDate: Date
  today: string
  events: CalendarEvent[]
  systemEvents: any[]
  todos: TodoItem[]
  onNewEvent: (dateStr: string, startHour?: number) => void
  onNewTodo: (dateStr: string) => void
  onEventDrop?: (evId: number, newDate: string, newStartTime: string, newEndTime: string) => void
  onEditEvent: (ev: CalendarEvent) => void
  onEditTodo: (td: TodoItem) => void
  onToggleTodo: (td: TodoItem) => void
  calSettings: CalendarSettings
}) {
  const ds = toDateStr(currentDate)
  const isToday = ds === today
  const totalH = 24 * ROW_H
  const scrollRef = useRef<HTMLDivElement>(null)

  const dayEvents = useMemo(
    () =>
      eventsForDate(events, ds).sort((a, b) =>
        a.startTime.localeCompare(b.startTime),
      ),
    [events, ds],
  )
  const dayTodos = useMemo(
    () => todosForDate(todos, ds).filter((t) => t.dueTime),
    [todos, ds],
  )

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = calSettings.workStart * ROW_H - 32
    }
  }, [ds, calSettings.workStart])

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden bg-card/10 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-4 py-2 md:py-2.5 border-b border-border/40 bg-muted/20 shrink-0">
        <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
          <span
            className={cn(
              "text-xs md:text-sm font-semibold truncate",
              isToday ? "text-primary" : "text-foreground",
            )}
          >
            {DAYS[currentDate.getDay()]}, {MONTHS[currentDate.getMonth()]}{" "}
            {currentDate.getDate()}
          </span>
          {isToday && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium shrink-0">
              Today
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNewEvent(ds)}
            className="text-[10px] md:text-xs gap-0.5 md:gap-1 h-6 md:h-7 px-1.5 md:px-2"
          >
            <Plus className="h-3 md:h-3.5 w-3 md:w-3.5" />
            <span className="hidden sm:inline">Event</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNewTodo(ds)}
            className="text-[10px] md:text-xs gap-0.5 md:gap-1 h-6 md:h-7 px-1.5 md:px-2"
          >
            <Check className="h-3 md:h-3.5 w-3 md:w-3.5" />
            <span className="hidden sm:inline">Task</span>
          </Button>
        </div>
      </div>

      {/* Timeline */}
      <div ref={scrollRef} className="overflow-auto max-h-[50vh] md:max-h-[65vh]">
        <div className="relative" style={{ height: totalH }}>
          {/* Work-hours highlight */}
          <div
            className="absolute left-14 right-0 bg-primary/[0.025] pointer-events-none border-y border-primary/[0.06]"
            style={{
              top: calSettings.workStart * ROW_H,
              height: (calSettings.workEnd - calSettings.workStart) * ROW_H,
            }}
          />

          {/* Hour rows */}
          {HOURS.map((h) => (
            <div
              key={h}
              onClick={() => onNewEvent(ds, h)}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={(e) => {
                e.preventDefault()
                if (!onEventDrop) return
                const { startTime, endTime } = dropTimeFromEvent(e, h)
                try {
                  const parsed = JSON.parse(e.dataTransfer.getData('text/plain'))
                  onEventDrop(parsed.id, ds, startTime, endTime)
                } catch { /* ignore */ }
              }}
              className="absolute left-0 right-0 border-t border-border/10 cursor-pointer hover:bg-secondary/10 transition-colors"
              style={{ top: h * ROW_H, height: ROW_H }}
            >
              <span
                className={cn(
                  "absolute -top-2 left-2 text-[9px] px-1 bg-background select-none",
                  h >= calSettings.workStart && h < calSettings.workEnd
                    ? "text-muted-foreground"
                    : "text-muted-foreground/30",
                )}
              >
                {String(h).padStart(2, "0")}:00
              </span>
            </div>
          ))}

          {/* Half-hour lines */}
          {HOURS.map((h) => (
            <div
              key={`half-${h}`}
              className="absolute left-14 right-0 border-t border-dashed border-border/[0.06] pointer-events-none"
              style={{ top: h * ROW_H + ROW_H / 2 }}
            />
          ))}

          {/* Now indicator */}
          {isToday && <NowLine offsetLeft={56} />}

          {/* System events (holidays) */}
          {systemEventsForDate(systemEvents, ds).map((sev: any) => {
            const sysH = 6
            return (
              <div
                key={`sev-${sev.id}`}
                className="absolute left-14 right-0 flex items-center gap-1 px-1.5 pointer-events-none"
                style={{ top: sysH * ROW_H, height: 18 }}
                title={sev.description}
              >
                <span className="text-[8px] text-muted-foreground/40">&#127799;</span>
                <span className="text-[9px] text-muted-foreground/50 italic truncate">{sev.title}</span>
              </div>
            )
          })}

          {/* Events */}
          {layoutEvents(dayEvents).map(({ ev, left, width }) => {
            const startH = timeToHours(ev.startTime)
            const endH = Math.max(timeToHours(ev.endTime), startH + 0.25)
            const L = 56 + left * (100 - 56) // offset past hour labels
            return (
              <EventChip
                key={`ev-${ev.id}`}
                event={ev}
                onClick={() => onEditEvent(ev)}
                style={{
                  top: startH * ROW_H + 1,
                  height: Math.max((endH - startH) * ROW_H - 2, 20),
                  left: `calc(3.5rem + ${left * 90}%)`,
                  width: `${width * 90}%`,
                }}
              />
            )
          })}

          {/* Todos */}
          {dayTodos.map((td) => {
            const h = timeToHours(td.dueTime)
            const estH = Math.max((td.estimatedMinutes || 30) / 60, 0.25)
            return (
              <TodoChip
                key={`td-${td.id}`}
                todo={td}
                onClick={() => onEditTodo(td)}
                onToggle={() => onToggleTodo(td)}
                style={{
                  top: h * ROW_H + 1,
                  height: Math.max(estH * ROW_H - 2, 20),
                  left: "calc(3.5rem + 60%)",
                  width: "calc(38% - 4px)",
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   AGENDA VIEW
══════════════════════════════════════════════════════ */

function AgendaView({
  currentDate, today, expandedEvents, todos, onEditEvent, onEditTodo, onToggleTodo,
}: {
  currentDate: Date
  today: string
  expandedEvents: ExpandedInstance[]
  todos: TodoItem[]
  onEditEvent: (ev: CalendarEvent) => void
  onEditTodo: (td: TodoItem) => void
  onToggleTodo: (td: TodoItem) => void
}) {
  // Show next 30 days from currentDate
  const startStr = toDateStr(currentDate)
  const endDate = addDays(currentDate, 30)
  const endStr = toDateStr(endDate)

  const days = useMemo(() => {
    const out: string[] = []
    const d = new Date(currentDate)
    for (let i = 0; i <= 30; i++) {
      out.push(toDateStr(d))
      d.setDate(d.getDate() + 1)
    }
    return out
  }, [currentDate])

  const eventsByDate = useMemo(() => {
    const map: Record<string, ExpandedInstance[]> = {}
    for (const ev of expandedEvents) {
      if (ev.instanceDate >= startStr && ev.instanceDate <= endStr) {
        ;(map[ev.instanceDate] ??= []).push(ev)
      }
    }
    return map
  }, [expandedEvents, startStr, endStr])

  const todosByDate = useMemo(() => {
    const map: Record<string, TodoItem[]> = {}
    for (const td of todos) {
      if (!td.completed && td.dueDate >= startStr && td.dueDate <= endStr) {
        ;(map[td.dueDate] ??= []).push(td)
      }
    }
    return map
  }, [todos, startStr, endStr])

  const activeDays = days.filter(
    (ds) => (eventsByDate[ds]?.length ?? 0) + (todosByDate[ds]?.length ?? 0) > 0,
  )

  if (activeDays.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <CalendarDays className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">No events in the next 30 days</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {activeDays.map((ds) => {
        const d = new Date(ds)
        const isToday = ds === today
        const evs = eventsByDate[ds] ?? []
        const tds = todosByDate[ds] ?? []
        return (
          <div key={ds} className="flex gap-4">
            {/* Date label */}
            <div className="w-20 shrink-0 pt-1 text-right">
              <p
                className={cn(
                  "text-xs font-semibold",
                  isToday ? "text-primary" : "text-foreground",
                )}
              >
                {DAYS[d.getDay()]}
              </p>
              <p
                className={cn(
                  "text-[10px]",
                  isToday ? "text-primary" : "text-muted-foreground",
                )}
              >
                {MONTHS[d.getMonth()].slice(0, 3)} {d.getDate()}
              </p>
              {isToday && (
                <span className="text-[9px] px-1 rounded-full bg-primary/10 text-primary">
                  Today
                </span>
              )}
            </div>

            {/* Items */}
            <div className="flex-1 space-y-1.5 border-l border-border/40 pl-4">
              {evs.map((ev) => (
                <button
                  key={`ev-${ev.id}-${ev.instanceDate}`}
                  onClick={() => onEditEvent(ev)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl border border-border/50 bg-card/40 hover:bg-secondary/20 transition-colors text-left"
                >
                  <div
                    className="w-1 h-8 rounded-full shrink-0 mt-0.5"
                    style={{ backgroundColor: ev.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{ev.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatTime(ev.startTime)}–{formatTime(ev.endTime)}
                      {ev.description && ` · ${ev.description}`}
                    </p>
                  </div>
                  {ev.isRecurringInstance && (
                    <span className="text-[9px] text-muted-foreground border border-border/50 px-1.5 py-0.5 rounded-full shrink-0">
                      recurring
                    </span>
                  )}
                </button>
              ))}
              {tds.map((td) => {
                const ps = priorityStyle(td.priority)
                return (
                  <div
                    key={`td-${td.id}`}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-colors",
                      ps.bg,
                    )}
                  >
                    <button
                      onClick={() => onToggleTodo(td)}
                      className={cn(
                        "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
                        "border-border hover:border-primary",
                      )}
                    >
                      {td.completed && <Check className="h-2.5 w-2.5" />}
                    </button>
                    <button
                      className="flex-1 text-left min-w-0"
                      onClick={() => onEditTodo(td)}
                    >
                      <p className="text-sm font-medium text-foreground truncate">{td.title}</p>
                      {td.dueTime && (
                        <p className="text-[10px] text-muted-foreground">
                          {formatTime(td.dueTime)}
                          {td.estimatedMinutes ? ` · ${td.estimatedMinutes}m` : ""}
                        </p>
                      )}
                    </button>
                    <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0", ps.bg, ps.text)}>
                      {td.priority}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Now line ───────────────────────────────────────── */

function NowLine({ offsetLeft = 0 }: { offsetLeft?: number }) {
  const [top, setTop] = useState(() =>
    timeToHours(new Date().toTimeString().slice(0, 5)) * ROW_H,
  )

  useEffect(() => {
    const id = setInterval(() => {
      setTop(timeToHours(new Date().toTimeString().slice(0, 5)) * ROW_H)
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      className="absolute right-0 z-20 pointer-events-none"
      style={{ top, left: offsetLeft }}
    >
      <div className="h-px bg-red-500 relative">
        <span className="absolute -left-1 -top-1.5 h-2.5 w-2.5 rounded-full bg-red-500 shadow" />
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   EVENT CHIP
══════════════════════════════════════════════════════ */

function EventChip({
  event, compact, style, onClick,
}: {
  event: CalendarEvent | ExpandedInstance
  compact?: boolean
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
}) {
  const ev = event as ExpandedInstance
  const duration = timeToHours(ev.endTime) - timeToHours(ev.startTime)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: ev.id, duration }))
    e.dataTransfer.effectAllowed = 'move'
  }

  if (compact) {
    return (
      <button
        onClick={onClick}
        className="w-full flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded truncate text-white font-medium hover:brightness-110 transition-all text-left"
        style={{ backgroundColor: ev.color }}
       data-telemetry="calendar:click">
        <span className="opacity-80 shrink-0">{formatTime(ev.startTime)}</span>
        <span className="truncate">{ev.title}</span>
      </button>
    )
  }

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={onClick}
      className={cn(
        "absolute rounded-lg px-2 py-1 text-white cursor-grab overflow-hidden hover:brightness-110 hover:shadow-lg transition-all z-10 active:cursor-grabbing",
        duration < 0.5 ? "flex items-center gap-1.5" : "flex flex-col",
      )}
      style={{ ...style, backgroundColor: ev.color }}
    >
      <p
        className={cn(
          "font-semibold leading-tight truncate",
          duration < 0.5 ? "text-[10px]" : "text-[11px]",
        )}
      >
        {ev.title}
      </p>
      {duration >= 0.25 && (
        <p className="text-[9px] opacity-80 leading-tight shrink-0">
          {formatTime(ev.startTime)}–{formatTime(ev.endTime)}
        </p>
      )}
      {duration >= 1 && ev.description && (
        <p className="text-[9px] opacity-60 leading-tight mt-0.5 line-clamp-1">
          {ev.description}
        </p>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   TODO CHIP
══════════════════════════════════════════════════════ */

function TodoChip({
  todo, compact, style, onClick, onToggle,
}: {
  todo: TodoItem
  compact?: boolean
  style?: React.CSSProperties
  onClick?: (e: React.MouseEvent) => void
  onToggle?: () => void
}) {
  const ps = priorityStyle(todo.priority)

  if (compact) {
    return (
      <button
        onClick={onClick}
        className={cn(
          "w-full flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded truncate border-l-2 text-left hover:opacity-80 transition-opacity",
          ps.bg,
        )}
        style={{ borderLeftColor: ps.dot }}
       data-telemetry="calendar:click">
        {todo.dueTime && (
          <span className="text-muted-foreground shrink-0">{formatTime(todo.dueTime)}</span>
        )}
        <span className="truncate">{todo.title}</span>
      </button>
    )
  }

  return (
    <div
      className={cn(
        "absolute rounded-lg px-2 py-1 cursor-pointer overflow-hidden border-l-[3px] transition-all z-10 hover:shadow-md",
        ps.bg,
      )}
      style={{ ...style, borderLeftColor: ps.dot }}
      onClick={onClick}
    >
      <div className="flex items-start gap-1.5">
        {onToggle && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onToggle()
            }}
            className="w-3 h-3 rounded border border-border shrink-0 mt-0.5 flex items-center justify-center hover:border-primary transition-colors"
          >
            {todo.completed && <Check className="h-2 w-2" />}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold leading-tight truncate">{todo.title}</p>
          {todo.dueTime && (
            <p className="text-[9px] text-muted-foreground leading-tight">
              {formatTime(todo.dueTime)}
              {todo.estimatedMinutes ? ` · ${todo.estimatedMinutes}m` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   EVENT DIALOG
══════════════════════════════════════════════════════ */

function EventDialog({
  open, onOpenChange, editingEvent, selectedDate, form, setForm, onSave, onDelete,
  notificationEnabled, onToggleNotification,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editingEvent: CalendarEvent | null
  selectedDate: string
  form: EventForm
  setForm: (f: EventForm) => void
  onSave: () => void
  onDelete: () => void
  notificationEnabled?: boolean
  onToggleNotification?: (enabled: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editingEvent ? "Edit event" : "New event"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Date badge */}
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/20 px-3 py-1.5 rounded-lg border border-border/40">
            <CalendarDays className="h-3.5 w-3.5" />
            {selectedDate}
          </div>

          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Event title"
            className="text-sm font-medium"
            autoFocus
          />

          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Add description…"
            className="text-sm min-h-[60px]"
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                Start
              </label>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-xs rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                End
              </label>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-xs rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
              Color
            </label>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-all",
                    form.color === c
                      ? "border-foreground scale-110 ring-2 ring-primary/20"
                      : "border-transparent hover:scale-105",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Recurrence */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
              Repeat
            </label>
            <select
              value={form.recurring}
              onChange={(e) => setForm({ ...form, recurring: e.target.value })}
              className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-xs rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
            >
              <option value="none">Does not repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {form.recurring !== "none" && (
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                Repeat until (optional)
              </label>
              <input
                type="date"
                value={form.recurringEnd}
                onChange={(e) => setForm({ ...form, recurringEnd: e.target.value })}
                className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-xs rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          )}

          {editingEvent && (
            <button
              onClick={() => exportEventIcs(editingEvent)}
              className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
            >
              <Share2 className="h-3 w-3" /> Export as ICS
            </button>
          )}

          {editingEvent && onToggleNotification && (
            <div className="flex items-center justify-between pt-1 border-t border-border/30">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Bell className="h-3 w-3" />
                Notify me before this event
              </span>
              <button
                onClick={() => onToggleNotification(!notificationEnabled)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                  notificationEnabled ? "bg-primary" : "bg-border/50",
                )}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm",
                    notificationEnabled ? "translate-x-[18px]" : "translate-x-[2px]",
                  )}
                />
              </button>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {editingEvent && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="text-red-600 border-red-500/30 hover:bg-red-500/10 mr-auto"
             data-telemetry="calendar:delete">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={!form.title.trim()} data-telemetry="calendar:save">
            {editingEvent ? "Save changes" : "Create event"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ══════════════════════════════════════════════════════
   TODO DIALOG
══════════════════════════════════════════════════════ */

function TodoDialog({
  open, onOpenChange, editingTodo, form, setForm, onSave, onDelete,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  editingTodo: TodoItem | null
  form: TodoForm
  setForm: (f: TodoForm) => void
  onSave: () => void
  onDelete: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-base">
            {editingTodo ? "Edit task" : "New task"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Task title"
            className="text-sm font-medium"
            autoFocus
          />
          <Textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Description (optional)"
            className="text-sm min-h-[60px]"
          />

          {/* Priority */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
              Priority
            </label>
            <div className="flex gap-1.5">
              {(["high", "medium", "low"] as const).map((p) => {
                const active = form.priority === p
                const cls =
                  p === "high"
                    ? "bg-red-500/10 border-red-500/30 text-red-600"
                    : p === "medium"
                      ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
                      : "bg-green-500/10 border-green-500/30 text-green-600"
                return (
                  <button
                    key={p}
                    onClick={() => setForm({ ...form, priority: p })}
                    className={cn(
                      "flex-1 px-2.5 py-1.5 text-xs rounded-lg border font-medium capitalize transition-all",
                      active ? cls : "border-border/50 text-muted-foreground hover:border-border",
                    )}
                  >
                    {p === "high" && <ArrowUp className="h-3 w-3 inline mr-1" />}
                    {p === "low" && <ArrowDown className="h-3 w-3 inline mr-1" />}
                    {p.charAt(0).toUpperCase() + p.slice(1)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                Due date
              </label>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-xs rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                Time
              </label>
              <input
                type="time"
                value={form.dueTime}
                onChange={(e) => setForm({ ...form, dueTime: e.target.value })}
                className="w-full border border-border/60 bg-background px-2.5 py-1.5 text-xs rounded-lg outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 transition-all"
              />
            </div>
          </div>

          {/* Estimated time */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
              Estimated time (min)
            </label>
            <Input
              type="number"
              min={0}
              value={form.estimatedMinutes}
              onChange={(e) =>
                setForm({ ...form, estimatedMinutes: Math.max(0, Number(e.target.value)) })
              }
              className="text-sm"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
              Category
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {TODO_CATEGORIES.map((c) => {
                const active = form.category === c.value
                const cls =
                  c.value === "freetime"
                    ? "bg-green-500/10 border-green-500/30 text-green-600"
                    : c.value === "work"
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-600"
                      : c.value === "personal"
                        ? "bg-purple-500/10 border-purple-500/30 text-purple-600"
                        : c.value === "study"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-600"
                          : "bg-primary/10 border-primary/30 text-primary"
                return (
                  <button
                    key={c.value}
                    onClick={() => setForm({ ...form, category: c.value })}
                    className={cn(
                      "px-2.5 py-1 text-[10px] rounded-lg border font-medium transition-colors",
                      active ? cls : "border-border/50 text-muted-foreground hover:border-border",
                    )}
                  >
                    {c.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {editingTodo && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="text-red-600 border-red-500/30 hover:bg-red-500/10 mr-auto"
             data-telemetry="calendar:delete">
              <Trash2 className="h-3 w-3 mr-1" /> Delete
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={onSave} disabled={!form.title.trim()} data-telemetry="calendar:save">
            {editingTodo ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ══════════════════════════════════════════════════════
   SETTINGS DIALOG
══════════════════════════════════════════════════════ */

function SettingsDialog({
  open, onOpenChange, settings, onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  settings: CalendarSettings
  onSave: (s: CalendarSettings) => void
}) {
  const [local, setLocal] = useState<CalendarSettings>(settings)

  // Reset local state when dialog opens
  useEffect(() => {
    if (open) setLocal(settings)
  }, [open, settings])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm overflow-y-auto max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-base">Calendar settings</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Working hours */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
              Working hours
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={23}
                value={local.workStart}
                onChange={(e) =>
                  setLocal({ ...local, workStart: Number(e.target.value) })
                }
                className="w-16 border border-border/60 bg-background px-2 py-1.5 text-xs rounded-lg outline-none focus:border-primary text-center"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="number"
                min={1}
                max={24}
                value={local.workEnd}
                onChange={(e) =>
                  setLocal({ ...local, workEnd: Number(e.target.value) })
                }
                className="w-16 border border-border/60 bg-background px-2 py-1.5 text-xs rounded-lg outline-none focus:border-primary text-center"
              />
            </div>
          </div>

          {/* Working days */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
              Working days
            </label>
            <div className="flex gap-1.5">
              {DAYS.map((d, i) => (
                <button
                  key={d}
                  onClick={() => {
                    const next = local.workDays.includes(i)
                      ? local.workDays.filter((x) => x !== i)
                      : [...local.workDays, i].sort()
                    setLocal({ ...local, workDays: next })
                  }}
                  className={cn(
                    "w-8 h-8 text-[10px] font-medium rounded-lg border transition-colors",
                    local.workDays.includes(i)
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "border-border/50 text-muted-foreground",
                  )}
                >
                  {d.charAt(0)}
                </button>
              ))}
            </div>
          </div>

          {/* Breaks */}
          <div>
            <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
              Breaks
            </label>
            <div className="space-y-1.5">
              {local.breaks.map((br, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={br.start}
                    onChange={(e) => {
                      const b = [...local.breaks]
                      b[i] = { ...b[i], start: Number(e.target.value) }
                      setLocal({ ...local, breaks: b })
                    }}
                    className="w-14 border border-border/60 bg-background px-2 py-1 text-xs rounded-lg outline-none focus:border-primary text-center"
                  />
                  <span className="text-[10px] text-muted-foreground">–</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={br.end}
                    onChange={(e) => {
                      const b = [...local.breaks]
                      b[i] = { ...b[i], end: Number(e.target.value) }
                      setLocal({ ...local, breaks: b })
                    }}
                    className="w-14 border border-border/60 bg-background px-2 py-1 text-xs rounded-lg outline-none focus:border-primary text-center"
                  />
                  <button
                    onClick={() =>
                      setLocal({
                        ...local,
                        breaks: local.breaks.filter((_, j) => j !== i),
                      })
                    }
                    className="p-0.5 rounded text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setLocal({
                    ...local,
                    breaks: [...local.breaks, { start: 12, end: 13 }],
                  })
                }
                className="text-[10px] text-primary hover:underline flex items-center gap-1"
              >
                <Plus className="h-3 w-3" /> Add break
              </button>
            </div>
          </div>

          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Auto-schedule fills free slots within working hours (excluding
            breaks). Tasks categorised as &quot;Free Time&quot; are placed in break
            slots first.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(local)}
          >
            Save settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ══════════════════════════════════════════════════════
   TODO VIEW
══════════════════════════════════════════════════════ */

function TodoView({
  todos, today, weekStart, weekEnd, onTodosChange, aiPlanning, aiSuggestion, onAiPlan,
}: {
  todos: TodoItem[]
  today: string
  weekStart: string
  weekEnd: string
  onTodosChange: () => void
  aiPlanning: boolean
  aiSuggestion: string
  onAiPlan: () => void
}) {
  const [filter, setFilter] = useState<"all" | "week" | "overdue" | "nodate">("all")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTodo, setEditTodo] = useState<TodoItem | null>(null)
  const [form, setForm] = useState<TodoForm>(defaultTodoForm())
  const [newTodoTitle, setNewTodoTitle] = useState("")
  const [applyingPlan, setApplyingPlan] = useState(false)

  const DAY_LABELS = DAYS

  const weekDays = useMemo(() => {
    const out: { label: string; date: string }[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(d.getDate() + i)
      out.push({ label: DAY_LABELS[d.getDay()], date: toDateStr(d) })
    }
    return out
  }, [weekStart])

  const todosThisWeek = todos.filter(
    (t) => !t.completed && t.dueDate >= weekStart && t.dueDate < weekEnd,
  )
  const todosOverdue = todos.filter(
    (t) => !t.completed && t.dueDate && t.dueDate < today,
  )
  const unplanned = todos.filter((t) => !t.completed && !t.dueDate)
  const completed = todos.filter((t) => t.completed)
  const incomplete = todos.filter((t) => !t.completed)

  const openNew = () => {
    setEditTodo(null)
    setForm(defaultTodoForm())
    setDialogOpen(true)
  }

  const openEdit = (td: TodoItem) => {
    setEditTodo(td)
    setForm({
      title: td.title,
      description: td.description,
      priority: td.priority,
      dueDate: td.dueDate ?? "",
      dueTime: td.dueTime ?? "",
      estimatedMinutes: td.estimatedMinutes ?? 30,
      category: td.category ?? "general",
    })
    setDialogOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) return
    try {
      if (editTodo) {
        await apiFetch(
          API_ENDPOINTS.calendarTodo.replace(":id", String(editTodo.id)),
          { method: "PUT", body: JSON.stringify(form) },
        )
      } else {
        await apiFetch(API_ENDPOINTS.calendarTodos, {
          method: "POST",
          body: JSON.stringify(form),
        })
      }
      setDialogOpen(false)
      onTodosChange()
    } catch { /* ignore */ }
  }

  const remove = async (td: TodoItem) => {
    try {
      await apiFetch(
        API_ENDPOINTS.calendarTodo.replace(":id", String(td.id)),
        { method: "DELETE" },
      )
      onTodosChange()
    } catch { /* ignore */ }
  }

  const toggle = async (td: TodoItem) => {
    try {
      await apiFetch(
        API_ENDPOINTS.calendarTodoToggle.replace(":id", String(td.id)),
        { method: "PUT" },
      )
      onTodosChange()
    } catch { /* ignore */ }
  }

  const quickAdd = async () => {
    if (!newTodoTitle.trim()) return
    try {
      await apiFetch(API_ENDPOINTS.calendarTodos, {
        method: "POST",
        body: JSON.stringify({ title: newTodoTitle.trim(), priority: "medium" }),
      })
      setNewTodoTitle("")
      onTodosChange()
    } catch { /* ignore */ }
  }

  const applyAiPlan = async () => {
    if (!aiSuggestion || aiSuggestion.includes("Failed")) return
    setApplyingPlan(true)
    try {
      const lines = aiSuggestion
        .split("\n")
        .filter((l) => l.trim().match(/^[-*]\s/))
      for (const line of lines) {
        const title = line.replace(/^[-*]\s*/, "").trim()
        if (title.length > 3) {
          await apiFetch(API_ENDPOINTS.calendarTodos, {
            method: "POST",
            body: JSON.stringify({ title, priority: "medium" }),
          })
        }
      }
      onTodosChange()
    } catch { /* ignore */ }
    setApplyingPlan(false)
  }

  const selectedTodos =
    filter === "week"
      ? todosThisWeek
      : filter === "overdue"
        ? todosOverdue
        : filter === "nodate"
          ? unplanned
          : incomplete

  const tabs = [
    { key: "all" as const, label: "All", count: incomplete.length },
    { key: "week" as const, label: "This Week", count: todosThisWeek.length },
    { key: "overdue" as const, label: "Overdue", count: todosOverdue.length },
    { key: "nodate" as const, label: "No Date", count: unplanned.length },
  ]

  return (
    <div className="flex-1 min-w-0 p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        {/* Quick add + stats */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 bg-secondary/30 border border-border/60 rounded-lg px-3 py-1.5 w-full sm:w-72">
              <Input
                value={newTodoTitle}
                onChange={(e) => setNewTodoTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && quickAdd()}
                placeholder="Quick add task…"
                className="border-0 bg-transparent text-xs p-0 h-7 focus-visible:ring-0 placeholder:text-muted-foreground/50"
              />
              <button
                onClick={quickAdd}
                disabled={!newTodoTitle.trim()}
                className="p-1 text-primary hover:text-primary/80 disabled:text-muted-foreground/30 transition-colors"
               data-telemetry="calendar:quickadd">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span>{incomplete.length} open</span>
            <span className="text-muted-foreground/40">·</span>
            <span>{completed.length} done</span>
          </div>
        </div>

        {/* AI suggestion */}
        {aiSuggestion && (
          <div className="p-4 rounded-xl border border-primary/20 bg-primary/[0.04]">
            <div className="flex items-start gap-3">
              <Bot className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <p className="flex-1 text-xs text-foreground/80 whitespace-pre-wrap leading-relaxed min-w-0">
                {aiSuggestion}
              </p>
            </div>
            {!aiSuggestion.includes("Failed") && (
              <div className="flex justify-end mt-3">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={applyAiPlan}
                  disabled={applyingPlan}
                  className="text-xs gap-1"
                 data-telemetry="calendar:applyaiplan">
                  {applyingPlan ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Check className="h-3 w-3" />
                  )}
                  Save as tasks
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex items-center gap-0 border-b border-border/40">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={cn(
                "px-3 py-2 text-xs font-medium transition-colors relative",
                filter === tab.key
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
                tab.count === 0 && filter !== tab.key && "opacity-40",
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1 text-[10px] opacity-70">({tab.count})</span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            onClick={openNew}
            className="text-xs gap-1 h-7 mb-1"
           data-telemetry="calendar:opennew">
            <Plus className="h-3 w-3" /> New Task
          </Button>
        </div>

        {/* Week grid */}
        {filter === "week" ? (
          <div className="grid grid-cols-7 gap-2">
            {weekDays.map((wd) => {
              const dayTodos = todosThisWeek.filter((t) => t.dueDate === wd.date)
              const isToday = wd.date === today
              return (
                <div
                  key={wd.date}
                  className={cn(
                    "rounded-xl border min-h-[120px] p-2",
                    isToday
                      ? "border-primary/30 bg-primary/[0.03]"
                      : "border-border/50 bg-card/30",
                  )}
                >
                  <div
                    className={cn(
                      "text-[10px] font-medium text-center mb-2 pb-1.5 border-b border-border/30",
                      isToday ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {wd.label}{" "}
                    <span className={cn(isToday && "font-bold")}>
                      {wd.date.split("-")[2]}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayTodos.map((td) => {
                      const ps = priorityStyle(td.priority)
                      return (
                        <div
                          key={td.id}
                          onClick={() => openEdit(td)}
                          className="cursor-pointer text-[10px] px-1.5 py-1 rounded-lg border bg-background/50 hover:bg-secondary/30 border-border/40 transition-colors"
                        >
                          <div className="flex items-start gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggle(td)
                              }}
                              className={cn(
                                "w-3.5 h-3.5 rounded border shrink-0 mt-px flex items-center justify-center transition-colors",
                                td.completed
                                  ? "bg-green-500 border-green-500 text-white"
                                  : "border-border hover:border-primary",
                              )}
                            >
                              {td.completed && <Check className="h-2 w-2" />}
                            </button>
                            <span
                              className={cn(
                                "flex-1 truncate",
                                td.completed && "line-through text-muted-foreground",
                              )}
                            >
                              {td.title}
                            </span>
                            <div
                              className="w-1.5 h-1.5 rounded-full shrink-0 mt-1"
                              style={{ backgroundColor: ps.dot }}
                            />
                          </div>
                        </div>
                      )
                    })}
                    {dayTodos.length === 0 && (
                      <p className="text-[9px] text-muted-foreground/50 text-center pt-2">
                        —
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="space-y-1.5">
            {selectedTodos.length === 0 && (
              <div className="text-center py-16 border border-dashed border-border/50 rounded-xl">
                <ListTodo className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                <p className="text-xs text-muted-foreground">
                  {filter === "nodate"
                    ? "All tasks have due dates!"
                    : filter === "overdue"
                      ? "No overdue tasks 🎉"
                      : "No tasks here."}
                </p>
              </div>
            )}
            {selectedTodos.map((td) => {
              const ps = priorityStyle(td.priority)
              const isOverdue = !td.completed && td.dueDate && td.dueDate < today
              return (
                <div
                  key={td.id}
                  onClick={() => openEdit(td)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card/30 hover:bg-secondary/20 transition-colors cursor-pointer group"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(td)
                    }}
                    className={cn(
                      "w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors",
                      td.completed
                        ? "bg-green-500 border-green-500 text-white"
                        : "border-border hover:border-primary",
                    )}
                  >
                    {td.completed && <Check className="h-2.5 w-2.5" />}
                  </button>

                  <div className="flex-1 min-w-0">
                    <p
                      className={cn(
                        "text-sm truncate",
                        td.completed && "line-through text-muted-foreground",
                      )}
                    >
                      {td.title}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {td.dueDate && (
                        <span
                          className={cn(
                            "text-[10px]",
                            isOverdue ? "text-red-500" : "text-muted-foreground",
                          )}
                        >
                          {isOverdue && (
                            <AlertCircle className="h-2.5 w-2.5 inline mr-0.5" />
                          )}
                          {td.dueDate}
                          {td.dueTime ? ` ${formatTime(td.dueTime)}` : ""}
                        </span>
                      )}
                      {td.estimatedMinutes > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          {td.estimatedMinutes}m
                        </span>
                      )}
                      {td.category && td.category !== "general" && (
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {td.category}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded border",
                        ps.bg,
                        ps.text,
                      )}
                    >
                      {td.priority}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Completed section */}
        {filter === "all" && completed.length > 0 && (
          <details className="group">
            <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors list-none flex items-center gap-1.5 py-2">
              <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
              {completed.length} completed
            </summary>
            <div className="space-y-1.5 mt-2">
              {completed.map((td) => (
                <div
                  key={td.id}
                  onClick={() => openEdit(td)}
                  className="flex items-center gap-3 p-3 rounded-xl border border-border/30 bg-card/10 hover:bg-secondary/10 transition-colors cursor-pointer opacity-60"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(td)
                    }}
                    className="w-4 h-4 rounded border shrink-0 flex items-center justify-center bg-green-500 border-green-500 text-white"
                  >
                    <Check className="h-2.5 w-2.5" />
                  </button>
                  <p className="flex-1 text-sm line-through text-muted-foreground truncate">
                    {td.title}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Local todo dialog */}
      <TodoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editingTodo={editTodo}
        form={form}
        setForm={setForm}
        onSave={save}
        onDelete={async () => {
          if (editTodo) await remove(editTodo)
          setDialogOpen(false)
        }}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════
   BOOKINGS VIEW
══════════════════════════════════════════════════════ */

// Fix: remove unused `events` prop from signature
function BookingsView({ onEventsChange }: { onEventsChange: () => void }) {
  const [schedules, setSchedules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editSchedule, setEditSchedule] = useState<any | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null)

  const blankForm = () => ({
    name: "",
    description: "",
    slotDuration: 60,
    bufferMinutes: 0,
    availableStartTime: "09:00",
    availableEndTime: "17:00",
    availableDays: [1, 2, 3, 4, 5],
    bookingStartDate: "",
    bookingEndDate: "",
    maxCapacity: 1,
    color: "#8b5cf6",
    bookingFields: [
      { key: "name", label: "Your name", required: true, type: "text" },
      { key: "email", label: "Your email", required: true, type: "email" },
      { key: "message", label: "Message (optional)", required: false, type: "textarea" },
    ],
  })

  const [form, setForm] = useState<any>(blankForm())

  const load = async () => {
    setLoading(true)
    try {
      const data = await apiFetch(API_ENDPOINTS.availabilitySchedules)
      setSchedules(data ?? [])
    } catch {
      setSchedules([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    if (!form.name.trim()) return
    try {
      if (editSchedule) {
        await apiFetch(
          API_ENDPOINTS.availabilitySchedule.replace(":id", String(editSchedule.id)),
          { method: "PUT", body: JSON.stringify(form) },
        )
      } else {
        await apiFetch(API_ENDPOINTS.availabilitySchedules, {
          method: "POST",
          body: JSON.stringify(form),
        })
      }
      setDialogOpen(false)
      setEditSchedule(null)
      load()
    } catch { /* ignore */ }
  }

  const del = async (id: number) => {
    setDeletingId(id)
    try {
      await apiFetch(
        API_ENDPOINTS.availabilitySchedule.replace(":id", String(id)),
        { method: "DELETE" },
      )
      load()
    } catch { /* ignore */ } finally {
      setDeletingId(null)
    }
  }

  const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"]

  return (
    <div className="flex-1 min-w-0 p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Availability Schedules
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Create a schedule and share the booking link with your clients.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => {
              setEditSchedule(null)
              setForm(blankForm())
              setDialogOpen(true)
            }}
            className="text-xs gap-1"
          >
            <Plus className="h-3 w-3" /> New Schedule
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : schedules.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-border/50 rounded-xl">
            <Clock className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
            <p className="text-xs text-muted-foreground">
              No schedules yet. Create one to get a shareable booking link.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {schedules.map((s: any) => {
              const link = `${typeof window !== "undefined" ? window.location.origin : ""}/calendar/book/avail-${s.slug}`
              return (
                <div
                  key={s.id}
                  className="rounded-xl border border-border/50 bg-card/30 overflow-hidden"
                >
                  <div className="flex items-stretch">
                    <div
                      className="w-1 shrink-0"
                      style={{ backgroundColor: s.color ?? "#8b5cf6" }}
                    />
                    <div className="flex-1 flex items-center gap-4 p-4 min-w-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{s.name}</p>
                        {s.description && (
                          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                            {s.description}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground flex-wrap">
                          <span>{s.slotDuration}min slots</span>
                          <span className="opacity-40">·</span>
                          <span>
                            {s.availableStartTime?.slice(0, 5)}–
                            {s.availableEndTime?.slice(0, 5)}
                          </span>
                          <span className="opacity-40">·</span>
                          <span>Max {s.maxCapacity ?? 1}/slot</span>
                          {s.bookingEndDate && (
                            <>
                              <span className="opacity-40">·</span>
                              <span>Until {s.bookingEndDate}</span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(link)
                            setCopiedSlug(s.slug)
                            setTimeout(() => setCopiedSlug(null), 1500)
                          }}
                          className={cn(
                            "text-[10px] px-2.5 py-1.5 rounded-lg border transition-colors",
                            copiedSlug === s.slug
                              ? "border-green-500/30 text-green-600 bg-green-500/10"
                              : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary",
                          )}
                        >
                          {copiedSlug === s.slug ? "Copied!" : "Copy link"}
                        </button>
                        <button
                          onClick={() => {
                            setEditSchedule(s)
                            setForm({
                              name: s.name,
                              description: s.description ?? "",
                              slotDuration: s.slotDuration ?? 60,
                              bufferMinutes: s.bufferMinutes ?? 0,
                              availableStartTime: s.availableStartTime ?? "09:00",
                              availableEndTime: s.availableEndTime ?? "17:00",
                              availableDays: s.availableDays ?? [1, 2, 3, 4, 5],
                              bookingStartDate: s.bookingStartDate ?? "",
                              bookingEndDate: s.bookingEndDate ?? "",
                              maxCapacity: s.maxCapacity ?? 1,
                              color: s.color ?? "#8b5cf6",
                              bookingFields: s.bookingFields ?? blankForm().bookingFields,
                            })
                            setDialogOpen(true)
                          }}
                          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Settings className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => del(s.id)}
                          disabled={deletingId === s.id}
                          className="p-1.5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          {deletingId === s.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Schedule dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="overflow-y-auto max-h-[85vh] sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="text-base">
                {editSchedule ? "Edit Schedule" : "New Schedule"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                  Name *
                </label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. 30-min Consultation"
                  className="text-sm"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                  Description
                </label>
                <Input
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="What is this booking for?"
                  className="text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Slot duration (min)
                  </label>
                  <Input
                    type="number"
                    min={5}
                    value={form.slotDuration}
                    onChange={(e) =>
                      setForm({ ...form, slotDuration: Number(e.target.value) || 60 })
                    }
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Buffer between (min)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={form.bufferMinutes}
                    onChange={(e) =>
                      setForm({ ...form, bufferMinutes: Number(e.target.value) || 0 })
                    }
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Available from
                  </label>
                  <Input
                    type="time"
                    value={form.availableStartTime}
                    onChange={(e) =>
                      setForm({ ...form, availableStartTime: e.target.value })
                    }
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Until
                  </label>
                  <Input
                    type="time"
                    value={form.availableEndTime}
                    onChange={(e) =>
                      setForm({ ...form, availableEndTime: e.target.value })
                    }
                    className="text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
                  Available days
                </label>
                <div className="flex gap-1">
                  {DAY_SHORT.map((dl, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const d = form.availableDays.includes(i)
                          ? form.availableDays.filter((x: number) => x !== i)
                          : [...form.availableDays, i].sort()
                        setForm({ ...form, availableDays: d })
                      }}
                      className={cn(
                        "h-7 w-7 text-[10px] rounded-lg transition-colors font-medium border",
                        form.availableDays.includes(i)
                          ? "bg-primary/20 text-primary border-primary/30"
                          : "bg-muted/30 text-muted-foreground border-border/50",
                      )}
                    >
                      {dl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Booking window start
                  </label>
                  <Input
                    type="date"
                    value={form.bookingStartDate}
                    onChange={(e) =>
                      setForm({ ...form, bookingStartDate: e.target.value })
                    }
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Booking window end
                  </label>
                  <Input
                    type="date"
                    value={form.bookingEndDate}
                    onChange={(e) =>
                      setForm({ ...form, bookingEndDate: e.target.value })
                    }
                    className="text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Max per slot
                  </label>
                  <Input
                    type="number"
                    min={1}
                    value={form.maxCapacity}
                    onChange={(e) =>
                      setForm({ ...form, maxCapacity: Number(e.target.value) || 1 })
                    }
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground mb-1 block font-medium">
                    Color
                  </label>
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    className="h-8 w-full rounded-lg border border-border/50 bg-transparent cursor-pointer"
                  />
                </div>
              </div>

              {/* Booking form fields */}
              <div>
                <label className="text-[10px] text-muted-foreground mb-1.5 block font-medium">
                  Booking form fields
                </label>
                <div className="space-y-1.5">
                  {(form.bookingFields ?? []).map((f: any, i: number) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <Input
                        value={f.label}
                        onChange={(e) => {
                          const nf = [...form.bookingFields]
                          nf[i] = { ...nf[i], label: e.target.value }
                          setForm({ ...form, bookingFields: nf })
                        }}
                        className="text-[10px] h-7 flex-1"
                        placeholder="Field label"
                      />
                      <button
                        onClick={() =>
                          setForm({
                            ...form,
                            bookingFields: form.bookingFields.filter(
                              (_: any, j: number) => j !== i,
                            ),
                          })
                        }
                        className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() =>
                      setForm({
                        ...form,
                        bookingFields: [
                          ...(form.bookingFields ?? []),
                          { key: `field_${Date.now()}`, label: "", required: false, type: "text" },
                        ],
                      })
                    }
                    className="text-[10px] text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Add field
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button size="sm" onClick={save} disabled={!form.name.trim()} data-telemetry="calendar:save">
                {editSchedule ? "Save changes" : "Create schedule"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}