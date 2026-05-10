import type { NextConfig } from "next";

const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com'

const nextConfig: NextConfig = {
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
    optimizePackageImports: ['framer-motion', 'recharts', '@lottiefiles/react-lottie-player', 'lucide-react'],
  },
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'jikjeokundmaafuytdcx.supabase.co',
        pathname: '/storage/v1/object/public/**',
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

export default nextConfig;
