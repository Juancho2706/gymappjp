---
status: draft
owner: product-engineering
last_verified: "2026-08-31"
canonical: false
---

# TASKS — Cierre de los issues vivos de Sentry

Marcar solo con evidencia real. Prohibido dar un gate por verde sin haberlo corrido.

> Corregido tras la crítica adversarial (3 BLOQUEA, 9 RIESGO). Los ajustes van marcados con ⚠.

## O0 — Housekeeping de Sentry (sin código)

- [ ] O0.1 Resolver `EVA-NEXTJS-Y` y `9` citando `01a11a52` (08-08; 23 días sin eventos).
- [ ] O0.2 ⚠ Resolver `EVA-NEXTJS-S` con nota **propia**: ruido de fetch abortado en Safari, ya
      filtrado en `ignoreErrors` desde `02a13c5c`. **NO citar `01a11a52`** — no lo arregló, y desde el
      filtro el conteo de eventos es ciego.
- [ ] O0.3 ⚠ Resolver `EVA-NEXTJS-W` con nota **propia**: chunk obsoleto tras deploy (Turbopack),
      sin relación con `01a11a52`.
- [ ] O0.4 Resolver `EVA-NEXTJS-15` citando `e190f045`.
- [ ] O0.5 Resolver `EVA-NEXTJS-16` y `17` (sin eventos desde el 05/06-08).
- [ ] O0.6 Resolver `EVA-MOBILE-7` citando `7ccf7a07`, y `EVA-MOBILE-8` (binario 1.1.1).
- [ ] O0.7 Resolver `EVA-NEXTJS-12` y `13` con nota: telemetría por diseño (`report-discards.ts:45`).

## O1 — `EVA-NEXTJS-8` · audio (web)

- [ ] O1.1 `audioUtils.ts`: `catch` en los `resume()` de `:13` y `:44`.
- [ ] O1.2 ⚠ `close()` del contexto en el `onended` del **ÚLTIMO oscilador agendado de cada rama**
      — no del primero. `playTimerSound` tiene ramas con 3 y 4 osciladores encadenados (`:52-65`
      digital, `:83-96` classic): cerrar en el primero cortaría los tonos siguientes a mitad.
- [ ] O1.3 **NO** convertir a singleton (SPEC §D1: un contexto `closed` mataría el audio en silencio).
- [ ] O1.4 Gate web: typecheck · lint · `pnpm test --run` desde la raíz.
- [ ] O1.5 ⚠ QA iOS: los **4 tonos** (digital, classic, bell, boxing), no solo el configurado ·
      alarma 5× · preview en ajustes · **arrastrar el slider de volumen** (`ExecSettingsSheet.tsx:215`
      y `WorkoutTimerSettingsPanel.tsx:117` disparan el preview en cada tick del drag, sin debounce:
      es el pico de contextos más alto de la app) · mute a mitad de descanso · background y vuelta.

## O2 — `EVA-MOBILE-D` · crash del builder (mobile)

- [ ] O2.1 `program-builder.tsx:91`: `DAY_SHORT[d.id] ?? \`D${d.id}\``.
- [ ] O2.2 ⚠ Mismo fallback en los **2** sitios reales (no 3): `ActiveProgramSection.tsx:446` y
      `HeroSection.tsx:301`. Síntomas distintos para el QA: `HeroSection` interpola en template
      string ⇒ **imprime «undefined»**; `ActiveProgramSection` lo pasa como hijo JSX ⇒ React lo
      descarta ⇒ **etiqueta en blanco**.
- [ ] O2.3 ⚠ `home.tsx:421` NO usa `DAY_SHORT` sino `DAY_FULL` (`types.ts:138`), consumido en
      `ActiveProgramSection.tsx:187`. Revisar aparte; no asumir el mismo símbolo.
- [ ] O2.4 Gate mobile: `pnpm --filter @eva/mobile exec tsc --noEmit`.
- [ ] O2.5 QA Android: Ciclo con `cycleLength` 14 → volver a Semanal, sin crash.

## O3 — `EVA-MOBILE-A` · logo en Android (mobile)

- [ ] O3.1 `settings/brand.tsx:342`: sacar `allowsEditing: true` y `aspect: [1,1]`.
- [ ] O3.2 ⚠ **Compensar en `uploadCoachLogo`** (`coach-brand.ts:301`): crop centrado 1:1 con
      `manipulateAsync` ANTES del `resize`. Sin esto, `session-morph.tsx:976` y `SessionIntro.tsx:168`
      —que pasan `contentFit="cover"` explícito— le recortarían los bordes a un logo apaisado.
- [ ] O3.3 Verificar que no quede **ningún** otro `allowsEditing: true` vivo en `apps/mobile`.
- [ ] O3.4 Gate mobile: typecheck.
- [ ] O3.5 QA Android: logo cuadrado y apaisado; login del alumno, perfil, ajustes **y el arranque
      del entrenamiento** (que es donde se recorta), en claro y oscuro.

## O4 — `EVA-MOBILE-9` · ejecutor móvil (mobile)

- [ ] O4.1 `try/catch/finally` en `load()` para que `setLoading(false)` corra siempre.
- [ ] O4.2 ⚠ Distinguir **«error de carga» de «rutina sin ejercicios»**. Hoy `blocks=[]` sin caché
      pinta «tu coach probablemente esté actualizando tu plan» con un único botón «Volver al
      Dashboard» (`ExecutorV3.tsx:1788`). Un `finally` a secas cambiaría el spinner infinito por ese
      mensaje **falso y sin reintento**. Hace falta un estado de error con «Reintentar».
- [ ] O4.3 `Promise.all` de `getClientProfile()` con el select de `workout_plans`.
- [ ] O4.4 Commit aparte: embeber `workout_programs` vía `workout_plans_program_id_fkey` (sin hint).
- [ ] O4.5 Gate mobile: typecheck.
- [ ] O4.6 ⚠ QA device: primera apertura de un plan **sin caché local** con la **conexión cortada a
      mitad de la petición** (no solo «red lenta», que no dispara excepción) · con programa activo ·
      sin programa.

## O5 — Ruido (web)

- [ ] O5.1 ⚠ Ruta real: `apps/web/instrumentation-client.ts` (**sin `src/`**), `ignoreErrors` :53-68.
- [ ] O5.2 ⚠ **Anclar** la regex (`^…$`). `ignoreErrors` matchea por substring: sin ancla, un patrón
      genérico se traga errores reales. El propio archivo ya advierte sobre esto.
- [ ] O5.3 Gate web.

## Cierre

- [ ] C1 `pnpm docs:check`.
- [ ] C2 Commit por ola, sin push ni OTA hasta el QA del owner.
- [ ] C3 A las 72 h del deploy: confirmar en Sentry que cada issue tocado no registra eventos nuevos
      **en el release actual**. ⚠ Salvo `EVA-NEXTJS-S`, que está filtrado y no es verificable así.

## Pendientes declarados (NO se hacen acá)

- [ ] P1 Portar `signalsReady`/`degraded` a `session-morph.tsx` — cambio visible, exige mockup.
- [ ] P2 `EVA-NEXTJS-19` — cruzar eventos con Runtime Logs de Vercel antes de tocar código.
- [ ] P3 `EVA-MOBILE-E`/`B` — issue upstream en `react-native-skia` y evaluar bump (build nativo).
- [ ] P4 Refactor del timing de `setStructureType` (SPEC §D3).
- [ ] P5 `noUncheckedIndexedAccess` en `apps/mobile` — habría cazado `EVA-MOBILE-D` en compilación.
- [ ] P6 Debouncear el preview de volumen en los dos sliders (hoy dispara por tick del drag).
