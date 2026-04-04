/** @type {import('next').NextConfig} */
import createNextIntlPlugin from 'next-intl/plugin';

const backendUrl = process.env.BACKEND_URL || 'http://localhost:3001';
const wingsBase = process.env.NEXT_PUBLIC_WINGS_BASE || 'http://localhost:8080';
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: '/public/:path*',
        destination: `${backendUrl}/public/:path*`,
      },
      {
        source: '/wings/:path+',
        destination: `${wingsBase}/:path*`,
      },
      {
        source: '/uploads/:path*',
        destination: `${backendUrl}/uploads/:path*`,
      },
    ]
  },
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || backendUrl,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        ],
      },
    ];
  },
}

export default withNextIntl(nextConfig)
