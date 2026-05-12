export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

export interface PasswordCheck {
  label: string
  met: boolean
}

export function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { label: "8+ characters", met: password.length >= PASSWORD_MIN },
    { label: "Uppercase", met: /[A-Z]/.test(password) },
    { label: "Lowercase", met: /[a-z]/.test(password) },
    { label: "Number", met: /[0-9]/.test(password) },
    { label: "Symbol", met: /[^A-Za-z0-9]/.test(password) },
  ]
}

export function getPasswordStrength(password: string): number {
  if (!password) return 0
  const lengthScore = Math.min(1, password.length / 16)
  const hasLower = /[a-z]/.test(password)
  const hasUpper = /[A-Z]/.test(password)
  const hasNumber = /[0-9]/.test(password)
  const hasSymbol = /[^A-Za-z0-9]/.test(password)
  const varietyScore = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length / 4
  return Math.min(1, Math.round((0.35 * lengthScore + 0.65 * varietyScore) * 100) / 100)
}

export function getPasswordStrengthLabel(score: number): { label: string; color: string; trackColor: string } {
  if (score >= 0.8) return { label: "Strong", color: "bg-emerald-500", trackColor: "text-emerald-500" }
  if (score >= 0.55) return { label: "Moderate", color: "bg-amber-400", trackColor: "text-amber-400" }
  if (score > 0) return { label: "Weak", color: "bg-destructive", trackColor: "text-destructive" }
  return { label: "Too short", color: "bg-muted-foreground/40", trackColor: "text-muted-foreground" }
}

export function isPasswordValid(password: string): boolean {
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) return false
  return getPasswordChecks(password).every((c) => c.met)
}

export const FIELD_MAX_LENGTHS: Record<string, number> = {
  firstName: 64,
  lastName: 64,
  middleName: 64,
  displayName: 64,
  email: 254,
  address: 256,
  address2: 256,
  billingCompany: 128,
  billingCity: 128,
  billingState: 64,
  billingZip: 20,
  phone: 32,
}
