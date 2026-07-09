let _trustedHostnames: string[] | null = null
let _fetchPromise: Promise<string[]> | null = null

async function fetchTrustedDomains(): Promise<string[]> {
  try {
    const res = await fetch("/api/internal-domains")
    if (!res.ok) return []
    const data = await res.json()
    const domains: string[] = (data?.domains || []).map((d: string) => String(d).toLowerCase())
    return domains
  } catch {
    return []
  }
}

function getTrustedHostnames(): Promise<string[]> {
  if (_trustedHostnames) return Promise.resolve(_trustedHostnames)
  if (!_fetchPromise) {
    _fetchPromise = fetchTrustedDomains().then((list) => {
      _trustedHostnames = list
      _fetchPromise = null
      return list
    }).catch(() => {
      _fetchPromise = null
      return []
    })
  }
  return _fetchPromise
}

let _panelBaseDomain: string | undefined
let _backendHostname: string | null | undefined

function getBackendHostname(): string | null {
  if (typeof _backendHostname !== "undefined") return _backendHostname
  try {
    const base = process.env.NEXT_PUBLIC_API_BASE
    _backendHostname = base ? new URL(base).hostname : null
  } catch {
    _backendHostname = null
  }
  return _backendHostname
}

function initPanelBaseDomain(): string {
  if (typeof window === "undefined") return ""
  const parts = window.location.hostname.split(".")
  _panelBaseDomain = parts.length >= 3 ? parts.slice(-2).join(".") : window.location.hostname
  return _panelBaseDomain
}

function matchesTrustedHostname(hostname: string, trustedDomains: string[]): boolean {
  const lower = hostname.toLowerCase()
  for (const d of trustedDomains) {
    if (lower === d) return true
    if (lower.endsWith("." + d)) return true
    if (d.endsWith("." + lower)) return true
  }
  return false
}

function matchesLocalHeuristics(hostname: string): boolean {
  if (typeof window === "undefined") return false
  if (hostname === window.location.hostname) return true
  if (hostname.endsWith("." + window.location.hostname)) return true
  if (window.location.hostname.endsWith("." + hostname)) return true

  const base = _panelBaseDomain ?? initPanelBaseDomain()
  if (!base) return false
  const urlParts = hostname.split(".")
  const urlBase = urlParts.length >= 3 ? urlParts.slice(-2).join(".") : hostname
  if (base === urlBase) return true

  const backendHost = getBackendHostname()
  if (backendHost) {
    if (hostname === backendHost) return true
    if (hostname.endsWith("." + backendHost)) return true
    if (backendHost.endsWith("." + hostname)) return true
  }

  return false
}

let _trustedCheckWarm = false

export async function isExternalUrl(url: string): Promise<boolean> {
  if (url.startsWith("/") || url.startsWith("#") || url.startsWith("data:") || url.startsWith("blob:")) return false

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  if (matchesLocalHeuristics(hostname)) return false

  if (!_trustedCheckWarm) {
    _trustedCheckWarm = true
    void getTrustedHostnames()
  }

  if (_trustedHostnames && matchesTrustedHostname(hostname, _trustedHostnames)) return false

  return true
}

export function isExternalUrlSync(url: string): boolean {
  if (url.startsWith("/") || url.startsWith("#") || url.startsWith("data:") || url.startsWith("blob:")) return false

  let hostname: string
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }

  if (matchesLocalHeuristics(hostname)) return false

  if (_trustedHostnames && matchesTrustedHostname(hostname, _trustedHostnames)) return false

  return true
}

export function preloadTrustedDomains(): void {
  void getTrustedHostnames()
}