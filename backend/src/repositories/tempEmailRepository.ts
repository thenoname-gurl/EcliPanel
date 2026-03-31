import fs from 'fs'
import path from 'path'

let tempDomains = new Set<string>()
let wildcardDomains: string[] = []
let loaded = false

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^\.+|\.+$/g, '')
}

function loadDomains() {
  if (loaded) return
  loaded = true

  const sources: string[] = []
  const candidate1 = path.resolve(__dirname, '../../resources/temp_email_domains.conf')
  const candidate2 = path.resolve(__dirname, '../../resources/temp_email_domains.json')

  if (fs.existsSync(candidate1)) sources.push(candidate1)
  if (fs.existsSync(candidate2)) sources.push(candidate2)

  for (const file of sources) {
    try {
      const content = fs.readFileSync(file, 'utf8')
      if (file.endsWith('.json')) {
        const arr = JSON.parse(content)
        if (Array.isArray(arr)) {
          arr.forEach((entry) => {
            if (typeof entry !== 'string') return
            const normalized = normalizeDomain(entry)
            if (!normalized) return
            if (normalized.startsWith('*.')) {
              wildcardDomains.push(normalized.substring(2))
            } else {
              tempDomains.add(normalized)
            }
          })
        }
      } else {
        const lines = content.split(/\r?\n/)
        lines.forEach((line) => {
          const clean = line.replace(/#.*/, '').trim()
          if (!clean) return
          const normalized = normalizeDomain(clean)
          if (!normalized) return
          if (normalized.startsWith('*.')) {
            wildcardDomains.push(normalized.substring(2))
          } else {
            tempDomains.add(normalized)
          }
        })
      }
    } catch (err) {
      console.error('Failed to load temp email domains from', file, err)
    }
  }

  wildcardDomains = Array.from(new Set(wildcardDomains))
}

export function isTempEmailDomain(domain: string): boolean {
  loadDomains()
  const d = normalizeDomain(domain)
  if (!d) return false

  if (tempDomains.has(d)) return true

  for (const wildcard of wildcardDomains) {
    if (d === wildcard || d.endsWith(`.${wildcard}`)) return true
  }

  const parts = d.split('.')
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.')
    if (tempDomains.has(parent)) return true
  }

  return false
}

export function isTempEmail(email: string): boolean {
  if (!email || typeof email !== 'string') return false
  const parts = email.trim().toLowerCase().split('@')
  if (parts.length !== 2) return false
  return isTempEmailDomain(parts[1])
}
