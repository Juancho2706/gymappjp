import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

const securityHeaders = [
  { key: 'X-Frame-Options',          value: 'DENY' },
  { key: 'X-Content-Type-Options',   value: 'nosniff' },
  { key: 'X-DNS-Prefetch-Control',   value: 'on' },
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  // HSTS: 2 años, subdomains — sin preload (irreversible, agregar solo cuando estemos seguros)
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
]

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ]
  },
  // Proxy PostHog through our domain to bypass adblockers.
  // Path /ph/* maps to the PostHog ingestion endpoint.
  async rewrites() {
    return [
      { source: '/ph/static/:path*', destination: `${POSTHOG_HOST}/static/:path*` },
      { source: '/ph/array/:path*',  destination: `${POSTHOG_HOST}/array/:path*` },
      { source: '/ph/:path*',        destination: `${POSTHOG_HOST}/:path*` },
    ]
  },
  skipTrailingSlashRedirect: true,
  reactCompiler: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    optimizePackageImports: ['framer-motion', 'recharts', '@lottiefiles/react-lottie-player', 'lucide-react', '@eva/schemas', '@eva/types', '@eva/tokens'],
  },
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        // Cubre /object/public/** y /object/sign/** (signed URLs de buckets privados: checkins, team-health-docs).
        protocol: 'https',
        hostname: 'jikjeokundmaafuytdcx.supabase.co',
        pathname: '/storage/v1/object/**',
      },
      {
        protocol: 'http',
        hostname: '127.0.0.1',
        port: '54321',
        pathname: '/storage/v1/object/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '54321',
        pathname: '/storage/v1/object/**',
      },
      {
        protocol: 'https',
        hostname: 'v2.exercisedb.io',
      },
      {
        protocol: 'https',
        hostname: 'exercisedb-api.vercel.app',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
      },
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      }
    ],
  },
};

export default withSentryConfig(nextConfig, {
    org: process.env.SENTRY_ORG ?? 'eva-zs',
    project: process.env.SENTRY_PROJECT ?? 'eva-nextjs',
    silent: !process.env.CI,
    widenClientFileUpload: true,
    tunnelRoute: '/monitoring',
    sourcemaps: { disable: false },
    webpack: {
      treeshake: {
        removeDebugLogging: true,
      },
      automaticVercelMonitors: false,
    },
});
