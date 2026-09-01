---
status: draft
owner: product-engineering
last_verified: "2026-08-31"
canonical: false
---

# PLAN — Cierre de los issues vivos de Sentry

Cinco olas independientes, ordenadas para que **el fallo de una no bloquee a las demás**. Cada ola es
su propio commit y su propio gate. Ninguna toca DB, RLS ni entitlements.

## Gates de la casa (y una trampa)

| Superficie | Gate |
|---|---|
| Web | `pnpm --filter @eva/web exec tsc --noEmit` · `pnpm --filter @eva/web lint` · `pnpm test --run` **desde la raíz** |
| Mobile | `pnpm --filter @eva/mobile exec tsc --noEmit` + **QA en device** |

> **Trampa verificada:** `pnpm --filter @eva/web test` **sale 0 sin ejecutar nada** — `apps/web` no
> tiene script `test`, vive en la raíz. Es un falso verde. La suite real son 602 archivos / ~7990
> tests.

`apps/mobile` **no tiene tests de UI**, así que su único gate automático es el typecheck. Todo lo
demás lo cierra el ojo humano en el teléfono.

---

## Ola 0 — Housekeeping de Sentry · riesgo **nulo**

No toca una línea de código. Marcar resueltos citando su commit: `EVA-NEXTJS-S`, `Y`, `9`, `W`
(`01a11a52`), `15` (`e190f045`), `16`, `17`, `EVA-MOBILE-7` (`7ccf7a07`), `EVA-MOBILE-8` (binario
1.1.1). Y `EVA-NEXTJS-12` / `13` como «verificado correcto: telemetría por diseño».

**Por qué primero:** el tablero pasa de 24 a ~7 abiertos. Con el ruido afuera, cualquier regresión de
las olas siguientes salta a la vista en vez de perderse entre fantasmas.

**Revert:** reabrir el issue en Sentry (un click). Si el bug reaparece, Sentry lo auto-reabre solo.

---

## Ola 1 — `EVA-NEXTJS-8`, audio del ejecutor · riesgo **medio** · web

**Cambio** (`apps/web/src/lib/audioUtils.ts`, 1 archivo): mantener el contexto efímero; agregar
`close()` cuando el sonido termina y `catch` a los dos `resume()`.

**Blast radius:** 8 call sites (`HoldTimer`, `IntervalTimer`, `RestTimer`,
`WorkoutTimerSettingsPanel`, `ProfileClient`, `useIntervalRunner`, `useExecCountdown`,
`ExecSettingsSheet`). El contrato de las dos funciones exportadas **no cambia**, así que ningún call
site se toca.

**Qué puede salir mal:** cerrar el contexto **antes** de que el oscilador termine ⇒ sonido cortado o
mudo. Es el riesgo real, y no lo cubre ningún test: `jsdom` no implementa `AudioContext` y hoy hay
cero tests sobre esto.

**QA en device (iOS, obligatorio):** alarma repetida 5×, preview de sonido en ajustes, mute/unmute a
mitad de un descanso activo, y la app en segundo plano y de vuelta.

**Revert:** un archivo, `git revert` limpio.

---

## Ola 2 — `EVA-MOBILE-D`, crash del builder · riesgo **bajo** · mobile

**Cambio** (`program-builder.tsx:91`): `structure === 'weekly' ? (DAY_SHORT[d.id] ?? \`D${d.id}\`) : \`D${d.id}\``.
Misma fórmula que ya usa `program-model.ts:181`.

**Por qué importa más de lo que sugiere su volumetría:** no hay ErrorBoundary propio, así que el
`.slice()` sobre `undefined` **remonta la aplicación entera**. El coach pierde lo que estaba armando.

**Incluye** el mismo fallback en las tres superficies del alumno que el lector encontró con idéntica
exposición a `day_of_week` 8-14 (`home.tsx`, `ActiveProgramSection`, `HeroSection`). Ahí no crashea:
imprime `undefined` en pantalla. Es el patrón conocido de la casa — **el predicado vive en N lugares
y hay que cambiarlos todos.**

**Qué puede salir mal:** casi nada; el fallback solo agrega una rama de string. Lo que **no** arregla
es el desync de estado que lo origina (D3 en el SPEC): tras el fix, alternar Ciclo→Semanal con ciclo
largo puede mostrar «D8» por un frame antes de reconciliar. Es feo, no es un crash.

**QA en device (Android):** builder → Ciclo con `cycleLength` 14 → volver a Semanal.

---

## Ola 3 — `EVA-MOBILE-A`, subir logo en Android · riesgo **bajo** · mobile

**Cambio** (`settings/brand.tsx:342`): sacar `allowsEditing: true` y `aspect: [1,1]`, dejando
`mediaTypes: ['images'], quality: 0.9`.

**Sin reemplazo de crop**, por D2 del SPEC: `uploadCoachLogo` ya hace `resize: { width: 512 }`
(preserva proporción) y los consumidores usan `contentFit: 'contain'`. **Corrección al brief
original:** ningún archivo del repo usa crop de `expo-image-manipulator` — los cuatro «precedentes»
solo hacen resize+compress, así que no había fórmula que copiar. El precedente real es
`check-in.tsx:197`, que sacó `allowsEditing` sin reemplazo por este mismísimo motivo.

**Qué puede salir mal:** un coach que suba una imagen muy apaisada verá su logo más chico dentro del
círculo. Es cosmético y reversible subiendo otra imagen.

**QA en device (Android):** subir un logo cuadrado y uno apaisado; mirarlos en login del alumno,
perfil y ajustes, en claro y oscuro.

---

## Ola 4 — `EVA-MOBILE-9`, ejecutor móvil · riesgo **medio** · mobile

Tres cambios en `apps/mobile/lib/workout-session.ts`, **en este orden de importancia**:

1. **`try/finally` alrededor de `load()`** para que `setLoading(false)` corra siempre. Hoy `load()`
   se dispara con `void load()` sin `.catch()`: una excepción deja la pantalla cargando **para
   siempre**. Esto solo ya cierra el peor caso del issue.
2. **Paralelizar** `getClientProfile()` con el select de `workout_plans` — son independientes y hoy
   están en serie sin razón.
3. **Embeber** `workout_programs` en el select de `workout_plans`. La FK
   `workout_plans_program_id_fkey` **existe y es la única entre ambas tablas**, y el embed sin hint
   **ya corre en producción** en web (`workout.service.ts:695`). Se usan 7 campos, ninguno muerto.

**Qué puede salir mal:** si el embed no resuelve, falla la query entera y el ejecutor no abre. Por
eso va **último y en su propio commit**: los pasos 1 y 2 son seguros por separado y se quedan aunque
el 3 se revierta.

**QA en device:** abrir un entrenamiento con programa activo y otro sin programa; y forzar red lenta
para ver que ya no queda colgado.

---

## Ola 5 — Ruido · riesgo **bajo** · web

`EVA-NEXTJS-1M`: una regex más en `ignoreErrors` de `instrumentation-client.ts:53-68`, siguiendo el
patrón que dejó `ae2abdbc`.

**Qué puede salir mal:** una regex demasiado amplia esconde errores reales. Debe atarse al texto
exacto de la extensión, nunca a un genérico como `Object Not Found`.

---

## Verificación post-deploy (lo que nadie hace y por eso los fantasmas)

Un issue **no está cerrado porque el commit esté en master**. A las 72 h del deploy, para cada issue
tocado: confirmar en Sentry que **no hay eventos nuevos en el release actual**. Ese es el criterio
—el mismo que destapó que 9 issues llevaban 23 días muertos— y es lo que evita volver a planificar
trabajo sobre bugs que ya no existen.

## Fuera de este plan, declarado

`EVA-MOBILE-E` / `B` (Skia): abrir issue upstream con los dos stacks y evaluar bump de
`@shopify/react-native-skia` en un canal aparte. Es build nativo, **no OTA**.

`EVA-NEXTJS-19` (E394, vivo hoy): **la causa no está confirmada.** Antes de tocar código hay que
cruzar 2-3 eventos con los Runtime Logs de Vercel (mismo timestamp + URL) para descartar un 5xx real.
Sin ese cruce, cualquier fix es adivinanza.
