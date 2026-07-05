export interface IcsEvent {
  title: string
  description: string
  date: string
  startTime: string
  endTime: string
}

function formatIcsDate(dateStr: string, timeStr: string): string {
  const [y, m, d] = dateStr.split("-")
  const [hh, mm] = timeStr.split(":")
  return `${y}${m}${d}T${hh}${mm}00`
}

export function generateIcs(events: IcsEvent[]): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//EcliPanel//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ]
  for (const ev of events) {
    const uid = `${ev.date}-${ev.startTime}-${ev.title.replace(/\s+/g, "-")}-${Date.now()}`
    const dtStart = formatIcsDate(ev.date, ev.startTime)
    const dtEnd = formatIcsDate(ev.date, ev.endTime)
    lines.push("BEGIN:VEVENT")
    lines.push(`UID:${uid}`)
    lines.push(`DTSTART:${dtStart}`)
    lines.push(`DTEND:${dtEnd}`)
    lines.push(`SUMMARY:${ev.title}`)
    if (ev.description) lines.push(`DESCRIPTION:${ev.description.replace(/\n/g, "\\n")}`)
    lines.push("END:VEVENT")
  }
  lines.push("END:VCALENDAR")
  return lines.join("\r\n")
}

export function downloadIcs(ics: string, filename = "calendar.ics") {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function parseIcs(content: string): IcsEvent[] {
  const events: IcsEvent[] = []
  const lines = content.split(/\r?\n/)
  let inEvent = false
  let current: Record<string, string> = {}

  for (const raw of lines) {
    const line = raw.trim()
    if (line === "BEGIN:VEVENT") { inEvent = true; current = {}; continue }
    if (line === "END:VEVENT") {
      inEvent = false
      const dtStart = current["DTSTART"] || ""
      const dtEnd = current["DTEND"] || ""
      const summary = current["SUMMARY"] || "Untitled"
      const description = current["DESCRIPTION"] || ""
      if (dtStart && dtEnd) {
        const date = `${dtStart.slice(0, 4)}-${dtStart.slice(4, 6)}-${dtStart.slice(6, 8)}`
        const startTime = `${dtStart.slice(9, 11)}:${dtStart.slice(11, 13)}`
        const endTime = `${dtEnd.slice(9, 11)}:${dtEnd.slice(11, 13)}`
        events.push({ title: summary, description, date, startTime, endTime })
      }
      continue
    }
    if (inEvent) {
      const colonIdx = line.indexOf(":")
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx)
        const val = line.slice(colonIdx + 1)
        current[key] = val
      }
    }
  }
  return events
}