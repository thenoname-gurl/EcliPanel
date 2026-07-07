export interface BrushSettings {
  size: number
  opacity: number
  flow: number
  spacing: number
  hardness: number
  scatter: number
  sizeJitter: number
  opacityJitter: number
  rotationJitter: number
  scatterJitter: number
  hueJitter: number
  saturationJitter: number
  brightnessJitter: number
  rotation: number
  tipShape: 'round' | 'square' | 'texture'
  textureScale: number
}

export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  size: 20,
  opacity: 1,
  flow: 1,
  spacing: 5,
  hardness: 100,
  scatter: 0,
  sizeJitter: 0,
  opacityJitter: 0,
  rotationJitter: 0,
  scatterJitter: 0,
  hueJitter: 0,
  saturationJitter: 0,
  brightnessJitter: 0,
  rotation: 0,
  tipShape: 'round',
  textureScale: 1,
}

export const PRESET_BRUSHES = [
  { name: 'Round Hard', icon: '●', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 12, spacing: 3, hardness: 100 } },
  { name: 'Round Soft', icon: '◯', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 30, spacing: 3, hardness: 30 } },
  { name: 'Airbrush', icon: '◎', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 40, spacing: 2, hardness: 10, opacity: 0.3, flow: 0.5 } },
  { name: 'Sketch Pencil', icon: '✎', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 4, spacing: 1, hardness: 100, sizeJitter: 15, opacityJitter: 20 } },
  { name: 'Marker', icon: '▬', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 8, spacing: 2, hardness: 100, opacity: 0.8, rotationJitter: 30 } },
  { name: 'Spray Paint', icon: '⁕', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 35, spacing: 8, hardness: 50, scatter: 12, opacity: 0.4, sizeJitter: 30, opacityJitter: 30 } },
  { name: 'Calligraphy', icon: '∕', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 15, spacing: 3, hardness: 100, rotation: 45, opacityJitter: 10 } },
  { name: 'Chalk', icon: '╳', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 20, spacing: 4, hardness: 40, scatter: 3, sizeJitter: 20, opacityJitter: 30 } },
  { name: 'Ink Bleed', icon: '⬤', settings: { ...DEFAULT_BRUSH_SETTINGS, size: 25, spacing: 3, hardness: 60, flow: 0.8, sizeJitter: 10, opacityJitter: 15 } },
]

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 0, g: 0, b: 0 }
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('')
}

export function applyHueJitter(color: string, hueShift: number, satShift: number, briShift: number): string {
  const rgb = hexToRgb(color)
  let r = rgb.r / 255, g = rgb.g / 255, b = rgb.b / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0, l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
      case g: h = ((b - r) / d + 2) / 6; break
      case b: h = ((r - g) / d + 4) / 6; break
    }
  }
  h = (h + hueShift / 360) % 1
  s = Math.max(0, Math.min(1, s + satShift / 100))
  l = Math.max(0, Math.min(1, l + briShift / 100))
  function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    if (s === 0) return [l, l, l]
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    return [hue2rgb(p, q, h + 1/3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1/3)]
  }
  const [nr, ng, nb] = hslToRgb(h, s, l)
  return rgbToHex(Math.round(nr * 255), Math.round(ng * 255), Math.round(nb * 255))
}

export function renderStamp(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  settings: BrushSettings & { color: string }
) {
  const size = settings.size * (1 + (Math.random() - 0.5) * settings.sizeJitter / 100)
  const opacity = settings.opacity * (1 + (Math.random() - 0.5) * settings.opacityJitter / 100)
  const rotJitter = (Math.random() - 0.5) * settings.rotationJitter
  const angle = (settings.rotation + rotJitter) * Math.PI / 180
  const scatterAngle = Math.random() * Math.PI * 2
  const scatterDist = settings.scatter * (1 + (Math.random() - 0.5) * settings.scatterJitter / 100)
  const sx = x + Math.cos(scatterAngle) * scatterDist
  const sy = y + Math.sin(scatterAngle) * scatterDist

  let stampColor = settings.color
  if (settings.hueJitter || settings.saturationJitter || settings.brightnessJitter) {
    stampColor = applyHueJitter(
      stampColor,
      (Math.random() - 0.5) * settings.hueJitter,
      (Math.random() - 0.5) * settings.saturationJitter,
      (Math.random() - 0.5) * settings.brightnessJitter,
    )
  }

  ctx.save()
  ctx.globalAlpha = Math.max(0, Math.min(1, opacity * settings.flow))
  ctx.translate(sx, sy)
  ctx.rotate(angle)

  const half = size / 2
  if (settings.tipShape === 'round') {
    if (settings.hardness < 100) {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, half)
      const h = settings.hardness / 100
      grad.addColorStop(0, stampColor)
      grad.addColorStop(h, stampColor)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
    } else {
      ctx.fillStyle = stampColor
    }
    ctx.beginPath()
    ctx.arc(0, 0, half, 0, Math.PI * 2)
    ctx.fill()
  } else if (settings.tipShape === 'square') {
    if (settings.hardness < 100) {
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, half)
      const h = settings.hardness / 100
      grad.addColorStop(0, stampColor)
      grad.addColorStop(h, stampColor)
      grad.addColorStop(1, 'transparent')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.arc(0, 0, half, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = stampColor
      ctx.fillRect(-half, -half, size, size)
    }
  }
  ctx.restore()
}


