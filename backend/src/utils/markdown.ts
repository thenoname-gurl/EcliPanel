export function escapeHtml(value: any) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ALLOWED_URI_SCHEMES = /^(https?|mailto):/i;

export function markdownToHtml(md: any) {
  if (!md) return '';
  let src = String(md);
  const codeBlocks: string[] = [];
  src = src.replace(/```([a-zA-Z0-9]*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    codeBlocks.push(`<pre><code>${escapeHtml(code).replace(/\n$/, '')}</code></pre>`);
    return `\n<!--CODEBLOCK_${codeBlocks.length - 1}-->\n`;
  });
  let out = escapeHtml(src);
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, alt, url) => {
    const safeUrl = ALLOWED_URI_SCHEMES.test(url) ? url.replace(/&/g, '&amp;') : '';
    return `<img src="${safeUrl}" alt="${alt}" style="max-width:100%;height:auto"/>`;
  });
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
    const safeUrl = ALLOWED_URI_SCHEMES.test(url) ? url.replace(/&/g, '&amp;') : '';
    return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  });
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  out = out.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  out = out.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  out = out.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  out = out.replace(/^&gt;\s?(.+)$/gm, '<blockquote style="border-left:3px solid #8b5cf6;margin:8px 0;padding-left:16px;color:#ccc">$1</blockquote>');
  out = out.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
  out = out.replace(/(?:^|\n)(<li>[\s\S]*?<\/li>)(?:\n(?!<li>))/g, '<ul>$1</ul>');
  out = out.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');
  out = out.replace(/(?:^|\n)(<li>[\s\S]*?<\/li>)(?:\n(?!<li>|<ul>))/g, (match) => {
    if (match.includes('<ul>')) return match;
    return `<ol>${match}</ol>`;
  });
  out = out.replace(/^(---|\*\*\*|___)\s*$/gm, '<hr style="height:1px;background:linear-gradient(to right,transparent,#2a2a4a 50%,transparent);border:none;margin:24px 0">');
  out = out.replace(/(^|\n)([^<\n][^\n]+)(?=\n|$)/g, (_m, _p, txt) => {
    const trimmed = txt.trim();
    if (!trimmed) return '\n';
    if (trimmed.startsWith('<')) return `\n${trimmed}`;
    return `<p>${trimmed}</p>`;
  });
  out = out.replace(/<!--CODEBLOCK_(\d+)-->/g, (_m, idx) => codeBlocks[parseInt(idx)] || '');
  return out;
}
