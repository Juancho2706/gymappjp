# VERIFY/FIX — `ficha-overview-progreso`

Fecha: 2026-07-12

## Estado

Unidad cerrada a nivel código/spec. `Resumen`, `Progreso` y
`WeeklyPRBanner` fueron recorridos sección por sección contra las fuentes web
citadas en la spec. R7 terminó sin P0/P1/P2 accionables.

## Resumen

- Replica los tres anillos de cumplimiento, cinco KPI, programa activo/vacío,
  fases compactas, señal de nutrición, métricas clave y editor de biometría.
- Recupera hábitos 7d, último check-in con revisión optimista reversible,
  evolución visual, módulos entitled y CTA final de edición.
- Cumplimiento de hoy usa comidas aplicables del plan activo. Timeline y
  promedio mensual usan solo logs reales y el denominador crudo del web; no se
  inventan días. Logs de otro plan conservan snapshot y no reciben macros del
  plan actual.
- Target semanal cuenta solo planes con bloques de la variante A/B efectiva.
  Check-in usa `created_at`, caída lineal a 0 en 7d y calendario Santiago.
- Top alert recibe check-ins ordenados y un instante real del último entreno.

## Progreso

- Replica tendencia de peso, delta 7d, proyección, cinco statboxes, IMC,
  energía, objetivo, comparador de fotos e historial completo de check-ins.
- Comparador usa selectores Base/Comparar, sheet `nativeModal`, imágenes
  `contain`, slider 0–100 y controles accesibles.
- Body composition respeta OFF/managed/enterprise, BIA e ISAK separados,
  última medición, métricas, deltas, curvas con fecha/tooltip, historial y
  borrado. JSON ISAK legado/parcial se normaliza sin tumbar el tab.
- Charts honran reduced-motion y exponen puntos recorribles al lector de
  pantalla. Fechas y claves de día usan Santiago.

## Seguridad y workspace

- Ficha, biometría, revisión de check-in y bodycomp llevan el workspace RN
  explícito; servidor revalida bearer, membresía/asignación y ownership.
- Bodycomp usa cliente token-scoped para que RLS siga siendo el techo. Mantiene
  kill-switch, entitlement, consentimiento team, filtros de tenant y access log.
  Enterprise queda fail-closed porque el módulo no se ofrece en ese contexto.
- Workspace activo permanece como preferencia local exacta. No se persiste una
  selección team falsa en servidor: el esquema actual no tiene `last_team_id`.
  Entitlements y operaciones reciben el scope explícito.
- No se tocó `apps/mobile/app/alumno` ni `components/alumno`.

## Decisión de supersets RN

La orden CEO vigente exige igualdad visual con el responsive/PWA. Por eso no se
restauraron extras visibles antiguos (heatmap adicional, KPI extra, pager del PR
o estados de herramientas no presentes en web). Mejoras nativas invisibles o de
plataforma —haptics, safe areas, accesibilidad, `nativeModal`— siguen permitidas.

## Gates

- `pnpm exec tsc --noEmit` mobile — PASS.
- `pnpm exec tsc --noEmit` web — PASS.
- `node scripts/check-token-parity.mjs` — PASS, 86/86.
- Vitest focalizado — PASS, 11 archivos / 120 tests.
- `pnpm exec expo export --platform android` — PASS.
- `git diff --check` — PASS.
- Smoke device light/dark × EVA/custom — pendiente de build/device.
