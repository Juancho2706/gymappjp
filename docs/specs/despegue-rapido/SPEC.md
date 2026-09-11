---
status: active
owner: product-engineering
last_verified: "2026-09-11"
canonical: false
---

# SPEC — Despegue rápido (Sentry `EVA-NEXTJS-1P/1Q` + `EVA-MOBILE-F`)

Tren chico del 2026-09-11 (owner: «sigue con arreglar las cosas de Sentry pero verificando no romper
nada y que de verdad el problema estaba»). Investigación del jefe + un lector; evidencia abajo.

## El problema, con evidencia

La ceremonia «Despegue» (overlay que tapa la carga del ejecutor V3) espera señales del ejecutor y a
los 4,6 s se rinde: pinta «ESTO ESTÁ TARDANDO / TOCAR PARA ENTRAR IGUAL» y fuerza `ready`. Cada vez
que eso pasa se emite un aviso a Sentry.

| Issue | Plataforma | Eventos / alumnos (14 d) | Evidencia del último evento |
|---|---|---|---|
| `EVA-MOBILE-F` `exec-v3-despegue-force-ready-sin-escena` | RN | 7 / 4 (02–11-09, builds 1.1.2+86 y +59) | Galaxy S24, red celular, `viaMorph: "fresh"`, `elapsedMs: 4715`, `launch_duration: 6023` |
| `EVA-NEXTJS-1P` «fallback 4.6s ganó la carrera — ejecutor sin señal» | web | 10 / 8 (02–09-09) | Chrome Android, `routeReady: true`, `execReady: false`, `effectiveType: "3g"`, `online: true`, `sinceLaunchMs: 4604` |
| `EVA-NEXTJS-1Q` «— ambas señales» | web | 1 / 1 (11-09) | iOS Safari, `url` = el dashboard ⇒ el `router.push` nunca commiteó |

Lectura: **no es un bug de lógica, es el waterfall de carga**. En RN el ejecutor montó vía Despegue
(`fresh`) pero `loading` seguía en `true`: `useWorkoutSession` (`apps/mobile/lib/workout-session.ts`)
hace `await clientPromise` (perfil ⇒ `auth.getUser()` de red) ANTES de pintar desde la caché offline
del plan, y `ExecutorV3` solo avisa «escena lista» con `loading === false`. En web la ruta commiteó
(`routeReady: true`) pero `WorkoutExecutionClient` (~208 KB) no hidrató en 3G dentro de los 3,3 s que
quedan tras la animación; además la señal solo sale si la marca vía-morph sobrevivió
(`sessionStorage`), así que en modo privado o con TTL vencido no sale nunca.

Consecuencias visibles para el alumno: el copy degradado; si el ejecutor monta después de 10 s
(`MORPH_TTL_MS`) se repite el splash `SessionIntro` después del Despegue; en 1Q vuelve a ver el
dashboard. No hay pérdida de datos. Las OTAs del 10/11-09 no lo causaron (MOBILE-F arranca el
02-09; `session-morph.tsx` solo cambió de forma aditiva).

## Requisitos

- **R1 (RN, B1)** — Con el plan en caché, el ejecutor pinta y baja `loading` ANTES de esperar auth y
  perfil. El server sigue siendo la fuente de verdad después. Los efectos que dependen de `clientId`
  siguen esperándolo.
- **R2 (web, B3)** — La señal `eva:exec-v3-ready` sale también cuando la marca vía-morph se perdió
  pero la ceremonia sigue activa (`isCeremonyActive()`), en cualquier fase.
- **R3 (ambas, B4)** — `MORPH_TTL_MS` 10 s → 20 s: un ejecutor que monta a los 11 s no repite el splash.
- **R4 (telemetría honesta)** — web: `routeReady` solo con el pathname del destino (hoy el botón
  «atrás» cuenta como ruta commiteada e infla 1P); ambas: no reportar con la app/pestaña en
  background; web: `navigationType`, `ceremonyAttr`, `storageOk`, `visibility` en el `extra`; RN:
  `hasPlanCache` y `appState` si sale barato.
- **No se sube el timeout de 4,6 s**: es la única válvula que evita atrapar al alumno; subirlo esconde
  el síntoma.

## Fuera de alcance (backlog)

- Timeout global al cliente Supabase de RN (afectaría subidas de fotos y check-ins; se descarta).
- La ruta web `/c/:slug/workout/:planId` encadena ~4 olas / ~13 queries sin `revalidate`; el payload
  RSC viaja duplicado. Es la causa de fondo del 1P en 3G y merece su propio tren (medir TTFB primero).
- `subscribeMorphScene` guarda un solo listener (frágil si conviven dos overlays).

## QA del owner

1. RN, con el plan ya abierto alguna vez (caché) y datos móviles: tocar «Empezar» ⇒ el Despegue se
   despide solo, sin «ESTO ESTÁ TARDANDO».
2. RN, modo avión con plan en caché ⇒ el ejecutor abre con el plan; sin caché ⇒ el fallback a 4,6 s
   sigue dejando entrar.
3. Web, Safari en modo privado ⇒ el Despegue se despide al aparecer el Inicio, sin fallback.
4. Web, tocar «atrás» durante el Despegue ⇒ vuelve al dashboard sin overlay pegado (ABORTO intacto).
5. Sentry a 72 h (~14-09): `EVA-MOBILE-F` y `EVA-NEXTJS-1P` deben bajar; lo que quede trae
   `hasPlanCache`/`navigationType` para separar red de código.
