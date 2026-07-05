"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { apiFetch } from "@/lib/api-client"
import { API_ENDPOINTS } from "@/lib/panel-config"
import { CheckCircle, Clock, Loader2, Users, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"

interface BookingField {
  key: string
  label: string
  required: boolean
  type: string
}

interface BookingEvent {
  id: number
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
  bookingType: string
  maxCapacity: number
  bookingCount: number
  bookingFields: BookingField[] | null
  availableStartTime?: string
  availableEndTime?: string
  slotDuration?: number
  bufferMinutes?: number
  availableDays?: number[]
  bookingStartDate?: string
  bookingEndDate?: string
  name?: string
  slug?: string
  color?: string
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

export default function BookingPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const isSchedule = typeof id === "string" && id.startsWith("avail-")
  const scheduleSlug = isSchedule ? (id as string).replace("avail-", "") : null

  const [ev, setEv] = useState<BookingEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState("")
  const [fields, setFields] = useState<BookingField[]>([])
  const [values, setValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState("")

  const [availableSlots, setAvailableSlots] = useState<Record<string, { time: string; endTime: string; available: boolean }[]>>({})
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState("")
  const [selectedSlot, setSelectedSlot] = useState("")
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth())
  const [calYear, setCalYear] = useState(() => new Date().getFullYear())

  const isAvailability = isSchedule || ev?.bookingType === "availability"
  const isRsvp = !isSchedule && ev?.bookingType === "rsvp"

  const loadEvent = () => {
    if (!id) return
    setLoading(true)
    setFetchError("")
    if (isSchedule && scheduleSlug) {
      apiFetch(API_ENDPOINTS.availabilitySchedulePublic.replace(":slug", scheduleSlug))
        .then((data: any) => {
          const mapped: BookingEvent = {
            id: data.id, title: data.name, description: data.description || "",
            date: "", startTime: "", endTime: "", bookingType: "availability",
            maxCapacity: data.maxCapacity ?? 1, bookingCount: data.bookingCount || 0,
            bookingFields: data.bookingFields, slug: data.slug, name: data.name, color: data.color,
            availableStartTime: data.availableStartTime, availableEndTime: data.availableEndTime,
            slotDuration: data.slotDuration, bufferMinutes: data.bufferMinutes,
            availableDays: data.availableDays, bookingStartDate: data.bookingStartDate, bookingEndDate: data.bookingEndDate,
          }
          setEv(mapped)
          const f = data.bookingFields && data.bookingFields.length > 0
            ? data.bookingFields
            : [
                { key: "name", label: "Your name", required: true, type: "text" },
                { key: "email", label: "Your email", required: true, type: "email" },
                { key: "message", label: "Message (optional)", required: false, type: "textarea" },
              ]
          setFields(f)
          setLoading(false)
        })
        .catch(() => { setLoading(false); setFetchError("Could not load this booking. The link may be invalid.") })
    } else {
      apiFetch(`${API_ENDPOINTS.calendarEvent.replace(":id", id as string)}?public=1&_=${Date.now()}`)
        .then((data: BookingEvent) => {
          setEv(data)
          const f = data.bookingFields && data.bookingFields.length > 0
            ? data.bookingFields
            : [
                { key: "name", label: "Your name", required: true, type: "text" },
                { key: "email", label: "Your email", required: true, type: "email" },
                { key: "message", label: "Message (optional)", required: false, type: "textarea" },
              ]
          setFields(f)
          setLoading(false)
        })
        .catch(() => { setLoading(false); setFetchError("Could not load this booking. The link may be invalid.") })
    }
  }

  useEffect(() => { loadEvent() }, [id])

  const loadAvailableSlots = async () => {
    if (!id || !isAvailability) return
    setSlotsLoading(true)
    try {
      if (isSchedule && scheduleSlug) {
        const data = await apiFetch(API_ENDPOINTS.availabilityScheduleSlots.replace(":slug", scheduleSlug))
        setAvailableSlots(data.slots || {})
        const dates = Object.keys(data.slots || {}).sort()
        const now = new Date()
        const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
        const firstAvail = dates.find((d) => d >= todayLocal && data.slots[d]?.some((s: any) => s.available))
        if (firstAvail) {
          setSelectedDate(firstAvail)
          const d = new Date(firstAvail + "T12:00:00")
          setCalMonth(d.getMonth())
          setCalYear(d.getFullYear())
        }
      } else {
        const data = await apiFetch(API_ENDPOINTS.calendarEventAvailableSlots.replace(":id", id as string))
        setAvailableSlots(data.slots || {})
        const dates = Object.keys(data.slots || {}).sort()
        const now = new Date()
        const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
        const firstAvail = dates.find((d) => d >= todayLocal && data.slots[d]?.some((s: any) => s.available))
        if (firstAvail) {
          setSelectedDate(firstAvail)
          const d = new Date(firstAvail + "T12:00:00")
          setCalMonth(d.getMonth())
          setCalYear(d.getFullYear())
        }
      }
    } catch (e: any) { console.error("[booking] failed to load slots:", e) }
    setSlotsLoading(false)
  }

  useEffect(() => {
    if (isAvailability && ev) loadAvailableSlots()
  }, [isAvailability, ev?.id])

  const book = async () => {
    for (const f of fields) {
      if (f.required && !values[f.key]?.trim()) {
        setError(`${f.label} is required`)
        return
      }
    }
    if (isAvailability && (!selectedDate || !selectedSlot)) {
      setError("Please select a date and time slot")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const body: any = { ...values }
      if (isAvailability) {
        body.slotDate = selectedDate
        body.slotTime = selectedSlot
      }
      if (isSchedule && scheduleSlug) {
        await apiFetch(API_ENDPOINTS.availabilityScheduleBook.replace(":slug", scheduleSlug), {
          method: "POST",
          body: JSON.stringify(body),
        })
      } else {
        await apiFetch(API_ENDPOINTS.calendarEventBook.replace(":id", id as string), {
          method: "POST",
          body: JSON.stringify(body),
        })
      }
      setDone(true)
    } catch (e: any) {
      setError(e?.message || "Submission failed. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-5 w-5 text-white/40 animate-spin" />
        <p className="text-sm text-white/40">Loading...</p>
      </div>
    </div>
  )

  if (fetchError) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="h-14 w-14 mx-auto rounded-full bg-red-500/10 flex items-center justify-center">
          <Clock className="h-6 w-6 text-red-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-flink font-bold text-white">Not found</h1>
          <p className="text-sm text-white/70">{fetchError}</p>
        </div>
        <div className="flex gap-3 justify-center">
          <button onClick={loadEvent} className="bg-white/40 px-5 py-2 rounded-full text-sm font-flink transition-colors hover:bg-white/65 text-white hover:text-black">Try again</button>
          <button onClick={() => router.push("/")} className="bg-white/40 px-5 py-2 rounded-full text-sm font-flink transition-colors hover:bg-white/65 text-white hover:text-black">Go home</button>
        </div>
      </div>
    </div>
  )

  if (!ev) return null

  const label = isRsvp ? "RSVP" : "booking"
  const remaining = ev.maxCapacity > 0 ? ev.maxCapacity - (ev.bookingCount || 0) : -1
  const isFull = remaining === 0

  if (!isSchedule && isFull && !isRsvp && !isAvailability) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="h-14 w-14 mx-auto rounded-full bg-amber-500/10 flex items-center justify-center">
          <Clock className="h-6 w-6 text-amber-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-flink font-bold text-white">Fully booked</h1>
          <p className="text-sm text-white/70">This time slot is no longer available.</p>
        </div>
        <button onClick={() => router.push("/")} className="bg-white/40 px-5 py-2 rounded-full text-sm font-flink transition-colors hover:bg-white/65 text-white hover:text-black">Go home</button>
      </div>
    </div>
  )

  if (done) return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="h-16 w-16 mx-auto rounded-full bg-green-500/10 flex items-center justify-center">
          <CheckCircle className="h-7 w-7 text-green-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-flink font-bold text-white">{isRsvp ? "You're in!" : "You're booked!"}</h1>
          <p className="text-sm text-white/60">{ev.title} &middot; {isAvailability ? `${selectedDate} at ${selectedSlot}` : ev.date}</p>
        </div>
        <div className="border border-white/20 px-4 py-3 text-xs text-white/60 space-y-1 text-left">
          {values.name && <p><span className="text-white/80">Name:</span> {values.name}</p>}
          {values.email && <p><span className="text-white/80">Email:</span> {values.email}</p>}
          {values.message && <p><span className="text-white/80">Message:</span> {values.message}</p>}
        </div>
        <p className="text-xs text-white/40">A confirmation has been sent to your email.</p>
        <button onClick={() => router.push("/")} className="bg-white px-5 py-2 rounded-full text-sm font-flink transition-colors hover:bg-white/65 text-black">Done</button>
      </div>
    </div>
  )

  const allAvailableDates = Object.entries(availableSlots)
    .filter(([, slots]) => slots.some((s) => s.available))
    .sort(([a], [b]) => a.localeCompare(b))
  const isThisMonthEmpty = () => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      if (availableSlots[dateStr]?.some((s) => s.available)) return false
    }
    return true
  }

  const renderCalendar = () => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
    const firstDay = new Date(calYear, calMonth, 1).getDay()
    const now = new Date()
    const todayLocal = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`

    const cells: React.ReactNode[] = []
    for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} />)
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      const slotsOnDate = availableSlots[dateStr] || []
      const hasSlots = slotsOnDate.some((s) => s.available)
      const isPast = dateStr < todayLocal
      const canSelect = hasSlots && !isPast
      cells.push(
        <button key={dateStr} disabled={!canSelect} onClick={() => { if (canSelect) { setSelectedDate(dateStr); setSelectedSlot("") } }}
          className={cn("h-9 text-xs rounded transition-colors font-medium relative",
            selectedDate === dateStr
              ? "bg-white text-black"
              : hasSlots && !isPast
                ? "bg-white/10 text-white hover:bg-white/20"
                : "text-white/20 cursor-not-allowed"
          )}>
          {d}
          {hasSlots && !isPast && (
            <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-white/60" />
          )}
        </button>
      )
    }
    return cells
  }

  const renderTimeSlots = () => {
    if (!selectedDate) return null
    const slots = availableSlots[selectedDate] || []
    if (slots.length === 0) return (
      <p className="text-xs text-white/30 italic py-8 text-center">No slots configured for this date</p>
    )
    const availableCount = slots.filter((s) => s.available).length
    if (availableCount === 0) return (
      <div className="text-center py-8">
        <p className="text-xs text-amber-400/60 italic">All slots booked for this date</p>
        <p className="text-[10px] text-white/30 mt-1">Try another date</p>
      </div>
    )
    return (
      <div className="grid grid-cols-2 gap-1.5 max-h-[200px] overflow-y-auto">
        {slots.map((s) => (
          <button key={s.time} disabled={!s.available} onClick={() => setSelectedSlot(s.time)}
            className={cn("text-[11px] px-3 py-2 rounded-full border transition-colors text-left",
              selectedSlot === s.time
                ? "bg-white text-black border-white"
                : s.available
                  ? "border-white/20 text-white/70 hover:border-white/40 hover:text-white"
                  : "border-white/5 text-white/20 cursor-not-allowed"
            )}>
            <span className="font-medium">{s.time}</span>
            <span className="ml-1 opacity-60">–{s.endTime}</span>
            {!s.available && <span className="block text-[9px] text-red-400/60">Booked</span>}
          </button>
        ))}
      </div>
    )
  }

  const canSubmit = !isAvailability || (selectedDate && selectedSlot)

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      <div className="px-6 sm:px-12 lg:px-40 py-10 sm:py-16 max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl sm:text-4xl lg:text-[3.2rem] font-flink font-bold text-white">{ev.title}</h1>
          {!isAvailability && (
            <p className="text-base text-white/70 mt-2">{ev.date}{ev.startTime ? `  ·  ${ev.startTime.slice(0, 5)}–${ev.endTime?.slice(0, 5)}` : ""}</p>
          )}
          {isSchedule && ev.slotDuration && (
            <p className="text-sm text-white/40 mt-1">{ev.slotDuration}-minute slots</p>
          )}
          {ev.description && (
            <p className="text-sm text-white/40 mt-3 max-w-lg mx-auto">{ev.description}</p>
          )}
        </div>

        {isAvailability && (
          <div className="flex gap-6 mb-8 flex-col sm:flex-row">
            {/* Calendar */}
            <div className="flex-1 border border-white/20 p-4">
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear((y) => y - 1) } else setCalMonth((m) => m - 1) }}
                  className="p-1 text-white/40 hover:text-white transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                <span className="text-xs font-flink font-bold text-white/80 tracking-wider uppercase">{MONTHS[calMonth]} {calYear}</span>
                <button onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear((y) => y + 1) } else setCalMonth((m) => m + 1) }}
                  className="p-1 text-white/40 hover:text-white transition-colors"><ChevronRight className="h-4 w-4" /></button>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center">
                {["S","M","T","W","T","F","S"].map((d) => (
                  <div key={d} className="text-[9px] text-white/40 py-1 uppercase tracking-wider">{d}</div>
                ))}
                {slotsLoading ? (
                  <div className="col-span-7 py-8 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></div>
                ) : (
                  renderCalendar()
                )}
              </div>
              {!slotsLoading && isThisMonthEmpty() && allAvailableDates.length > 0 && (
                <div className="mt-3 text-center">
                  <p className="text-[10px] text-white/40">No available dates this month</p>
                  <button onClick={() => {
                    const d = new Date(allAvailableDates[0][0])
                    setCalMonth(d.getMonth())
                    setCalYear(d.getFullYear())
                  }} className="text-[10px] text-white/60 hover:text-white mt-1 underline underline-offset-2">
                    Jump to {MONTHS[new Date(allAvailableDates[0][0]).getMonth()]}
                  </button>
                </div>
              )}
              {!slotsLoading && allAvailableDates.length === 0 && (
                <div className="mt-3 text-center">
                  <p className="text-[10px] text-amber-400/60">No available time slots — the host may not have set availability yet.</p>
                </div>
              )}
            </div>

            {/* Time slots */}
            <div className="flex-1 border border-white/20 p-4">
              <p className="text-xs font-flink font-bold text-white/80 uppercase tracking-wider mb-3">
                {selectedDate ? new Date(selectedDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "Select a date"}
              </p>
              {slotsLoading ? (
                <div className="py-8 flex items-center justify-center"><Loader2 className="h-4 w-4 animate-spin text-white/40" /></div>
              ) : selectedDate ? (
                renderTimeSlots()
              ) : (
                <p className="text-xs text-white/30 italic py-8 text-center">Pick a date to see available times</p>
              )}
            </div>
          </div>
        )}

        {/* Capacity indicator */}
        {ev.maxCapacity > 0 && !isAvailability && (
          <div className="flex items-center justify-center gap-2 mb-6">
            <Users className="h-4 w-4 text-white/40" />
            <span className="text-xs text-white/60">
              {isFull ? "Fully booked" : `${remaining} of ${ev.maxCapacity} ${remaining === 1 ? "spot" : "spots"} left`}
            </span>
          </div>
        )}

        {/* Form */}
        <div className="border border-white/20 p-6 space-y-5">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="text-xs text-white/70 mb-2 block">
                {f.label} {f.required && <span className="text-red-400">*</span>}
              </label>
              {f.type === "textarea" ? (
                <textarea value={values[f.key] || ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  className="w-full border border-white/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-white/50 min-h-[80px] text-white placeholder:text-white/30 transition-colors resize-none"
                  placeholder={f.label} />
              ) : (
                <input value={values[f.key] || ""} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  placeholder={f.label}
                  type={f.type === "email" ? "email" : f.type === "tel" ? "tel" : "text"}
                  className="w-full border border-white/20 bg-transparent px-4 py-3 text-sm outline-none focus:border-white/50 text-white placeholder:text-white/30 transition-colors" />
              )}
            </div>
          ))}

          {error && (
            <p className="text-xs text-red-400 border border-red-500/20 px-4 py-2">{error}</p>
          )}

          <button onClick={book} disabled={submitting || !canSubmit}
            className="w-full bg-white px-6 py-3 rounded-full text-base font-flink transition-colors hover:bg-white/65 disabled:opacity-40 disabled:cursor-not-allowed text-black">
            {submitting ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Submitting...</span>
            ) : isRsvp ? (
              "Confirm RSVP"
            ) : isAvailability ? (
              selectedSlot ? `Book ${selectedSlot}` : "Select a time slot"
            ) : (
              "Confirm booking"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function cn(...classes: (string | boolean | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ")
}