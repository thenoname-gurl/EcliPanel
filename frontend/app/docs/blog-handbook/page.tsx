import { Md } from "../_components/md"

const content = `
# Blog Handbook

Everything you need to write, style and customise your blog on EcliPanel!

## Writing posts

Posts use Markdown. You can write in the text editor with the formatting toolbar above it.

### Text formatting

| You type | You get |
|---|---|
| \`**bold**\` | **bold** |
| \`_italic_\` | *italic* |
| \`__underline__\` | underlined |
| \`\` \` code \` \` \` | \`inline code\` |
| \`> quote\` | indented blockquote |

### Title formatting

Titles support extra styling that regular text does not:

| Syntax | Effect |
|---|---|
| \`**bold**\` | Bold text |
| \`_italic_\` | Italic text |
| \`__underline__\` | Underlined text |
| \`~red:text~\` | Coloured text (any CSS colour name or hex) |
| \`~red underline:text~\` | Red underline only (text stays default colour) |
| \`~blue bold:text~\` | Blue bold text |
| \`:: whisper\` | Small grey subtitle below the title |

You can combine them. When sharing on social media or in search results, all formatting is automatically stripped so the title looks clean.

### Structure

| You type | You get |
|---|---|
| \`## Heading\` | Large section heading |
| \`### Subheading\` | Smaller subheading |
| \`- item\` | Bullet list |
| \`1. item\` | Numbered list |
| \`![alt](url)\` | Image |
| \`[text](url)\` | Clickable link |

### Images

Upload images using the toolbar button or paste directly from your clipboard. Uploaded images are stored on the panel. External images are automatically proxied through the panel to protect visitor privacy.

### Videos

Add a video by typing \`:::video URL\` on its own line. YouTube and Vimeo URLs are supported.

## Customising your blog

### Theme

Go to **Blog > Settings > Theme** to pick a preset from the EcliPanel theme collection. All 13 panel themes are available. You can tweak colours, fonts, and add custom CSS.

### Page builder

Go to **Blog > Builder** to design your blog landing page layout. Available sections:

- **Header** — blog name, description, cover image, subscribe button
- **Hero** — large centred title with optional background
- **Post Grid** — card grid of recent posts
- **Post List** — vertical list of posts with excerpts
- **Search Bar** — lets visitors search your posts by title or tags
- **About** — rich text section for your bio or blog description
- **Video** — YouTube or Vimeo embed
- **Custom HTML** — raw HTML (scripts and event handlers are automatically stripped)
- **Script** — JavaScript using the safe Blog SDK

Drag sections to reorder them with the arrow buttons. Click **Configure** on any section to adjust its settings.

### Members

Go to **Blog > Members** to add other users as authors on your blog. Each member can set their own display name, avatar, and bio for this blog only — their panel identity stays private.

Roles:
- **Owner** — full control
- **Admin** — manage members and write posts
- **Author** — write posts

### Content flags

You can mark your blog or individual posts as Mature (NSFW) or Political. Flagged posts show a warning card on the blog listing with a preview of the title and excerpt. Visitors must click **Show content** to reveal the full post. When visiting a flagged post directly, a confirmation dialog appears first.

## Blog SDK (scripts)

The **Script** section in the page builder lets you run JavaScript on your blog. The code has access to a \`blog\` object with safe APIs.

### Security

Your script runs inside a sandbox:
- Only the \`blog\` object is available. \`fetch\`, \`XMLHttpRequest\`, \`localStorage\`, \`document.cookie\` are all blocked by the browser sandbox.
- All DOM access is scoped to your blog container (\`#blog-root\`). You cannot read or modify the panel UI or other pages.
- Scripts from the Custom HTML section are stripped. Use the Script section for JavaScript.

### blog.theme

\`blog.theme.setVar(name, value)\`
Set a CSS custom property on your blog container. Use it for dynamic style changes.

\`blog.theme.getVar(name)\`
Read a CSS custom property. Returns \`null\` if not set.

\`blog.theme.setDarkMode(on)\`
Toggle dark mode by adding or removing the \`dark\` class on the container. Pass \`true\` or \`false\`.

\`blog.theme.isDarkMode()\`
Check if dark mode is currently active. Returns \`true\` or \`false\`.

### blog.dom

\`blog.dom.onReady(fn)\`
Run a function after the page loads. Safe to call multiple times — each callback fires in order.

\`blog.dom.select(selector)\`
Find an element inside your blog. Like \`document.querySelector\` but scoped.

\`blog.dom.selectAll(selector)\`
Find all matching elements. Like \`document.querySelectorAll\` but scoped.

\`blog.dom.on(event, selector, handler)\`
Add a delegated event listener. Works for elements added after page load.

### blog.anim

All animation methods accept either an element or a CSS selector string. They return a Promise that resolves when the animation finishes.

\`blog.anim.fadeIn(el, duration?)\`
Fade in. Duration defaults to 400ms.

\`blog.anim.fadeOut(el, duration?)\`
Fade out and hide the element.

\`blog.anim.slideDown(el, duration?)\`
Smoothly reveal a hidden element.

\`blog.anim.slideUp(el, duration?)\`
Smoothly hide an element.

\`blog.anim.typewriter(el, text, speed?)\`
Type text character by character. Speed defaults to 50ms per character.

\`blog.anim.shake(el)\`
Shake an element briefly — good for error feedback.

\`blog.anim.pulse(el)\`
Quick scale pulse — good for attention.

### blog.util

\`blog.util.debounce(fn, ms)\`
Create a debounced function. Useful for scroll or resize handlers.

\`blog.util.onScroll(fn)\`
Run a function on scroll, debounced at 100ms.

\`blog.util.onResize(fn)\`
Run a function on resize, debounced at 200ms.

\`blog.util.now()\`
Returns \`Date.now()\`.

### Examples

**Dark mode toggle:**
\`\`\`
blog.dom.onReady(() => {
  const btn = blog.dom.select('#dark-toggle')
  if (!btn) return
  if (blog.theme.isDarkMode()) btn.textContent = 'Light'
  blog.dom.on('click', '#dark-toggle', () => {
    const dark = !blog.theme.isDarkMode()
    blog.theme.setDarkMode(dark)
    btn.textContent = dark ? 'Light' : 'Dark'
  })
})
\`\`\`

**Staggered fade-in for post cards:**
\`\`\`
blog.dom.onReady(async () => {
  const cards = blog.dom.selectAll('.post-card')
  for (const card of cards) {
    await blog.anim.fadeIn(card, 300)
    await new Promise(r => setTimeout(r, 100))
  }
})
\`\`\`

**Simple parallax:**
\`\`\`
blog.util.onScroll(() => {
  const hero = blog.dom.select('.hero')
  if (hero) hero.style.transform = \`translateY(\${window.scrollY * 0.4}px)\`
})
\`\`\`

## Comments

Visitors can comment on posts at the bottom of each post page. Comments use the same anonymous chat system as the rest of EcliPanel. You can post anonymously with a custom name, or check **Post as myself** to show your blog member profile. Images can be uploaded in comments. Comments load 10 per page, newest first.
`

export default function BlogHandbookPage() {
  return <Md>{content}</Md>
}
