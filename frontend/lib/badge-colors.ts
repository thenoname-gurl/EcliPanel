const BADGE_COLOR_CLASSES = [
  "border-primary/30 bg-primary/10 text-primary",
  "border-warning/30 bg-warning/10 text-warning",
  "border-success/30 bg-success/10 text-success",
  "border-destructive/30 bg-destructive/10 text-destructive",
  "border-border bg-secondary/50 text-muted-foreground",
] as const

function hashBadgeValue(value: string): number {
  let hash = 0
  const normalized = value.trim().toLowerCase()

  for (let index = 0; index < normalized.length; index += 1) {
    hash = (hash << 5) - hash + normalized.charCodeAt(index)
    hash |= 0
  }

  return Math.abs(hash)
}

export function getBadgeColorClass(badge: string): string {
  if (!badge.trim()) return BADGE_COLOR_CLASSES[0]

  const hash = hashBadgeValue(badge)
  return BADGE_COLOR_CLASSES[hash % BADGE_COLOR_CLASSES.length]
}
