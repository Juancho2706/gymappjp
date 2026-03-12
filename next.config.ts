import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

process.env.SERWIST_SUPPRESS_TURBOPACK_WARNING = "1";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV !== "production",
});

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {}, // Suppress Next.js 16 Turbopack strict mode error
  images: {
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
      }
    ],
  },
};

export default withSerwist(nextConfig);
