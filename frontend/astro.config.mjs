import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react(), sitemap()],
  site: process.env.SITE_URL || 'https://ecli.app',
  security: {
    checkOrigin: false,
    csp: false,
  },

  vite: {
    plugins: [tailwindcss()],
    resolve: {
      alias: {
        '@': __dirname,
        'monaco-editor/esm/vs/editor/editor.api.js': path.join(__dirname, 'node_modules/monaco-editor/esm/vs/editor/editor.api.js'),
        'next/link': path.join(__dirname, 'components/shims/Link.tsx'),
        'next/navigation': path.join(__dirname, 'components/shims/navigation.ts'),
        'next-intl': path.join(__dirname, 'components/shims/i18n.tsx'),
        'next-intl/server': path.join(__dirname, 'components/shims/i18n-server.ts'),
        'next/dynamic': path.join(__dirname, 'components/shims/dynamic.tsx'),
        'next/image': path.join(__dirname, 'components/shims/image.tsx'),
        'next/dist/client/link': path.join(__dirname, 'components/shims/Link.tsx'),
        'next/font/google': path.join(__dirname, 'components/shims/font.ts'),
      },
    },
    define: {
      'process.env.NEXT_PUBLIC_API_BASE': JSON.stringify(process.env.NEXT_PUBLIC_API_BASE || process.env.PUBLIC_API_BASE || ''),
      'process.env.NEXT_PUBLIC_BACKEND_URL': JSON.stringify(process.env.NEXT_PUBLIC_BACKEND_URL || process.env.PUBLIC_BACKEND_URL || ''),
      'process.env.NEXT_PUBLIC_COMMIT_SHA': JSON.stringify(process.env.NEXT_PUBLIC_COMMIT_SHA || process.env.PUBLIC_COMMIT_SHA || ''),
      'process.env.NEXT_PUBLIC_REPO_URL': JSON.stringify(process.env.NEXT_PUBLIC_REPO_URL || process.env.PUBLIC_REPO_URL || ''),
      'process.env.NEXT_PUBLIC_HACKCLUB_STUDENT_ENABLED': JSON.stringify(process.env.NEXT_PUBLIC_HACKCLUB_STUDENT_ENABLED || process.env.PUBLIC_HACKCLUB_STUDENT_ENABLED || 'false'),
      'process.env.NEXT_PUBLIC_SITE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || ''),
      
      'process.env.BACKEND_URL': JSON.stringify(process.env.BACKEND_URL || ''),
      'process.env.GITHUB_STUDENT_ENABLED': JSON.stringify(process.env.GITHUB_STUDENT_ENABLED || 'false'),
    },
    ssr: {
      noExternal: [
        '@radix-ui/react-accordion', '@radix-ui/react-alert-dialog', '@radix-ui/react-avatar',
        '@radix-ui/react-checkbox', '@radix-ui/react-collapsible', '@radix-ui/react-context-menu',
        '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-hover-card',
        '@radix-ui/react-label', '@radix-ui/react-menubar', '@radix-ui/react-navigation-menu',
        '@radix-ui/react-popover', '@radix-ui/react-progress', '@radix-ui/react-radio-group',
        '@radix-ui/react-scroll-area', '@radix-ui/react-select', '@radix-ui/react-separator',
        '@radix-ui/react-slider', '@radix-ui/react-slot', '@radix-ui/react-switch',
        '@radix-ui/react-tabs', '@radix-ui/react-toast', '@radix-ui/react-toggle',
        '@radix-ui/react-toggle-group', '@radix-ui/react-tooltip',
        'next-themes', 'sonner', 'vaul', 'cmdk', 'embla-carousel-react', 'framer-motion', 'recharts',
      ],
    },
  },

  server: {
    host: process.env.HOST || '0.0.0.0',
    port: parseInt(process.env.PORT || '3001'),
  },
});
