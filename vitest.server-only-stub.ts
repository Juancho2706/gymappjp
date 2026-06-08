// No-op stub for the `server-only` package under Vitest.
// The real package throws if imported outside a React Server Component, which breaks unit tests
// that transitively import server modules (e.g. lib/storage/checkin-photos.ts). The server/client
// boundary is still enforced at build time by Next.js — this only neutralizes it for tests.
export {}
