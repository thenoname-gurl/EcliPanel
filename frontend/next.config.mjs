/** @type {import('next').NextConfig} */
import createNextIntlPlugin from "next-intl/plugin";

const backendUrl = process.env.BACKEND_URL || "http://localhost:3001";
const wingsBase = process.env.NEXT_PUBLIC_WINGS_BASE || "http://localhost:8080";
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig = {
  poweredByHeader: false,
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    deviceSizes: [640, 750, 1080, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256],
    formats: ["image/webp", "image/avif"],
  },
  async redirects() {
    return [];
  },
  async rewrites() {
    return [
      {
        source: "/favicon.ico",
        destination: "/assets/icons/logo.png",
      },
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/public/:path*",
        destination: `${backendUrl}/public/:path*`,
      },
      {
        source: "/health",
        destination: `${backendUrl}/health`,
      },
      {
        source: "/wings/:path+",
        destination: `${wingsBase}/:path*`,
      },
      {
        source: "/uploads/:path*",
        destination: `${backendUrl}/uploads/:path*`,
      },
    ];
  },
  env: {
    NEXT_PUBLIC_API_BASE: process.env.NEXT_PUBLIC_API_BASE || backendUrl,
  },
  async headers() {
    const BE = "https://backend.ecli.app";
    const csp = [
      `default-src 'self' ${BE}`,
      `script-src 'self' ${BE} 'unsafe-inline' 'unsafe-eval'`,
      `style-src 'self' ${BE} 'unsafe-inline' https:`,
      "img-src * data: blob:",
      `font-src 'self' ${BE} data: https://fonts.gstatic.com`,
      `connect-src *`,
      `frame-src 'self' ${BE}`,
      "object-src 'none'",
      "base-uri 'self'",
      `form-action 'self' ${BE}`,
    ].join("; ");

    return [
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, immutable",
          },
        ],
      },
      {
        source: "/favicon/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
