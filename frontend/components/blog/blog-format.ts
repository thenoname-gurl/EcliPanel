export function stripMarkdown(text: string): string {
  if (!text) return ""
  return text
    .replace(/~[^~]+~/g, (_m: string, inner: string) => {
      const ci = inner.indexOf(":")
      return ci > 0 ? inner.slice(ci + 1) : inner
    })
    .replace(/::.+$/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .trim()
}

const SAFE_COLOR = /^([a-zA-Z]+|#[0-9a-fA-F]{3,8})$/
function safeColor(c: string): boolean { return SAFE_COLOR.test(c) }

export function renderTitleHtml(title: string): string {
  if (!title) return ""

  let html = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  // __underline__
  html = html.replace(/__(.+?)__/g, "<u>$1</u>")
  // **bold**
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  // _italic_
  html = html.replace(/_(.+?)_/g, "<em>$1</em>")
  // :: subtitle
  html = html.replace(/::(.+)$/, (_m: string, subtitle: string) => {
    let s = subtitle.trim()
    s = s.replace(/__(.+?)__/g, "<u>$1</u>")
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    s = s.replace(/_(.+?)_/g, "<em>$1</em>")
    s = s.replace(/~([^~]+)~/g, colorReplacer)
    return `<span style="display:block;font-size:0.55em;font-weight:500;opacity:0.6;line-height:1.2">${s}</span>`
  })

  // ~color:text~ or ~red underline:text~
  html = html.replace(/~([^~]+)~/g, colorReplacer)

  return html
}

function colorReplacer(_m: string, inner: string): string {
  const colonIdx = inner.indexOf(":")
  if (colonIdx <= 0) return _m
  const modifiers = inner.slice(0, colonIdx).split(/\s+/)
  const text = inner.slice(colonIdx + 1)
  const hasUnderline = modifiers.includes("underline") || modifiers.includes("u")
  const styles: string[] = []
  const colors: string[] = []
  for (const mod of modifiers) {
    if (mod === "underline" || mod === "u") styles.push("text-decoration:underline")
    else if (mod === "bold" || mod === "b") styles.push("font-weight:bold")
    else if (mod === "italic" || mod === "i") styles.push("font-style:italic")
    else if (safeColor(mod)) colors.push(mod)
  }
  if (hasUnderline && colors.length > 0) styles.push(`text-decoration-color:${colors[0]}`)
  else if (!hasUnderline && colors.length > 0) styles.push(`color:${colors[0]}`)
  return `<span style="${styles.join(";")}">${text}</span>`
}