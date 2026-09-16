// @eva/client-dossier — modelo PURO del dossier del alumno (sin IO, sin Next.js, sin Supabase,
// sin React/RN). Lo consumen los DOS generadores de PDF (web jsPDF y RN HTML) y el service web.
// Testeable con vitest: `packages/client-dossier/src/*.test.ts` entra a la suite por el patrón
// `packages/**/*.test.ts` de vitest.config.ts.
export * from './src/index'
