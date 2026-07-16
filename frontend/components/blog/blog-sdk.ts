export const BLOG_SDK_VERSION = "1.0"

export interface BlogSDK {
  version: string
  theme: {
    setVar(name: string, value: string): void
    getVar(name: string): string | null
    setDarkMode(on: boolean): void
    isDarkMode(): boolean
  }
  dom: {
    onReady(fn: () => void): void
    select(selector: string): Element | null
    selectAll(selector: string): NodeListOf<Element>
    on(event: string, selector: string, handler: (e: Event, el: Element) => void): void
  }
  anim: {
    fadeIn(el: Element | string, duration?: number): Promise<void>
    fadeOut(el: Element | string, duration?: number): Promise<void>
    slideDown(el: Element | string, duration?: number): Promise<void>
    slideUp(el: Element | string, duration?: number): Promise<void>
    typewriter(el: Element | string, text: string, speed?: number): Promise<void>
    shake(el: Element | string): Promise<void>
    pulse(el: Element | string): Promise<void>
  }
  util: {
    debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T
    onScroll(fn: () => void): void
    onResize(fn: () => void): void
    now(): number
  }
}

export const SDK_DOCS: { section: string; methods: { name: string; sig: string; desc: string; example: string }[] }[] = [
  {
    section: "Theme",
    methods: [
      {
        name: "blog.theme.setVar(name, value)",
        sig: "(name: string, value: string) => void",
        desc: "Set a CSS custom property on the blog container. Use for dynamic color changes.",
        example: 'blog.theme.setVar("--my-color", "#ff0000")',
      },
      {
        name: "blog.theme.getVar(name)",
        sig: "(name: string) => string | null",
        desc: "Read a CSS custom property from the blog container.",
        example: 'const color = blog.theme.getVar("--primary")',
      },
      {
        name: "blog.theme.setDarkMode(on)",
        sig: "(on: boolean) => void",
        desc: "Toggle dark mode by adding/removing 'dark' class on the blog container.",
        example: "blog.theme.setDarkMode(true)",
      },
      {
        name: "blog.theme.isDarkMode()",
        sig: "() => boolean",
        desc: "Check if dark mode is currently active.",
        example: 'if (blog.theme.isDarkMode()) { /* ... */ }',
      },
    ],
  },
  {
    section: "DOM",
    methods: [
      {
        name: "blog.dom.onReady(fn)",
        sig: "(fn: () => void) => void",
        desc: "Run a function when the blog page is fully loaded. Safe to call multiple times.",
        example: "blog.dom.onReady(() => { console.log('Blog ready!') })",
      },
      {
        name: "blog.dom.select(selector)",
        sig: "(selector: string) => Element | null",
        desc: "Find a single element inside the blog container. Scoped - can't access panel UI.",
        example: 'const title = blog.dom.select(".blog-title")',
      },
      {
        name: "blog.dom.selectAll(selector)",
        sig: "(selector: string) => NodeListOf<Element>",
        desc: "Find all matching elements inside the blog container.",
        example: 'const cards = blog.dom.selectAll(".post-card")',
      },
      {
        name: "blog.dom.on(event, selector, handler)",
        sig: "(event: string, selector: string, handler: (e: Event, el: Element) => void) => void",
        desc: "Add a delegated event listener inside the blog container. Works for dynamically added elements.",
        example: 'blog.dom.on("click", ".post-card", (e, el) => { el.classList.toggle("expanded") })',
      },
    ],
  },
  {
    section: "Animations",
    methods: [
      {
        name: "blog.anim.fadeIn(el, duration?)",
        sig: "(el: Element | string, duration?: number) => Promise<void>",
        desc: "Fade in an element. Duration defaults to 400ms.",
        example: 'blog.anim.fadeIn(".hero", 600)',
      },
      {
        name: "blog.anim.fadeOut(el, duration?)",
        sig: "(el: Element | string, duration?: number) => Promise<void>",
        desc: "Fade out an element.",
        example: 'await blog.anim.fadeOut(".loading")',
      },
      {
        name: "blog.anim.slideDown(el, duration?)",
        sig: "(el: Element | string, duration?: number) => Promise<void>",
        desc: "Smoothly reveal a hidden element by sliding down.",
        example: 'blog.anim.slideDown(".details", 300)',
      },
      {
        name: "blog.anim.slideUp(el, duration?)",
        sig: "(el: Element | string, duration?: number) => Promise<void>",
        desc: "Smoothly hide an element by sliding up.",
        example: 'blog.anim.slideUp(".details", 300)',
      },
      {
        name: "blog.anim.typewriter(el, text, speed?)",
        sig: "(el: Element | string, text: string, speed?: number) => Promise<void>",
        desc: "Type out text character by character. Speed defaults to 50ms per character.",
        example: 'blog.anim.typewriter(".bio", "Hello, world!", 60)',
      },
      {
        name: "blog.anim.shake(el)",
        sig: "(el: Element | string) => Promise<void>",
        desc: "Shake an element briefly (like an error animation).",
        example: 'blog.anim.shake("#submit-btn")',
      },
      {
        name: "blog.anim.pulse(el)",
        sig: "(el: Element | string) => Promise<void>",
        desc: "Pulse an element (scale up and down briefly).",
        example: 'blog.anim.pulse(".badge")',
      },
    ],
  },
  {
    section: "Utilities",
    methods: [
      {
        name: "blog.util.debounce(fn, ms)",
        sig: "<T>(fn: T, ms: number) => T",
        desc: "Create a debounced version of a function. Useful for scroll/resize handlers.",
        example: "const onScroll = blog.util.debounce(() => { /* ... */ }, 200)",
      },
      {
        name: "blog.util.onScroll(fn)",
        sig: "(fn: () => void) => void",
        desc: "Run a function on window scroll (debounced at 100ms).",
        example: "blog.util.onScroll(() => { /* parallax */ })",
      },
      {
        name: "blog.util.onResize(fn)",
        sig: "(fn: () => void) => void",
        desc: "Run a function on window resize (debounced at 200ms).",
        example: "blog.util.onResize(() => { /* responsive */ })",
      },
      {
        name: "blog.util.now()",
        sig: "() => number",
        desc: "Returns Date.now(). Provided so scripts don't need Date global access.",
        example: "const start = blog.util.now()",
      },
    ],
  },
]

export function generateSdkScript(): string {
  return `
(function() {
  if (window.__blogSdk) return;
  var container = document.getElementById('blog-root');
  if (!container) return;

  function resolveEl(el) {
    if (typeof el === 'string') return container.querySelector(el);
    return el;
  }

  window.__blogSdk = {
    version: "${BLOG_SDK_VERSION}",
    theme: {
      setVar: function(name, value) { container.style.setProperty(name, value); },
      getVar: function(name) { return container.style.getPropertyValue(name) || null; },
      setDarkMode: function(on) { container.classList.toggle('dark', on); },
      isDarkMode: function() { return container.classList.contains('dark'); }
    },
    dom: {
      onReady: function(fn) {
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          setTimeout(fn, 0);
        } else {
          document.addEventListener('DOMContentLoaded', fn);
        }
      },
      select: function(sel) { return container.querySelector(sel); },
      selectAll: function(sel) { return container.querySelectorAll(sel); },
      on: function(evt, sel, fn) {
        container.addEventListener(evt, function(e) {
          var target = e.target.closest(sel);
          if (target) fn(e, target);
        });
      }
    },
    anim: {
      fadeIn: function(el, d) {
        return new Promise(function(resolve) {
          var e = resolveEl(el); if (!e) return resolve();
          var dur = d || 400;
          e.style.opacity = '0';
          e.style.display = '';
          e.style.transition = 'opacity ' + dur + 'ms ease';
          requestAnimationFrame(function() {
            e.style.opacity = '1';
            setTimeout(function() { e.style.transition = ''; resolve(); }, dur);
          });
        });
      },
      fadeOut: function(el, d) {
        return new Promise(function(resolve) {
          var e = resolveEl(el); if (!e) return resolve();
          var dur = d || 400;
          e.style.transition = 'opacity ' + dur + 'ms ease';
          e.style.opacity = '0';
          setTimeout(function() { e.style.display = 'none'; e.style.transition = ''; resolve(); }, dur);
        });
      },
      slideDown: function(el, d) {
        return new Promise(function(resolve) {
          var e = resolveEl(el); if (!e) return resolve();
          var dur = d || 400;
          e.style.overflow = 'hidden';
          e.style.display = '';
          var h = e.scrollHeight;
          e.style.height = '0';
          e.style.transition = 'height ' + dur + 'ms ease';
          requestAnimationFrame(function() {
            e.style.height = h + 'px';
            setTimeout(function() { e.style.height = ''; e.style.overflow = ''; e.style.transition = ''; resolve(); }, dur);
          });
        });
      },
      slideUp: function(el, d) {
        return new Promise(function(resolve) {
          var e = resolveEl(el); if (!e) return resolve();
          var dur = d || 400;
          e.style.overflow = 'hidden';
          e.style.height = e.scrollHeight + 'px';
          e.style.transition = 'height ' + dur + 'ms ease';
          requestAnimationFrame(function() {
            e.style.height = '0';
            setTimeout(function() { e.style.display = 'none'; e.style.height = ''; e.style.overflow = ''; e.style.transition = ''; resolve(); }, dur);
          });
        });
      },
      typewriter: function(el, text, speed) {
        return new Promise(function(resolve) {
          var e = resolveEl(el); if (!e) return resolve();
          var s = speed || 50;
          var i = 0;
          e.textContent = '';
          function type() {
            if (i < text.length) { e.textContent += text.charAt(i); i++; setTimeout(type, s); }
            else resolve();
          }
          type();
        });
      },
      shake: function(el) {
        return new Promise(function(resolve) {
          var e = resolveEl(el); if (!e) return resolve();
          e.style.transition = 'transform 0.1s ease';
          var shakes = 4;
          function tick(n) {
            if (n <= 0) { e.style.transform = ''; e.style.transition = ''; resolve(); return; }
            var x = (n % 2 === 0 ? 4 : -4);
            e.style.transform = 'translateX(' + x + 'px)';
            setTimeout(function() { tick(n - 1); }, 80);
          }
          tick(shakes);
        });
      },
      pulse: function(el) {
        return new Promise(function(resolve) {
          var e = resolveEl(el); if (!e) return resolve();
          e.style.transition = 'transform 0.3s ease';
          e.style.transform = 'scale(1.08)';
          setTimeout(function() {
            e.style.transform = 'scale(1)';
            setTimeout(function() { e.style.transition = ''; resolve(); }, 300);
          }, 150);
        });
      }
    },
    util: {
      debounce: function(fn, ms) {
        var timer;
        return function() { var ctx = this, args = arguments; clearTimeout(timer); timer = setTimeout(function() { fn.apply(ctx, args); }, ms); };
      },
      onScroll: function(fn) { window.addEventListener('scroll', window.__blogSdk.util.debounce(fn, 100)); },
      onResize: function(fn) { window.addEventListener('resize', window.__blogSdk.util.debounce(fn, 200)); },
      now: function() { return Date.now(); }
    }
  };
})();
`.trim()
}

export function wrapUserScript(code: string): string {
  return `
<script>
(function() {
  var blog = window.__blogSdk;
  if (!blog) return;
  try {
    ${code}
  } catch (e) {
    console.warn('[Blog Script Error]', e.message);
  }
})();
</script>
`.trim()
}