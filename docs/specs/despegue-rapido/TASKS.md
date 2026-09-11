---
status: active
owner: product-engineering
last_verified: "2026-09-11"
canonical: false
---

# TASKS — Despegue rápido

- [x] T0 **(Fable)** Verificar que el problema existe: eventos de Sentry con `extra` (RN `viaMorph: fresh`,
      `elapsedMs: 4715`; web `routeReady: true`, `execReady: false`, `3g`) + lectura del código
      (`workout-session.ts` caché detrás del `await clientPromise`; `WorkoutExecutionClient.tsx` señal
      gateada por `execV3ViaMorph`; `MORPH_TTL_MS = 10_000` en las dos). Registrado en SPEC.
- [x] T1 **(Opus RN, juzgado 11-09; `plan-cache-hint.ts` nuevo, TTL en `despegue-ready.ts`; test `workout-session-cache-first` probado por negación: con el orden viejo falla)** B1 caché antes de auth/perfil en `useWorkoutSession` · B4 TTL 20 s en
      `session-morph.tsx` · T2 sin aviso en background · T4 `hasPlanCache`/`appState` en el `extra` ·
      tests en `tests/mobile`.
- [x] T2 **(Opus web, juzgado 11-09; `launch-ceremony.test.ts` nuevo con 6 casos; sin cobertura automatizada de `WorkoutLaunchMorph`: QA 3 y 4 del SPEC)** B3 señal con `isCeremonyActive()` aunque no haya marca · B4 TTL 20 s en
      `launch-ceremony.ts` · T1 `routeReady` solo con el destino · T2 sin aviso con la pestaña oculta ·
      T3 `navigationType`/`ceremonyAttr`/`storageOk`/`visibility` · tests.
- [x] T3 **(Fable, salida hecha; queda el QA del owner)** Juicio de los diffs, gates completos (`pnpm test`, tsc mobile, typecheck, lint,
      lint:mobile, tokens, docs, expo export), commit, docs (CURRENT/MOBILE_PARITY/runbook), OK del
      owner ⇒ push → deploy → OTA 1.1.2 android+ios → E2E prod-suave → QA del owner (SPEC) ⇒ `done`.
- [ ] T4 **(Fable, ~14-09)** Sentry a 72 h: releer `EVA-MOBILE-F` y `EVA-NEXTJS-1P/1Q` por release;
      resolver con nota lo que baje a 0 en el release nuevo.
