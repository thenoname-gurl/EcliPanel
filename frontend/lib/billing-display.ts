import { COUNTRIES } from "@/lib/countries"

const EU_CODES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
])

function normalizeToken(input?: string | null): string {
  return (input || "").toString().trim().toUpperCase()
}

const COUNTRY_BY_NAME = new Map(COUNTRIES.map((country) => [country.name.toUpperCase(), country.code]))
const COUNTRY_BY_CODE = new Map(COUNTRIES.map((country) => [country.code.toUpperCase(), country.code]))

export function sanitizeCurrencyCode(input?: string | null): string {
  const code = normalizeToken(input)
  if (!/^[A-Z]{3}$/.test(code)) return "USD"
  return code
}

export function resolveCountryCode(country?: string | null): string | null {
  const token = normalizeToken(country)
  if (!token) return null
  if (COUNTRY_BY_CODE.has(token)) return token
  if (COUNTRY_BY_NAME.has(token)) return COUNTRY_BY_NAME.get(token) || null
  return null
}

export function isEUCountry(country?: string | null): boolean {
  const code = resolveCountryCode(country)
  if (!code) return false
  return EU_CODES.has(code)
}

export function parseTaxRules(raw?: string | null): Record<string, number> {
  if (!raw) return {}
  const parsed: Record<string, number> = {}
  const entries = String(raw)
    .split(/[\n,;]+/)
    .map((part) => part.trim())
    .filter(Boolean)

  for (const entry of entries) {
    const [lhs, rhs] = entry.split(/[:=]/).map((value) => value?.trim())
    if (!lhs || rhs === undefined) continue
    const rate = Number(rhs)
    if (!Number.isFinite(rate)) continue
    const key = lhs.toUpperCase()
    if (!key) continue
    parsed[key] = Math.max(0, Math.min(100, rate))
  }

  return parsed
}

export function resolveTaxRate(rawRules: string | null | undefined, country?: string | null): number {
  const rules = parseTaxRules(rawRules)
  const code = resolveCountryCode(country)
  const countryName = normalizeToken(country)

  if (code && rules[code] !== undefined) return rules[code]
  if (countryName && rules[countryName] !== undefined) return rules[countryName]
  if (country && isEUCountry(country) && rules.EU !== undefined) return rules.EU
  if (rules["*"] !== undefined) return rules["*"]
  if (rules.DEFAULT !== undefined) return rules.DEFAULT
  return 0
}

export function applyTax(amount: number, taxRatePercent: number): { base: number; tax: number; total: number } {
  const safeAmount = Number.isFinite(amount) ? amount : 0
  const safeRate = Number.isFinite(taxRatePercent) ? Math.max(0, taxRatePercent) : 0
  const tax = safeAmount * (safeRate / 100)
  return {
    base: safeAmount,
    tax,
    total: safeAmount + tax,
  }
}

export function formatMoney(amount: number, currencyCode?: string | null): string {
  const currency = sanitizeCurrencyCode(currencyCode)
  const safeAmount = Number.isFinite(amount) ? amount : 0
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount)
}