# Informe forense — "el workout se ve vacío / a medias al reentrar"

Fecha: 2026-07-04 · Rama: `feat/redesign-eva-design-system` · Alcance: SOLO investigación (fix propuesto, NO aplicado).

Síntoma (CEO, hoy, preview): el alumno termina el workout → vuelve al dashboard → reentra al workout → **aparece VACÍO** → sale y entra de nuevo → datos **"a medias"**. El alumno cree que no se guardó nada.

---

## Veredicto en una línea

**No hay pérdida de datos: la DB queda íntegra en todos los casos.** El bug es 100% de **display**: al reentrar, la pantalla lee un **snapshot viejo de la client Router Cache** (Next lo reutiliza en back/forward "sin importar `staleTimes`"), y aunque llegue data fresca del server la UI **no la reconcilia** porque `sessionLogs` está congelado en `useState(logs)` al montar. Resultado: el alumno ve vacío/parcial aunque sus series están guardadas.

Son **dos causas que se combinan** (una explica el "vacío total", su interacción con la cola explica el "a medias").

---

## Archivos clave

| Rol | Archivo |
|-----|---------|
| RSC que hace fetch | `apps/web/src/app/c/[coach_slug]/workout/[planId]/page.tsx` |
| Query logs de HOY | `.../workout/[planId]/_data/workout-execution.queries.ts` |
| Server action de serie | `.../workout/[planId]/_actions/workout-log.actions.ts` |
| Cliente de ejecución | `.../workout/[planId]/WorkoutExecutionClient.tsx` |
| Form + write-through | `.../workout/[planId]/LogSetForm.tsx` |
| Cola offline | `apps/web/src/lib/workout-offline-queue.ts` |
| Sync global (montado en layout `/c`) | `.../c/[coach_slug]/_components/OfflineWorkoutQueueSync.tsx` |
| Layout que lo monta | `.../c/[coach_slug]/layout.tsx` (líneas 333) |

---

## Lo que hace cada pieza (verificado)

### 1) `handleFinish` — `WorkoutExecutionClient.tsx:1338-1387`
- Lee `readWorkoutOfflineQueueForPlan(plan.id)` (`:1347`).
- Si hay pendientes → `flushWorkoutQueue(...)` (`:1352`) y **`router.refresh()` sólo si `res.flushed > 0`** (`:1357`). Ese refresh refetchea el RSC **de la propia pantalla de workout** (que están a punto de abandonar), no del dashboard.
- Si quedan pendientes reales → toast "N series sin sincronizar" (`:1365`) con acción "Finalizar igual".
- Camino limpio (cola vacía): salta el flush entero y hace `markFirstWorkoutCompleted()` + `setShowCompleted(true)` (`:1383-1386`).
- **No hay `revalidatePath` en ningún punto del finish.**

### 2) Navegación de salida — `WorkoutExecutionClient.tsx:1799-1815`
- El overlay de resumen se abre con `showCompleted` y su `onDone` hace **`router.push(`${base}/dashboard`)`** (`:1812`). Es una navegación **forward** (push).

### 3) Carga de logs de HOY — `workout-execution.queries.ts:88-177`
- `getWorkoutExecutionData` es `React.cache(...)` (dedup **por request**, no cache persistente → cada request es fresco).
- Autentica con `getClaims()` (`:91`), lo que hace la ruta **dinámica** (usa cookies) → SSR fresco en cada request de server.
- Los "logs de hoy" salen con límites TZ Santiago correctos: `getTodayInSantiago()` + `getSantiagoUtcBoundsForDay` (`:146-147`) y filtro `logged_at >= todayStartUtc AND < todayEndUtc` (`:173-174`). **La query en sí es correcta**: si se ejecuta, devuelve las series de hoy. El problema NO es la query, es que **al reentrar el server no siempre se ejecuta** (cache de cliente).

### 4) Server action por serie — `workout-log.actions.ts:17-143`
- Upsert last-wins por `(block_id, set_number, día)` (`:77-127`): busca filas de hoy → UPDATE la primera + DELETE duplicados, o INSERT. **Idempotente**.
- **`:137-142` — comentario clave:** *"Sin revalidatePath por serie… Next 16 con dynamic=0 (staleTime 0) re-fetchea al navegar"*. **Esa premisa es incompleta** (ver Root Cause A).

### 5) Write-through + reconciliación — `LogSetForm.tsx:411-467` y `:346-361`
- `handleSubmit`: **encola SIEMPRE antes de la red** (`enqueueWorkoutLog`, `:430-445`), luego dispara el server action.
- Efecto de reconciliación (`:347-361`): al llegar `state.success` → `dequeueWorkoutLog` (`:351`) + `onResult('ok')`; al llegar `state.error` → reabre fila + `onResult('error')` (el padre revierte el optimismo, `WorkoutExecutionClient.tsx:1154-1158`).
- **Gotcha ya documentado en el propio código** (`WorkoutExecutionClient.tsx:1340-1346`): si la fila **colapsó/desmontó** (última serie de un bloque/grupo) **antes** de que llegara `state.success`, el efecto de dequeue **no corre** → el item queda **huérfano en la cola** aunque el server YA guardó.

### 6) Sync global — `OfflineWorkoutQueueSync.tsx` (montado una vez en `layout.tsx:333`)
- En su `useEffect` de montaje (y en el evento `online`): si la cola no está vacía → `flushWorkoutQueue` → si `flushed > 0` → **`router.refresh()`** (`:30`).
- **No re-monta por navegación** (vive en el layout persistente de `/c`), así que su refresh sólo dispara al montar el árbol `/c` por primera vez o al reconectar.

### 7) Cola offline — `workout-offline-queue.ts`
- Dedup por `(block,set)` última-gana (`:54-63`), poda de huérfanos por FK (`:71-84`), flush idempotente con `remainingInScope` (`:145-169`). **Sólida.** No es el origen del bug.

---

## Reproducción mental (secuencia del CEO), con archivos:líneas

Estado inicial: alumno en `/c/{slug}/workout/{X}`. Al montar, `WorkoutExecutionClient.tsx:1005` hace `const [sessionLogs] = useState(logs)` con `logs = []` (sesión recién empezada). **La client Router Cache guarda ese snapshot del workout: `logs = []`.**

1. **Loguea sus series.** Cada una: optimista (`:1284`) + encola (`LogSetForm.tsx:430`) + server action → guarda en DB → dequeue (`:351`). La DB va quedando **completa y correcta**. Pero `logSetAction` **no** hace `revalidatePath` → **la entrada de la client Router Cache del workout sigue con el snapshot `logs = []`** (nunca se invalidó).

2. **Termina** → `handleFinish` (`:1338`). Cola vacía (sesión online limpia, todo dequeueado) → salta flush → `setShowCompleted(true)` (`:1386`). *(Si algún bloque colapsó antes del `success`, quedan huérfanos → importa en el paso 6.)*

3. **`onDone` → `router.push('/dashboard')`** (`:1812`). Forward push a `/dashboard`; `staleTimes.dynamic = 0` → dashboard **fresco** (por eso el dashboard sí muestra el progreso correcto: asimetría que despista).

4. **Reentra al workout.** En móvil/PWA lo natural tras "listo" es el **back gesture / botón atrás** → navegación **back**. Aquí pega la doc oficial de Next (16.2.10):
   > *"This doesn't change back/forward caching behavior to prevent layout shift and to prevent losing the browser scroll position."*
   
   El back/forward **reutiliza el snapshot cacheado del workout = `logs = []`**, **sin importar** que `staleTimes.dynamic` sea 0. El cliente **re-monta** con `logs = []` → `useState(logs)` (`:1005`) arranca vacío → **VACÍO** aunque la DB tiene todo. ✅ coincide con el síntoma.

5. **Sale y entra de nuevo → "a medias".** Segunda reentrada aterriza en una **entrada de history con OTRO snapshot** (uno capturado a mitad de sesión: p. ej. tras un `router.refresh()` del `OfflineWorkoutQueueSync` al reconectar, o un push forward que refetcheó parcialmente antes de terminar de loguear). Cada posición del history retiene su propia foto RSC → el alumno ve **una mezcla distinta cada vez**. ✅ coincide.

6. **Por qué nunca "se arregla solo" aunque llegue data fresca.** Si en algún reentro sí corre un `router.refresh()` (flush de huérfanos del paso 2, o Fix A propuesto), el RSC trae `logs` frescos y actualiza el **prop**. Pero **`sessionLogs = useState(logs)` ignora cambios de prop tras el montaje** (`:1005`; no hay `useEffect` que lo sincronice). El único `setSessionLogs` fuera del init son el optimista (`:1284`) y el revert por error (`:1156`). → La UI **no se auto-cura**. ✅ explica que "sale y entra" no restituya del todo.

---

## Root causes

### Root Cause A — client Router Cache sirve un snapshot viejo en back/forward (VACÍO total)
- `logSetAction` **no invalida** la ruta del workout (comentario `workout-log.actions.ts:137-142`).
- La premisa del comentario ("dynamic=0 re-fetchea al navegar") es cierta **sólo para push forward**. En **back/forward** Next reutiliza el snapshot cacheado **ignorando `staleTimes`** (doc oficial citada). Como el snapshot se congeló con `logs = []`, la reentrada por atrás muestra vacío.
- Evidencia: `next.config.ts` **no** define `experimental.staleTimes` → aplica el default (`dynamic: 0`, `static: 300s`); doc `nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes` (v16.2.10) + glosario Client Cache.

### Root Cause B — `sessionLogs` congelado en `useState(logs)` (no se auto-cura; habilita "a medias")
- `WorkoutExecutionClient.tsx:1005`: `const [sessionLogs, setSessionLogs] = useState(logs)`. **No existe** `useEffect(() => setSessionLogs(logs), [logs])` ni merge con la cola. Cualquier `router.refresh()` que traiga `logs` frescos **no se refleja** en pantalla.
- Consecuencia: incluso arreglando A, si la data llega por props después del montaje, la UI seguiría stale sin B.

### Matiz C — huérfanos de la cola ("a medias" adicional)
- El gotcha `WorkoutExecutionClient.tsx:1340-1346`: series ya guardadas en DB pero no dequeueadas (fila colapsó antes de `success`). Al montar el árbol `/c`, `OfflineWorkoutQueueSync` las reenvía (idempotente) y hace `router.refresh()` — pero por **B** ese refresh no repinta `sessionLogs`. No causa pérdida (DB intacta), pero contribuye a la sensación de "mezcla distinta en cada entrada".

### Lo que NO es el bug
- **No es la query de logs** (`workout-execution.queries.ts` es correcta: TZ Santiago, `React.cache`, ruta dinámica).
- **No es pérdida de datos**: write-through + upsert idempotente + flush garantizan que la DB queda completa. Es puramente visual/trust.
- **No es TZ ni `force-dynamic`**: la ruta ya es dinámica; el problema es la **client** Router Cache, no el render server.

---

## Fix propuesto (priorizado — NO aplicado)

Objetivo CEO: que el alumno **SIEMPRE** vea sus datos al reentrar **y** vea estado de sync visible si algo sigue en cola. El garante real es **client-side** (A+B); la invalidación server-side es defensa complementaria.

### P0 · Fix B — reconciliar `sessionLogs` con el prop `logs` + la cola local
`WorkoutExecutionClient.tsx`. Un helper puro + un efecto. Sin regresión: en sesión normal `logs` no cambia (no hay revalidate por serie) → el efecto no dispara; el optimismo se preserva. Cuando `logs` cambia (refresh/navegación), reconcilia server∪cola, y la cola preserva lo que aún está en vuelo (write-through encola antes de la red).

```ts
// helper puro (junto a applyOptimisticLog, ~:497)
function reconcileSessionLogs(
  serverLogs: WorkoutSessionLog[],
  queued: WorkoutOfflineLog[],
): WorkoutSessionLog[] {
  const byKey = new Map<string, WorkoutSessionLog>()
  for (const l of serverLogs) byKey.set(`${l.block_id}:${l.set_number}`, l)
  for (const q of queued) {
    const key = `${q.blockId}:${q.setNumber}`
    if (byKey.has(key)) continue            // el server confirmado gana
    byKey.set(key, {                        // pendiente aún no confirmado → mostrarlo igual
      block_id: q.blockId, set_number: q.setNumber,
      weight_kg: q.weightKg, reps_done: q.repsDone, rpe: q.rpe, rir: q.rir,
      note: q.note ?? null,
      actual_duration_sec: q.actualDurationSec ?? null,
      actual_distance_m: q.actualDistanceM ?? null,
      actual_hold_sec: q.actualHoldSec ?? null,
      actual_avg_hr: q.actualAvgHr ?? null,
    })
  }
  return [...byKey.values()]
}
```

```tsx
// dentro del componente, tras el useState de sessionLogs (~:1005)
useEffect(() => {
  setSessionLogs(reconcileSessionLogs(logs, readWorkoutOfflineQueueForPlan(plan.id)))
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [logs])
```
Import a sumar: `readWorkoutOfflineQueueForPlan`, `type WorkoutOfflineLog` desde `@/lib/workout-offline-queue`.

### P0 · Fix A — forzar RSC fresco al (re)entrar
`WorkoutExecutionClient.tsx`. En back/forward el cliente re-monta con el snapshot cacheado (`logs` viejo). Un `router.refresh()` en el montaje trae los logs reales; Fix B los pinta. Además `visibilitychange` cubre el retorno al tab/PWA.

```tsx
useEffect(() => {
  // La client Router Cache reutiliza el snapshot en back/forward (doc Next: ignora staleTimes).
  // Refetch del RSC al (re)entrar → logs frescos del server; Fix B reconcilia y repinta.
  router.refresh()
  const onVisible = () => { if (document.visibilityState === 'visible') router.refresh() }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```
Opción de afinado (evitar refetch inútil en sesión 100% nueva): gatear el refresh de montaje a `logs.length > 0 || readWorkoutOfflineQueueForPlan(plan.id).length > 0`. Trade-off: un fetch extra por entrada vs. garantía de frescura; dada la criticidad de confianza, se recomienda refrescar siempre y medir.

### P1 · Estado de sync VISIBLE (mata "cree que no se guardó nada")
`WorkoutExecutionClient.tsx`. Chip/banner que lee el conteo de la cola de ESTE plan y muestra "Sincronizando N series…" mientras haya pendientes; desaparece al vaciarse. Se refresca en `online`/tras cada flush. Da feedback explícito en vez de un blanco silencioso.

```tsx
const [pendingCount, setPendingCount] = useState(0)
useEffect(() => {
  const sync = () => setPendingCount(readWorkoutOfflineQueueForPlan(plan.id).length)
  sync()
  window.addEventListener('online', sync)
  window.addEventListener('focus', sync)
  return () => { window.removeEventListener('online', sync); window.removeEventListener('focus', sync) }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
// … render: {pendingCount > 0 && <SyncChip n={pendingCount} />}
```

### P2 · Defensa server-side — invalidar la ruta al finalizar (no por serie)
Mantener el "sin revalidatePath por serie" (evita parpadeo/scroll), pero agregar **una** invalidación al **terminar**: un server action `revalidateWorkoutViewAction(planId, coachSlug)` que haga `revalidatePath` del workout + dashboard, invocado en `handleFinish` antes de `setShowCompleted`. Evita que la entrada stale se reutilice en una navegación posterior.
- ⚠️ Verificar en preview: la doc dice que `staleTimes` no cambia back/forward; **`revalidatePath` es una invalidación explícita más fuerte**, pero si el back/forward igual reutiliza la entrada, **A+B siguen siendo el garante**. Por eso P2 es complementario, no sustituto.

### Prioridad de aplicación
1. **P0 A + P0 B juntos** — resuelven el vacío y el "a medias" y garantizan auto-cura. Son interdependientes (A trae data, B la pinta).
2. **P1** — cierra el "cree que no se guardó".
3. **P2** — higiene de cache; validar comportamiento real en preview.

---

## Verificación sugerida (cuando se aplique)
- **Vitest dirigido**: test puro de `reconcileSessionLogs` (server gana; cola rellena huecos; dedup por block/set; items legacy sin campos polimórficos parsean). Reusar patrón de `workout-offline-queue.test.ts`.
- `pnpm typecheck` verde.
- **E2E/manual en preview** (sólo con OK): loguear serie → Finalizar → dashboard → **botón atrás** → verificar que la pantalla muestra las series (no vacío) → repetir. Repetir con red throttled para el chip de sync. Probar back/forward nativo y "Continuar" del `WorkoutHeroCard`.

---

## Fuentes
- Next.js docs — [staleTimes](https://nextjs.org/docs/app/api-reference/config/next-config-js/staleTimes) (v16.2.10): `dynamic` default 0; *"doesn't change back/forward caching behavior"*.
- Next.js docs — [App Router Glossary · Client Cache](https://nextjs.org/docs/app/glossary): páginas dinámicas no cacheadas por default **pero reutilizadas en back/forward**.
- Código del repo citado arriba (archivos:líneas).
