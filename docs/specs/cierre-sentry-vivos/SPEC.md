---
status: draft
owner: product-engineering
last_verified: "2026-08-31"
canonical: false
---

# SPEC — Cierre de los issues VIVOS de Sentry (web + mobile)

> **Draft del 2026-08-31.** No es una feature: es el cierre ordenado de la deuda de errores en
> producción. El valor está tanto en lo que se arregla como en lo que se declara **ya arreglado** y
> deja de ocupar el tablero.

## 1. Problema

El tablero de Sentry mostraba **24 issues abiertos**, y la lectura ingenua de esa cifra llevaba a
planificar trabajo sobre bugs que ya no existen. Cruzando la volumetría **por release** contra el
historial de git quedó claro que la mayoría son fantasmas: Sentry no cierra un issue solo porque
dejó de ocurrir.

**Los conteos de eventos son reales.** `instrumentation-client.ts` define `tracesSampleRate: 0.1`
(rendimiento) y `replaysSessionSampleRate: 0.0`, pero **NO** define `sampleRate` — el de errores, cuyo
default del SDK es `1.0`. El `client_sample_rate: 0.1` que aparece en el contexto `trace` de un evento
es metadata de la traza, no una tasa de descarte de errores. *(Corregido tras la crítica: durante la
auditoría se multiplicó por 10 sin respaldo.)*

## 2. Estado verificado (2026-08-31)

### 2.1 Ya cerrados — NO se toca código

Cada uno con su motivo REAL. No todos comparten causa, y atribuirlos al mismo commit era falso:

| Issue | Último evento | Motivo verificado |
|---|---|---|
| `EVA-NEXTJS-Y` · `9` | 05-08 | `01a11a52` «la sesión caída ya no rompe la acción del alumno» (08-08). 23 días y ~15 releases sin un evento. |
| `EVA-NEXTJS-S` | 06-08 | **Ruido conocido y ya filtrado a propósito.** Es el texto de Safari para un fetch abortado (el prefetch de un `<Link>` que muere al navegar). `instrumentation-client.ts:67` lo tiene en `ignoreErrors` desde `02a13c5c` (23-08), con nota «91 eventos, 0 usuarios impactados». **NO lo arregló `01a11a52`**, y desde el filtro la verificación por conteo de eventos es ciega: se cierra por diagnóstico, no por volumetría. |
| `EVA-NEXTJS-W` | 07-08 | **Chunk obsoleto tras un deploy** (`Module … factory not available`, runtime de Turbopack): el usuario tenía la pestaña abierta cuando salió una versión nueva. Nada que ver con `01a11a52`. Se cierra con esa nota y se re-evalúa si reaparece. |
| `EVA-NEXTJS-15` (Turnstile) | 05-08 | `e190f045` / `02a13c5c` (23-08) |
| `EVA-NEXTJS-16` · `17` | 05/06-08 | Nunca reaparecieron en releases nuevos |
| `EVA-MOBILE-7` | 06-08 en `1.1.0+80` | `7ccf7a07`, **del mismo día** |
| `EVA-MOBILE-8` | solo `1.1.0+54` | Lo cerró el binario 1.1.1 |

### 2.2 No son bugs

- **`EVA-NEXTJS-12` / `13`** — `reportWorkoutQueueDiscards()` (`report-discards.ts:45`, con test)
  emite ese `captureMessage` **a propósito** en cada descarte permanente legítimo. Es telemetría de
  salud funcionando como fue diseñada. No se pierde ningún dato que el alumno pueda recuperar.
- **`EVA-NEXTJS-1M`** — firma de extensión de navegador (Grammarly) en `/privacidad`. Sin
  stacktrace, 0 usuarios.

### 2.3 Vivos con fix propio

| Issue | Release | Causa raíz verificada |
|---|---|---|
| `EVA-MOBILE-9` | `1.1.2+86` | `load()` (`workout-session.ts:565`) encadena en serie `getClientProfile()` (I/O real) → `workout_plans` → `workout_programs` condicional → `Promise.all`. **Y no tiene `try/catch`: se dispara con `void load()` sin `.catch()`, así que cualquier excepción deja `loading=true` para siempre** y el único rescate es el fallback de 4,6 s que emite el propio evento. |
| `EVA-MOBILE-A` | `1.1.2+86` | `settings/brand.tsx:342` usa `allowsEditing:true, aspect:[1,1]`, que en Android abre `ExpoCropImageActivity` y devuelve un URI que puede expirar → `ENOENT`. Es el **único** call site vivo con ese patrón en `apps/mobile`. |
| `EVA-MOBILE-D` | `1.1.1+57` | `ProgramConfigSheet.tsx:61` llama `setStructureType` solo; el `useEffect` que reconcilia `days` (`program-builder.tsx:1238`) corre **después** del commit. Con `cycleLength > 7` y Ciclo→Semanal hay un render con `structureType='weekly'` y `days` con ids 8-14 ⇒ `DAY_SHORT[8..14]` es `undefined` ⇒ `.slice()` explota en `renderDayTab:1279`. Sin ErrorBoundary propio: **remonta la app entera.** |
| `EVA-NEXTJS-8` | `9063ea37` | `audioUtils.ts` crea un `AudioContext` por sonido (`:12`, `:40`), nunca llama `close()`, y `resume()` (`:13`, `:44`) no tiene `catch`. Por ciclo de descanso: 3 beeps + alarma con hasta 4 repeticiones ⇒ **hasta 8 contextos**; en una sesión de 15-20 series, **60-160+ vivos**. WebKit limita contextos concurrentes. |

### 2.4 Vivos SIN fix propio

`EVA-MOBILE-E` y `B` — `EXC_BREAKPOINT` en `GrResourceCache`. Los stacks reales muestran `E` en el
thread `hades` (el GC de Hermes finalizando un `HostObject` de Skia) y `B` en el main thread dentro
de un `requestRedraw` encolado: es una **carrera de threads dentro de `react-native-skia`**
(`2.2.12`, pineado desde mayo). `AppBackground.tsx` monta `Canvas` + `Blur` con dos animaciones
infinitas en 30+ pantallas, así que la exposición es app-wide. No hay fix de código de aplicación
con garantía.

## 3. Alcance

**Entra:** `EVA-NEXTJS-8`, `EVA-MOBILE-9`, `EVA-MOBILE-A`, `EVA-MOBILE-D`, el filtro de `1M`, y el
housekeeping de los 9 ya cerrados.

**No entra, con razón declarada:**

- **Portar `signalsReady`/`degraded` a `session-morph.tsx`** (el fallback móvil sigue diciendo
  «LISTO» sin distinguir señal real de rescate, igual que hacía la web hasta hoy). Es **cambio
  visible ⇒ exige mockup y aprobación del owner** antes de tocarlo.
- **Colapsar las dos lecturas de `resolveStudentAccessForClient`.** Ganancia ~40 ms contra el riesgo
  de que un embed no resuelto caiga al `catch` fail-OPEN y **apague en silencio el gate de acceso de
  alumnos**. Mala relación valor/riesgo.
- **Reducir la exposición a Skia** (que `AppBackground` deje de remontarse por pantalla). Toca el
  contrato visual D4 ya aprobado; sería un spike con mockup, no un fix.
- **`noUncheckedIndexedAccess` en `apps/mobile`.** Habría detectado `EVA-MOBILE-D` en compilación,
  pero encenderlo hoy rompe el typecheck en cientos de sitios. Va a su propio tren.

## 4. Decisiones de diseño

**D1 — El audio NO va a singleton.** Era la propuesta obvia y es **peor**: si WebKit fuerza el
contexto a `closed` tras un backgrounding, `createOscillator()` lanza una excepción síncrona que el
`catch` existente se traga en silencio ⇒ **el alumno se queda sin alarma para siempre y sin una sola
traza en Sentry**. Se mantiene el contexto efímero (contrato intacto) y se agrega `close()` cuando el
sonido termina, más `catch` en `resume()`.

**D2 — El logo sigue siendo cuadrado, pero el recorte pasa a hacerlo la app.** *(Corregido tras la
crítica; la primera versión de esta decisión estaba mal.)* Se creyó que bastaba con sacar
`allowsEditing` sin reemplazo porque `CircularBrandLogo.tsx:26` tiene `contentFit: 'contain'` por
defecto. **Ese es solo el default:** `session-morph.tsx:976` y `SessionIntro.tsx:168` pasan
`contentFit="cover"` **explícito**, que recorta al frame circular. Con un logo apaisado, el arranque
del entrenamiento del alumno le comería los bordes a la marca del coach — justo la superficie que el
white-label existe para cuidar.

Entonces: se saca `allowsEditing`/`aspect` de la llamada nativa (que es lo que crashea en Android) y
se agrega un **crop centrado 1:1 en `uploadCoachLogo`**, con `manipulateAsync`, antes del `resize`
que ya está ahí. El resultado visual es idéntico al de hoy y el crash desaparece. No se toca ningún
consumidor, así que no hay cambio visible que aprobar.

**D3 — En `EVA-MOBILE-D` va el fallback, no el refactor del timing.** `?? \`D${d.id}\`` cierra el
crash y es la misma fórmula que ya usa `program-model.ts:181`. Arreglar la raíz (unificar
`setStructureType` con la reconstrucción de `days` en un handler síncrono) cambia el comportamiento
de una hoja que el owner aprobó y exige QA de fluidez: queda declarado, no se hace acá.

**D4 — El `try/finally` de `load()` es la pieza más importante de `EVA-MOBILE-9`**, por encima de la
paralelización. La latencia hace que el fallback gane la carrera; la ausencia de `catch` hace que la
pantalla **nunca** cargue.

**D5 — `12`/`13` se cierran en Sentry sin tocar código.** Bajarles el `level` a `info` escondería una
señal de salud legítima; marcarlos resueltos deja que Sentry los auto-reabra si cambia la
volumetría.

## 5. No objetivos

No se toca la DB, ni RLS, ni entitlements, ni el gate de acceso de alumnos. No hay migraciones. No se
sube ninguna versión nativa. `apps/enterprise` sigue congelada.
