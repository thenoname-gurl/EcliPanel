export function getAvatarInitials(name: string | null | undefined): string {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getAvatarColor(name: string | null | undefined): string {
  const palette = [
    '#2563eb', '#dc2626', '#16a34a', '#ca8a04',
    '#9333ea', '#0891b2', '#ea580c', '#4f46e5',
    '#be185d', '#059669', '#7c3aed', '#0369a1',
  ];
  if (!name || !name.trim()) return palette[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}