export function formatBytes(bytes: number, decimals: number = 1): string {
  if (!bytes || bytes <= 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`
}

export function parseBytes(str: string): number {
  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
    pb: 1024 ** 5,
  }
  const match = str.toLowerCase().trim().match(/^([\d.]+)\s*([a-z]+)?$/)
  if (!match) return 0
  const value = parseFloat(match[1])
  const unit = match[2] || "b"
  return Math.floor(value * (units[unit] || 1))
}

export function displayPath(p: string): string {
  return `/home/container${p.startsWith("/") ? p : `/${p}`}`
}

export function normalizePath(p: string): string {
  const normalized = p.replace(/\/+/g, "/")
  return normalized.startsWith("/") ? normalized : `/${normalized}`
}

export function getParentPath(p: string): string {
  const normalized = normalizePath(p).replace(/\/$/, "")
  const parts = normalized.split("/").filter(Boolean)
  parts.pop()
  return parts.length ? `/${parts.join("/")}/` : "/"
}

export function getFileName(p: string): string {
  const normalized = normalizePath(p).replace(/\/$/, "")
  return normalized.split("/").pop() || ""
}

export function getFileExtension(filename: string): string {
  const parts = filename.split(".")
  if (parts.length < 2) return ""
  return parts.pop()?.toLowerCase() || ""
}

export function joinPath(...parts: string[]): string {
  return normalizePath(parts.join("/"))
}

export function isRootPath(p: string): boolean {
  return normalizePath(p) === "/"
}

export function getRelativePath(from: string, to: string): string {
  const fromParts = normalizePath(from).split("/").filter(Boolean)
  const toParts = normalizePath(to).split("/").filter(Boolean)
  
  let commonLength = 0
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++
    } else {
      break
    }
  }
  
  const upCount = fromParts.length - commonLength
  const downParts = toParts.slice(commonLength)
  
  return [...Array(upCount).fill(".."), ...downParts].join("/") || "."
}

type RelativeDateLabels = {
  justNow?: string
  yesterday?: string
}

export function formatDate(
  date: string | number | Date | undefined,
  labels?: RelativeDateLabels
): string {
  if (!date) return "—"
  const d = new Date(date)
  if (isNaN(d.getTime())) return "—"
  const justNowLabel = labels?.justNow ?? "Just now"
  const yesterdayLabel = labels?.yesterday ?? "Yesterday"
  
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) return justNowLabel
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays === 1) return yesterdayLabel
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" })
  if (diffDays < 365) return d.toLocaleDateString([], { month: "short", day: "numeric" })
  return d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" })
}

export function formatDateTime(date: string | number | Date | undefined): string {
  if (!date) return "—"
  const d = new Date(date)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0s"
  
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const secs = Math.floor(seconds % 60)
  
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`)
  
  return parts.join(" ")
}

export function formatUptime(startTime: string | number | Date): string {
  const start = new Date(startTime)
  if (isNaN(start.getTime())) return "—"
  const seconds = Math.floor((Date.now() - start.getTime()) / 1000)
  return formatDuration(seconds)
}

export function isImageFile(filename: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|ico|tiff?|avif|heic|heif)$/i.test(filename)
}

export function isVideoFile(filename: string): boolean {
  return /\.(mp4|webm|mkv|avi|mov|wmv|flv|m4v|ogv|3gp)$/i.test(filename)
}

export function isAudioFile(filename: string): boolean {
  return /\.(mp3|wav|ogg|flac|aac|m4a|wma|opus|aiff?)$/i.test(filename)
}

export function isArchiveFile(filename: string): boolean {
  return /\.(zip|tar|gz|tgz|rar|7z|bz2|xz|lz|lzma|cab|iso|dmg|jar|war|ear)$/i.test(filename)
}

export function isDocumentFile(filename: string): boolean {
  return /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|rtf|epub|mobi)$/i.test(filename)
}

export function isExecutableFile(filename: string): boolean {
  return /\.(exe|dll|so|dylib|bin|app|msi|deb|rpm|apk|ipa)$/i.test(filename)
}

export function isFontFile(filename: string): boolean {
  return /\.(ttf|otf|woff2?|eot|fnt)$/i.test(filename)
}

export function isTextFile(filename: string): boolean {
  return /\.(txt|md|markdown|rst|adoc|asciidoc|json|jsonc|json5|yaml|yml|xml|html?|css|scss|sass|less|styl|stylus|js|mjs|cjs|jsx|ts|mts|cts|tsx|vue|svelte|astro|py|pyw|rb|php|php[3-8]?|phtml|java|kt|kts|groovy|scala|go|rs|c|cc|cpp|cxx|h|hh|hpp|hxx|cs|fs|fsx|fsi|vb|vbs|swift|m|mm|pl|pm|lua|r|R|jl|ex|exs|erl|hrl|clj|cljs|cljc|edn|hs|lhs|ml|mli|elm|purs|nim|cr|v|zig|d|pas|pp|lpr|dpr|ada|adb|ads|cob|cbl|f|f90|f95|for|ftn|asm|s|sh|bash|zsh|fish|ksh|csh|tcsh|ps1|psm1|psd1|bat|cmd|vbs|awk|sed|make|makefile|cmake|dockerfile|vagrantfile|jenkinsfile|rakefile|gemfile|podfile|cartfile|fastfile|gradlefile|procfile|brewfile|ini|cfg|conf|config|properties|env|envrc|editorconfig|gitconfig|gitignore|gitattributes|gitmodules|npmrc|yarnrc|prettierrc|eslintrc|babelrc|stylelintrc|huskyrc|lintstagedrc|commitlintrc|renovaterc|dependabot|browserslistrc|postcssrc|tailwindrc|tsconfig|jsconfig|webpack|rollup|vite|esbuild|snowpack|parcel|nuxt|next|gatsby|angular|svelte\.config|astro\.config|remix|prisma|drizzle|knex|sequelize|typeorm|mikro-orm|objection|bookshelf|waterline|mongoose|graphql|gql|sql|ddl|dml|pgsql|plsql|mysql|sqlite|cql|cypher|sparql|hcl|tf|tfvars|tfstate|nomad|consul|vault|packer|ansible|playbook|inventory|terraform|pulumi|cloudformation|sam|serverless|netlify|vercel|render|railway|fly|docker-compose|compose|kubernetes|k8s|helm|kustomize|skaffold|tilt|garden|argo|flux|tekton|jenkins|github|gitlab|bitbucket|circle|travis|azure|aws|gcp|openapi|swagger|raml|asyncapi|proto|protobuf|thrift|avro|parquet|csv|tsv|dsv|ndjson|jsonl|log|out|err|pid|lock|sum|mod|work|tool|tool-versions|mise|asdf|rtx|sdkman|jabba|jenv|pyenv|rbenv|nodenv|goenv|rustup|cargo|mix|hex|opam|stack|cabal|nimble|dub|vcpkg|conan|meson|bazel|buck|pants|scons|waf|gyp|gn|premake|xmake|fpm)$/i.test(filename)
}

export function isBinaryFile(filename: string): boolean {
  return isImageFile(filename) ||
    isVideoFile(filename) ||
    isAudioFile(filename) ||
    isArchiveFile(filename) ||
    isDocumentFile(filename) ||
    isExecutableFile(filename) ||
    isFontFile(filename) ||
    /\.(class|pyc|pyo|pyd|o|obj|a|lib|so\.\d+|dylib|wasm|beam|elc|fasl|compiled|zwc)$/i.test(filename)
}

export function getFileCategory(filename: string): string {
  if (isImageFile(filename)) return "image"
  if (isVideoFile(filename)) return "video"
  if (isAudioFile(filename)) return "audio"
  if (isArchiveFile(filename)) return "archive"
  if (isDocumentFile(filename)) return "document"
  if (isExecutableFile(filename)) return "executable"
  if (isFontFile(filename)) return "font"
  if (isTextFile(filename)) return "text"
  if (isBinaryFile(filename)) return "binary"
  return "unknown"
}

export const MONACO_LANGUAGE_MAP: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  mts: "typescript",
  cts: "typescript",
  tsx: "typescript",
  html: "html",
  htm: "html",
  xhtml: "html",
  vue: "html",
  svelte: "html",
  astro: "html",
  css: "css",
  scss: "scss",
  sass: "scss",
  less: "less",
  styl: "css",
  stylus: "css",
  json: "json",
  jsonc: "json",
  json5: "json",
  yaml: "yaml",
  yml: "yaml",
  xml: "xml",
  xsl: "xml",
  xslt: "xml",
  svg: "xml",
  rss: "xml",
  atom: "xml",
  xsd: "xml",
  dtd: "xml",
  toml: "ini",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  config: "ini",
  properties: "ini",
  env: "ini",
  envrc: "ini",
  editorconfig: "ini",
  gitconfig: "ini",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  rst: "restructuredtext",
  adoc: "asciidoc",
  asciidoc: "asciidoc",
  tex: "latex",
  latex: "latex",
    py: "python",
  pyw: "python",
  pyi: "python",
  pyx: "python",
  pxd: "python",
  ipynb: "json",
  rb: "ruby",
  rake: "ruby",
  gemspec: "ruby",
  podspec: "ruby",
  php: "php",
  php3: "php",
  php4: "php",
  php5: "php",
  php7: "php",
  php8: "php",
  phtml: "php",
  java: "java",
  jar: "java",
  kt: "kotlin",
  kts: "kotlin",
  scala: "scala",
  sc: "scala",
  groovy: "groovy",
  gradle: "groovy",
  go: "go",
  mod: "go",
  sum: "go",
  rs: "rust",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hh: "cpp",
  hxx: "cpp",
  ino: "cpp",
  cs: "csharp",
  csx: "csharp",
  fs: "fsharp",
  fsx: "fsharp",
  fsi: "fsharp",
  vb: "vb",
  vbs: "vb",
  swift: "swift",
  m: "objective-c",
  mm: "objective-c",
  dart: "dart",
  lua: "lua",
  r: "r",
  R: "r",
  rmd: "r",
  jl: "julia",
  pl: "perl",
  pm: "perl",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  clj: "clojure",
  cljs: "clojure",
  cljc: "clojure",
  edn: "clojure",
  hs: "haskell",
  lhs: "haskell",
  ml: "fsharp",
  mli: "fsharp",
  elm: "elm",
  purs: "purescript",
  nim: "nim",
  cr: "crystal",
  v: "v",
  zig: "zig",
  d: "d",
  pas: "pascal",
  pp: "pascal",
  lpr: "pascal",
  dpr: "pascal",
  ada: "ada",
  adb: "ada",
  ads: "ada",
  cob: "cobol",
  cbl: "cobol",
  f: "fortran",
  f90: "fortran",
  f95: "fortran",
  for: "fortran",
  ftn: "fortran",
  asm: "asm",
  s: "asm",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  fish: "shell",
  ksh: "shell",
  csh: "shell",
  tcsh: "shell",
  ps1: "powershell",
  psm1: "powershell",
  psd1: "powershell",
  bat: "bat",
  cmd: "bat",
  awk: "awk",
  sed: "sed",
  makefile: "makefile",
  make: "makefile",
  mk: "makefile",
  cmake: "cmake",
  dockerfile: "dockerfile",
  containerfile: "dockerfile",
  vagrantfile: "ruby",
  jenkinsfile: "groovy",
  rakefile: "ruby",
  gemfile: "ruby",
  podfile: "ruby",
  cartfile: "ruby",
  fastfile: "ruby",
  sql: "sql",
  ddl: "sql",
  dml: "sql",
  pgsql: "pgsql",
  plsql: "sql",
  mysql: "mysql",
  sqlite: "sql",
  cql: "sql",
  cypher: "cypher",
  sparql: "sparql",
  graphql: "graphql",
  gql: "graphql",
  hcl: "hcl",
  tf: "hcl",
  tfvars: "hcl",
  nomad: "hcl",
  proto: "protobuf",
  protobuf: "protobuf",
  thrift: "thrift",
  avsc: "json",
  log: "log",
  out: "log",
  err: "log",
  diff: "diff",
  patch: "diff",
  csv: "csv",
  tsv: "csv",
  http: "http",
  rest: "http",
  puml: "plantuml",
  plantuml: "plantuml",
  dot: "dot",
  gv: "dot",
  lock: "json",
}

export type FileIconType = 
  | "folder"
  | "file"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "document"
  | "code"
  | "data"
  | "config"
  | "markdown"
  | "git"
  | "docker"
  | "database"
  | "key"
  | "lock"
  | "env"
  | "log"

export function getFileIconType(filename: string, isDirectory: boolean = false): FileIconType {
  if (isDirectory) return "folder"
  
  const name = filename.toLowerCase()
  const ext = getFileExtension(filename)
  
  if (name === ".gitignore" || name === ".gitattributes" || name === ".gitmodules") return "git"
  if (name === "dockerfile" || name === "docker-compose.yml" || name === "docker-compose.yaml") return "docker"
  if (name.includes(".env")) return "env"
  if (name.endsWith(".lock") || name === "package-lock.json" || name === "yarn.lock" || name === "pnpm-lock.yaml") return "lock"
  if (name.endsWith(".log") || name === "debug.log" || name === "error.log") return "log"
  if (name.includes("readme")) return "markdown"
  if (name.includes("license") || name.includes("licence")) return "document"
  if (name.endsWith(".key") || name.endsWith(".pem") || name.endsWith(".crt") || name.endsWith(".cer")) return "key"
  
  if (isImageFile(filename)) return "image"
  if (isVideoFile(filename)) return "video"
  if (isAudioFile(filename)) return "audio"
  if (isArchiveFile(filename)) return "archive"
  if (isDocumentFile(filename)) return "document"
  
  if (["md", "markdown", "mdx", "rst", "adoc"].includes(ext)) return "markdown"
  if (["json", "yaml", "yml", "xml", "csv", "tsv"].includes(ext)) return "data"
  if (["ini", "cfg", "conf", "config", "properties", "toml"].includes(ext)) return "config"
  if (["sql", "pgsql", "mysql", "sqlite", "cql"].includes(ext)) return "database"
  
  if (MONACO_LANGUAGE_MAP[ext]) return "code"
  
  return "file"
}

export function getFileColor(filename: string, isDirectory: boolean = false): string {
  if (isDirectory) return "text-primary/70"
  
  const iconType = getFileIconType(filename)
  
  switch (iconType) {
    case "folder": return "text-primary/70"
    case "image": return "text-pink-400"
    case "video": return "text-purple-400"
    case "audio": return "text-green-400"
    case "archive": return "text-orange-400"
    case "document": return "text-red-400"
    case "code": return "text-blue-400"
    case "data": return "text-yellow-400"
    case "config": return "text-gray-400"
    case "markdown": return "text-cyan-400"
    case "git": return "text-orange-500"
    case "docker": return "text-blue-500"
    case "database": return "text-emerald-400"
    case "key": return "text-yellow-500"
    case "lock": return "text-gray-500"
    case "env": return "text-green-500"
    case "log": return "text-gray-400"
    default: return "text-muted-foreground"
  }
}

export function formatPermissions(mode: number | string): string {
  const numMode = typeof mode === "string" ? parseInt(mode, 8) : mode
  if (isNaN(numMode)) return "---"
  
  const perms = ["---", "--x", "-w-", "-wx", "r--", "r-x", "rw-", "rwx"]
  const owner = perms[(numMode >> 6) & 7]
  const group = perms[(numMode >> 3) & 7]
  const other = perms[numMode & 7]
  
  return `${owner}${group}${other}`
}

export function parsePermissions(str: string): number {
  if (/^[0-7]{3,4}$/.test(str)) {
    return parseInt(str, 8)
  }
  
  if (str.length !== 9) return 0o644
  
  const parseTriple = (s: string): number => {
    let v = 0
    if (s[0] === "r") v += 4
    if (s[1] === "w") v += 2
    if (s[2] === "x") v += 1
    return v
  }
  
  const owner = parseTriple(str.slice(0, 3))
  const group = parseTriple(str.slice(3, 6))
  const other = parseTriple(str.slice(6, 9))
  
  return (owner << 6) | (group << 3) | other
}

export function isValidOctalMode(mode: string): boolean {
  return /^[0-7]{3,4}$/.test(mode)
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      const success = document.execCommand("copy")
      document.body.removeChild(textarea)
      return success
    } catch {
      return false
    }
  }
}

export type SortField = "name" | "size" | "modified" | "type"
export type SortDirection = "asc" | "desc"

export interface SortConfig {
  field: SortField
  direction: SortDirection
}

export function sortFiles<T extends { name?: string; size?: number; modified?: string; directory?: boolean }>(
  files: T[],
  config: SortConfig
): T[] {
  const { field, direction } = config
  const multiplier = direction === "asc" ? 1 : -1
  
  return [...files].sort((a, b) => {
    const aDir = a.directory ?? false
    const bDir = b.directory ?? false
    if (aDir && !bDir) return -1
    if (!aDir && bDir) return 1
    
    switch (field) {
      case "name":
        return multiplier * (a.name || "").localeCompare(b.name || "")
      case "size":
        return multiplier * ((a.size || 0) - (b.size || 0))
      case "modified":
        const aTime = a.modified ? new Date(a.modified).getTime() : 0
        const bTime = b.modified ? new Date(b.modified).getTime() : 0
        return multiplier * (aTime - bTime)
      case "type":
        const aExt = getFileExtension(a.name || "")
        const bExt = getFileExtension(b.name || "")
        return multiplier * aExt.localeCompare(bExt)
      default:
        return 0
    }
  })
}

export function filterFiles<T extends { name?: string }>(
  files: T[],
  query: string
): T[] {
  if (!query.trim()) return files
  
  const lowerQuery = query.toLowerCase().trim()
  const terms = lowerQuery.split(/\s+/)
  
  return files.filter(file => {
    const name = (file.name || "").toLowerCase()
    return terms.every(term => name.includes(term))
  })
}

export function matchesGlob(filename: string, pattern: string): boolean {
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  
  return new RegExp(`^${regexPattern}$`, "i").test(filename)
}

export function isValidFileName(name: string): boolean {
  if (!name || name.trim() !== name) return false
  if (name === "." || name === "..") return false
  if (name.length > 255) return false
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name)) return false
  return true
}

export function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 255)
}

export const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  bmp: "image/bmp",
  tiff: "image/tiff",
  tif: "image/tiff",
  avif: "image/avif",
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  aac: "audio/aac",
  m4a: "audio/mp4",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  tar: "application/x-tar",
  gz: "application/gzip",
  rar: "application/vnd.rar",
  "7z": "application/x-7z-compressed",
  txt: "text/plain",
  html: "text/html",
  css: "text/css",
  js: "text/javascript",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/x-yaml",
  yml: "application/x-yaml",
  md: "text/markdown",
  csv: "text/csv",
  ttf: "font/ttf",
  otf: "font/otf",
  woff: "font/woff",
  woff2: "font/woff2",
  wasm: "application/wasm",
}

export function getMimeType(filename: string): string {
  const ext = getFileExtension(filename)
  return MIME_TYPES[ext] || "application/octet-stream"
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadText(content: string, filename: string, mimeType: string = "text/plain"): void {
  const blob = new Blob([content], { type: mimeType })
  downloadBlob(blob, filename)
}