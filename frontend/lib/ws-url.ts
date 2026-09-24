export type WsUrlParams = Record<string, string | number>

function resolveWsOrigin(): string {
  return process.env.NEXT_PUBLIC_BACKEND_URL || ""
}

export function apiWsUrl(path: string, params?: WsUrlParams): string {
  let resolvedPath = path
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      resolvedPath = resolvedPath.split(`:${key}`).join(encodeURIComponent(String(value)))
    }
  }

  if (resolvedPath.startsWith('//')) return '/'

  const origin = resolveWsOrigin()
  if (!origin) return resolvedPath

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return resolvedPath
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return resolvedPath

  const basePath = parsed.pathname.replace(/\/+$/, "")
  parsed.pathname = `${basePath}${resolvedPath}`
  parsed.search = ""
  parsed.hash = ""
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:"
  return parsed.toString()
}