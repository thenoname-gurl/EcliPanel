import { resolveCountryCode } from "@/lib/billing-display"

export function getCountryFlagUrl(country?: string | null): string | null {
  const code = resolveCountryCode(country)
  if (!code || code.length !== 2) return null
  const base = 0x1F1E6;
  const hexes = code
    .split('')
    .map(char => (base + char.charCodeAt(0) - 65).toString(16));
  return `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/${hexes.join('-')}.svg`;
}

export function getCountryFlagEmoji(country?: string | null): string | null {
  const code = resolveCountryCode(country)
  if (!code || code.length !== 2) return null
  const base = 0x1F1E6;
  return String.fromCodePoint(
    ...code.split('').map(char => base + char.charCodeAt(0) - 65)
  );
}