import { describe, expect, it } from 'bun:test';
import { escapeHtml, markdownToHtml } from '../../src/utils/markdown';

describe('markdown utilities', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<')).toBe('&lt;');
      expect(escapeHtml('>')).toBe('&gt;');
      expect(escapeHtml('&')).toBe('&amp;');
      expect(escapeHtml('"')).toBe('&quot;');
      expect(escapeHtml("'")).toBe('&#39;');
    });

    it('should escape combined HTML characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
      );
    });

    it('should return empty string for null/undefined', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should convert non-string values to string', () => {
      expect(escapeHtml(123)).toBe('123');
      expect(escapeHtml(0)).toBe('0');
      expect(escapeHtml(true)).toBe('true');
    });
  });

  describe('markdownToHtml', () => {
    it('should return empty string for falsy values', () => {
      expect(markdownToHtml('')).toBe('');
      expect(markdownToHtml(null)).toBe('');
      expect(markdownToHtml(undefined)).toBe('');
    });

    it('should convert bold text', () => {
      expect(markdownToHtml('**bold text**')).toContain('<strong>bold text</strong>');
    });

    it('should convert italic text', () => {
      expect(markdownToHtml('*italic text*')).toContain('<em>italic text</em>');
    });

    it('should convert strikethrough text', () => {
      expect(markdownToHtml('~~strikethrough~~')).toContain('<del>strikethrough</del>');
    });

    it('should convert inline code', () => {
      expect(markdownToHtml('`code`')).toContain('<code>code</code>');
    });

    it('should convert code blocks with language', () => {
      const result = markdownToHtml('```js\nconst x = 1;\n```');
      expect(result).toContain('const x = 1;');
    });

    it('should convert headings', () => {
      expect(markdownToHtml('# Heading 1')).toContain('<h1>Heading 1</h1>');
      expect(markdownToHtml('## Heading 2')).toContain('<h2>Heading 2</h2>');
      expect(markdownToHtml('### Heading 3')).toContain('<h3>Heading 3</h3>');
    });

    it('should convert links with http/https/mailto URLs', () => {
      const result = markdownToHtml('[link](https://example.com)');
      expect(result).toContain('<a href="https://example.com"');
      expect(result).toContain('>link</a>');

      const httpResult = markdownToHtml('[link](http://example.com)');
      expect(httpResult).toContain('<a href="http://example.com"');

      const mailtoResult = markdownToHtml('[email](mailto:test@example.com)');
      expect(mailtoResult).toContain('<a href="mailto:test@example.com"');
    });

    it('should sanitize javascript: URLs in links', () => {
      const result = markdownToHtml('[link](javascript:alert(1))');
      expect(result).not.toContain('javascript:');
      expect(result).toContain('href=""');
    });

    it('should convert images with http/https URLs', () => {
      const result = markdownToHtml('![alt](https://example.com/img.png)');
      expect(result).toContain('<img src="https://example.com/img.png"');
      expect(result).toContain('alt="alt"');
    });

    it('should convert list items', () => {
      const result = markdownToHtml('- item 1');
      expect(result).toContain('<li>item 1</li>');
    });

    it('should wrap plain text in paragraphs', () => {
      const result = markdownToHtml('plain text');
      expect(result).toContain('<p>plain text</p>');
    });
  });
});
