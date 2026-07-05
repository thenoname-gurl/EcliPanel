export interface CalendarSettings {
  workStart: number
  workEnd: number
  workDays: number[]
  breaks: { start: number; end: number }[]
  timezone: string
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  workStart: 9,
  workEnd: 17,
  workDays: [1, 2, 3, 4, 5],
  breaks: [],
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
}

export const TODO_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "work", label: "Work" },
  { value: "personal", label: "Personal" },
  { value: "freetime", label: "Free Time" },
  { value: "study", label: "Study" },
] as const
