# Estado del port 1:1 PWA → React Native (corrida nocturna)

> Documento vivo. Se actualiza y pushea en cada checkpoint. Si la sesión muere,
> retomar leyendo este archivo desde la sección "Dónde retomar".

**Branch de trabajo:** `claude/new-branch-rnmobile-x6qxw6`
**Metodología:** olas por sección — inventario → spec con evidencia (citas de archivo:línea del código web) → implementación contra la spec → verificación adversarial hasta 2 rondas consecutivas en cero → typecheck/lint → commit+push.

## Orden de secciones

| # | Sección | Estado |
|---|---------|--------|
| 0 | Fundación: tokens no-color + paridad de componentes compartidos | 🔄 en curso |
| 1 | Vista de workout del alumno (inputs kg/reps + barras RIR/RPE) | ⏳ pendiente |
| 2 | Dashboard del alumno completo | ⏳ pendiente |
| 3 | Dashboard del coach completo | ⏳ pendiente |
| 4 | Nutrición (coach y alumno) | ⏳ pendiente |
| 5 | Builder del coach | ⏳ pendiente |
| 6 | Resto de secciones descubiertas en inventario | ⏳ pendiente |

## Hechos establecidos (reconocimiento)

- Web fuente de verdad: `apps/web/src/app` — coach en `coach/*`, alumno en `c/[coach_slug]/*`.
- Mobile: `apps/mobile/app` (Expo Router), componentes en `apps/mobile/components`.
- Paridad de tokens de COLOR ya gobernada: `pnpm check:tokens` pasa (86 tokens, claro+oscuro). Contrato: `specs/redesign-eva-ds/token-contract.md`. La Ola 0 cubre lo NO gobernado: tipografía, tamaños, espaciados, radios, sombras.
- Superficies web sin contraparte mobile (fuera de alcance): landing, admin, enterprise, org, pricing.

## Dónde retomar

Ola 0 en curso. Si murió a mitad: revisar `docs/rn-port/foundation.md` (si existe, la ola avanzó) y el último commit pusheado.

## Decisiones tomadas

(ninguna aún)

## Hallazgos pendientes / bloqueos

(ninguno aún)
