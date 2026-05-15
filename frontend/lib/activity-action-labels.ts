function titleizeWord(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

export function humanizeActivityAction(action: string) {
  const normalized = String(action || '').trim();
  if (!normalized) return '';

  return normalized
    .replace(/[:_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((part) => titleizeWord(part))
    .join(' ')
    .replace(/\bId\b/g, 'ID')
    .replace(/\bIp\b/g, 'IP')
    .replace(/\bKvm\b/g, 'KVM');
}

export function getActivityActionLabel(action: string, labels: Record<string, string>) {
  return labels[action] || humanizeActivityAction(action);
}