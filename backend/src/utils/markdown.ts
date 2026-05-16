export function escapeHtml(value: any) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function markdownToHtml(md: any) {
  if (!md) return '';
  let src = String(md);
  src = src.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${escapeHtml(code)}</code></pre>`;
  });

  let out = escapeHtml(src);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%;height:auto;"/>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  out = out.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  out = out.replace(/(?:^|\n)(<li>[\s\S]*?<\/li>)(?:\n(?!<li>))/g, '<ul>$1</ul>');
  out = out.replace(/(^|\n)([^<\n][^\n]+)(?=\n|$)/g, (_m, _p, txt) => `<p>${txt.trim()}</p>`);
  return out;
}