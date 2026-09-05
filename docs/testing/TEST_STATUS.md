---
status: active
owner: engineering
last_verified: "2026-09-05 @ dff9b4fb"
canonical: true
---

# Verificación y estado de pruebas

Fuente canónica de cómo se valida el repositorio y cuáles son los gates pendientes. No mantiene un inventario manual de cada archivo de prueba; Vitest, Playwright y Git son ese inventario.

## Gates que bloquean PR

Los jobs `quality` y `unit` de `.github/workflows/ci.yml` corren en paralelo en pull requests hacia `main`, `master` o `rnmobiledenuevo`, y en pushes a `main`/`master`.

`quality`:

1. `pnpm docs:check` (sin dependencias instaladas);
2. `pnpm install --frozen-lockfile --ignore-scripts`;
3. `pnpm lint`;
4. `pnpm typecheck` para web;
5. `pnpm check:tokens` para paridad del design system.

`unit` (matriz de 3 shards, desde el 2026-09-02):

6. `npx vitest run --shard=${{ matrix.shard }}/3`, un job por shard.

Vitest salió de `quality` para no dejar los ~8.900 tests serializados detrás de lint/typecheck. `--shard` reparte **archivos**, así que la unión de los tres shards es la suite completa: no se pierde cobertura, solo se paraleliza el tiempo de pared. No hay job de merge a propósito — cada shard falla por su cuenta y con eso el check ya queda rojo.

Verificado localmente el 2026-09-02 corriendo los tres shards: 226 + 225 + 225 = **676 archivos** y 3.029 + 2.812 + 3.051 = **8.892 tests** (8.888 passed, 4 skipped), exactamente el total de la suite completa.

> **Branch protection**: este cambio publica tres checks nuevos (`unit (1)`, `unit (2)`, `unit (3)`) y `quality` dejó de cubrir Vitest. Si `quality` está marcado como required, hay que sumar los tres o el gate de tests deja de bloquear.

`pnpm audit --audit-level=high --prod` también corre, pero permanece informativo (`continue-on-error`) para evitar que una indisponibilidad/advisory externo bloquee código sin revisión.

## Gates locales obligatorios que CI no corre

El job `quality` no los ejecuta, pero las reglas del repo y las specs vigentes los exigen antes de entregar. Saltarlos es entregar sin gate; no convierte nada en «verde» (agregados en el saneo documental del 2026-08-19: existían y este documento no los nombraba):

1. `pnpm check:nutrition-v2-boundaries` — frontera de Nutrition V2 (`scripts/check-nutrition-v2-boundaries.mjs`).
2. `pnpm check:meal-completions-deprecation` — guarda de la deprecación de `meal_completions`.
3. `node scripts/cabina-visual-check.mjs` — gate visual Playwright del editor único (T3.v Cabina + Guía Viva + Sello v2): asserts BLOQUEANTES de geometría, contraste y recorrido de los tours sobre el harness `dev-harness/nutrition-editor` (308 declarados en el corte del Sello v2, 2026-08-17). Levanta el dev server de `apps/web` en el puerto 3123 salvo que reciba `BASE_URL`.
4. `pnpm --filter @eva/mobile exec tsc --noEmit` — TypeScript móvil; el `typecheck` raíz solo cubre web.

## Reglas eslint locales (`tools/eslint-rules/`)

Desde el 2026-09-02 `pnpm lint` corre en dos pasadas y ambas bloquean:

```bash
eslint apps/web/src tests scripts tools
eslint --config eslint.mobile.config.mjs apps/mobile   # también como pnpm lint:mobile
```

La segunda pasada existe porque `eslint.config.mjs` arrastra el preset de Next: sobre React Native emite ~190 problemas irrelevantes y tarda ~70 s. `eslint.mobile.config.mjs` carga solo el parser de TypeScript (reutilizado de `eslint-config-next/typescript`; cero dependencias nuevas) y las tres reglas locales de móvil (~12 s sobre 677 archivos).

`tools/eslint-rules/` es un plugin local (objeto plano inyectado en la flat config, sin paquete publicado). Reemplaza a los guards de Vitest que leían el **fuente como texto** (`readFileSync` + `toContain`) para afirmar reglas sobre el código: eso es trabajo de linter — corre sobre el archivo que se edita, marca la línea culpable y no paga el arranque del runner. Los guards que verifican **configuración** (`vercel.json`, `app.json`, AASA, assets, geometría del splash, keys i18n huérfanas) siguen siendo tests: ahí no hay AST que mirar.

| Regla | Alcance (`files:`) | Qué caza | Test que reemplazó |
|---|---|---|---|
| `local/no-prices-in-mobile` | `apps/mobile/**/*.{ts,tsx}` | `monthlyPriceClp`, `yearlyPriceClp`, `TIER_CONFIG`, `$29.990`, `29990`, `/mes` | `tests/mobile-no-prices.test.ts` (borrado) |
| `local/store-plan-caption` | `apps/mobile/**/*.{ts,tsx}` | copy de tienda duplicado; exige la declaración canónica en `lib/client-cap.ts` | `tests/mobile/store-copy.test.ts` (borrado) |
| `local/no-nativewind-vars-copy` | `apps/mobile/**/*.{ts,tsx}` | `...vars()`, `Object.assign(…, vars())`, `flatten(vars())` | `tests/mobile/brand-vars-identity.test.ts` (1er describe) |
| `local/student-login-loading-unbranded` | `app/c/*/login/loading.tsx` | shells de marca antes del login del alumno | `login/loading.test.tsx` (2º it) |
| `local/subscription-modules-included` | `coach/subscription/_components/SubscriptionContent.tsx` | copy que ata los módulos a un plan pago; `included = hasActivePaidPlan` | `subscription-modules-included.test.ts` (borrado) |
| `local/subscription-price-suffix` | ídem | sufijo `/mes` hardcodeado; precio que no sale de `priceCycle` | `subscription-price-suffix.test.ts` (2 its) |
| `local/subscription-open-in-app-gate` | ídem | `OpenInAppCard` sin gate `justChangedPlan` | `OpenInAppCard.test.tsx` (2º describe) |
| `local/register-free-tier-contract` | `app/**/register/page.tsx` | hidden inputs del tier/ciclo; `setFreeOnly(rawTier === 'free')` | `register-sin-precios.test.tsx` (3er describe) |
| `local/hecho-con-eva-metadata` | `app/hecho-con-eva/page.tsx` | canónica `/hecho-con-eva` + `index: true` | `hecho-con-eva.test.tsx` (último it) |

Cada regla tiene su caso válido e inválido en `tests/eslint-rules/local-rules.test.ts` (`RuleTester` de eslint). Regla nueva ⇒ caso nuevo ahí, y el bloque `files:` acotado al archivo o al árbol que cubre: nada de reglas globales.

## Gates manuales de CI

`e2e` solo corre mediante `workflow_dispatch`. `nutrition-smoke` sí se dispara en push/PR/dispatch, pero con `continue-on-error: true` a nivel de job y cada paso condicionado a la presencia de los secrets E2E: sin credenciales no-opea en verde y en ningún caso bloquea un PR.

Motivo: usan Supabase real, secrets y datos preparados; todavía no son deterministas para cada PR. No se consideran “verdes” porque el job haya sido omitido.

`e2e` ejecuta:

- suite Playwright **solo del project `prod-suave`** (`--project=prod-suave`, desde el 2026-09-02):
  un navegador, sin paralelismo, `retries: 0`, header `x-eva-qa` y guardián de `/api/health`. Queda
  pendiente cargar los secrets `E2E_QA_COACH_EMAIL` / `E2E_QA_COACH_PASSWORD` del coach QA
  `evademo`: sin ellos el project `setup` se salta y la tanda queda skipped (ver QA-01 en
  [MANUAL_TASKS.md](../operations/MANUAL_TASKS.md));
- artefacto `playwright-report-e2e`.

El paso de aislamiento RLS de `apps/enterprise` se eliminó (app congelada, cuarentena 2026-08-06).

`nutrition-smoke` valida el entorno y ejecuta el smoke de alumno, solo si están presentes las credenciales E2E requeridas. Produce `playwright-report-nutrition-smoke`.

## Seguridad de fixtures

- Se rotó y verificó la contraseña de 27 cuentas Auth sintéticas el 20 de julio de 2026; se ejecutó cierre global de sesión en las 27.
- Los seeds remotos vigentes exigen contraseñas por entorno; el one-off inseguro de cuentas demo fue retirado.
- Los valores anteriores pueden seguir visibles en el historial Git, pero ya no autentican. No se reescribió el historial para no forzar clones/ramas abiertas.
- Supabase invalida refresh tokens con el cierre global; un access token ya emitido puede vivir hasta su `exp`: [Auth sign-out](https://supabase.com/docs/guides/auth/signout).

## Builds móviles

`.github/workflows/mobile-build.yml` es manual y separado del CI de PR.

Estado confirmado al 25 de julio de 2026 (`a59acfd1`, post-merge PR #170):

| Gate | Estado | Evidencia |
|---|---|---|
| Integración PR #170 en `master` | verde | job `quality` en el [run 30181033720](https://github.com/Juancho2706/gymappjp/actions/runs/30181033720) sobre `baef4283`: docs, lint 0 errores, typecheck web, tokens y Vitest 328 archivos aprobados, 2 omitidos; 3940 tests aprobados, 4 omitidos |
| TypeScript móvil/enterprise | verde local | `tsc --noEmit` de web, `@eva/mobile` y `@eva/enterprise` ejecutados el 2026-07-25 sobre `a59acfd1` |
| Android `production` | build + submit verdes en el corte ACTUAL | [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa` (2026-07-25): build + upload + Submit AAB a Play internal testing, todo success (también verdes los runs previos `4382ff6c`/`335c88da`); artefactos con retención de 1 día |
| iOS `production` | build + submit verdes en el corte ACTUAL | [run 30185211552](https://github.com/Juancho2706/gymappjp/actions/runs/30185211552) sobre `856829fa`: build + upload + **Submit TestFlight success** con el profile regenerado (HealthKit + Associated Domains + push, expira 2027-05-18; secret actualizado 2026-07-26). La falla por capability HealthKit (runs `29976332962`/`30063566202`, diagnóstico [30183498116](https://github.com/Juancho2706/gymappjp/actions/runs/30183498116)) quedó cerrada |
| Universal links iOS | en el binario `856829fa` | `ios.associatedDomains` repuesto (revertido desde 2026-07-08); AASA ya publicado. QA en device pendiente (CDN de Apple puede tardar horas) |
| Expo Doctor | no revalidado en el HEAD integrado | evidencia previa 18/18 sobre `c6743ef3`; el comando no está instalado como ejecutable del workspace local |
| Config EAS | vía `production` validada end-to-end | los runs recientes usan `production` (inyección de env prodpreview/production); `previewv2` sigue definido pero ya no es la vía activa |
| Smoke device Android/iOS | pendiente | seguimiento en [MOBILE_PARITY.md](../status/MOBILE_PARITY.md) |

No marcar distribución ni paridad como completas hasta retener artefactos del corte integrado, verificar los submits en App Store Connect/Play Console y ejecutar smoke en dispositivo.

### Candidato local: experiencia de entrada

Estado al 2026-07-26 sobre `rnmobiledenuevo` desde el baseline `e0db4285`:

| Gate | Resultado |
|---|---|
| Vitest focalizado | 5 archivos, 61 tests aprobados: parser, servicio/ruta de workspace, intents y transición de branding |
| Vitest completo | 339 archivos aprobados, 2 omitidos; 4130 tests aprobados, 4 omitidos |
| TypeScript | `pnpm typecheck` y `pnpm --filter @eva/mobile exec tsc --noEmit` verdes |
| Lint | archivos afectados con 0 errores/advertencias; gate raíz con 0 errores y 438 warnings preexistentes fuera del diff |
| Tokens | `pnpm check:tokens`, 86/86 |
| Bundle JS | `expo export --platform android` y `--platform ios`, ambos verdes |
| Binario/dispositivo | pendiente: `app.json` cambió el config plugin del splash y requiere build EAS nuevo; export verde no certifica launch, teclado, links ni accesibilidad física |

El frente no agregó dependencias, DDL ni migraciones. La validación nueva usa el schema y las
relaciones existentes.

## Tamaño real de la suite (2026-08-19)

Las cifras de las dos tablas de arriba son evidencia fechada de julio (3.940 y 4.130 tests): **no describen la suite de hoy**. Las últimas registradas por las sesiones que efectivamente las corrieron, según [CURRENT.md](../status/CURRENT.md): **5.776** (Guía Viva), **5.889** (Pricing v2) y **5.933** (retiro del par viejo), las tres del 2026-08-17. El saneo documental del 19-08 **no volvió a correr la suite completa**, así que aquí no se declara ningún verde nuevo: quien la corra actualiza esta sección con fecha, SHA y resultado.

**Corrida completa del 2026-09-02** (sobre `794aee52` + el reparto por projects, rama `rnmobiledenuevo`): **676 archivos — 674 passed, 2 skipped; 8.892 tests — 8.888 passed, 4 skipped.** Mismo conteo exacto que la corrida base de ese mismo día: el reparto por environment no perdió un solo test.

**Corrida completa del 2026-09-02 noche** (tren «ola 2 chica + higiene», `5f3c48f2`…`31c1f7a8`): **677 archivos — 675 passed, 2 skipped; 8.952 tests — 8.948 passed, 4 skipped** en 110 s. Delta contra la corrida de la mañana: −3 archivos textuales convertidos a reglas eslint, +1 archivo `tests/eslint-rules/local-rules.test.ts` (35 casos) y los tests nuevos del clon de ejercicios, del borrado de cuenta, de leads y del RPC de reemplazos.

### Costo de la suite: por qué Vitest ya no levanta jsdom para todo (2026-09-02)

Hasta el 02-09 `vitest.config.ts` tenía un solo `test` con `environment: 'jsdom'` global, así que los 676 archivos pagaban el arranque de jsdom — incluidos los 619 `*.test.ts` de lógica pura (endpoints, servicios, schemas, motores) que nunca tocan el DOM. Medido en la misma máquina (16 cores), mismo árbol, misma suite:

| | antes (jsdom global) | después (projects) |
|---|---|---|
| `Duration` | **284,18 s** | **102,88 s** (−64 %) |
| `environment` | **2.166,94 s** | **128,12 s** (5,9 % del original) |
| `setup` | 443,33 s | 31,31 s |
| `import` | 921,71 s | 309,35 s |
| `transform` | 131,02 s | 45,89 s |
| `tests` | 289,15 s | 111,06 s |
| resultado | 674 passed / 2 skipped · 8.888 passed / 4 skipped | idéntico |

Salidas reales:

```
# antes
Duration  284.18s (transform 131.02s, setup 443.33s, import 921.71s, tests 289.15s, environment 2166.94s)
# después
Duration  102.88s (transform 45.89s, setup 31.31s, import 309.35s, tests 111.06s, environment 128.12s)
```

Cómo quedó el reparto (`vitest list --filesOnly`): `web-node` 553 archivos, `mobile-node` 66, `web-dom` 54, `mobile-dom` 3. Solo 57 de 676 archivos levantan jsdom.

Reglas que hay que respetar al escribir un test nuevo:

- `*.test.tsx` ⇒ project `*-dom`, `environment: 'jsdom'`;
- `*.test.ts` ⇒ project `*-node`, `environment: 'node'`;
- un `.test.ts` que **sí** necesita DOM real (`window`, `document`, `localStorage`, `renderHook`) lo pide por archivo con `// @vitest-environment jsdom` en la primera línea. Son 20 archivos hoy y cada uno lleva el comentario que explica por qué;
- `vitest.setup.ts` es único para los cuatro projects: los `setupFiles` corren **después** de montar el environment, así que los matchers de `@testing-library/jest-dom` y el mock de `matchMedia` se aplican solo cuando hay DOM (`typeof document !== 'undefined'`). El mock de `next/navigation` es lógica y vale en los dos.

`tests/mobile/**` vive en sus propios projects (`mobile-node` / `mobile-dom`) por una única razón: sus tests montan módulos de `apps/mobile` con `vi.doMock` + `import()` dinámico dentro del propio caso, así que la primera transformación del grafo de RN cae **dentro** del timeout. Ahí el `testTimeout` es 15 s; el global sigue en el default de 5 s.

Costo de `pnpm test:changed` según qué se toque (medido con `vitest related`, mismo grafo que usa `--changed`):

| archivo tocado | corre |
|---|---|
| `apps/web/src/lib/pwa/install-signals.ts` | 1 archivo / 6 tests / 1,17 s |
| `apps/web/src/lib/nutrition-offline-queue.ts` | 1 archivo / 5 tests / 1,22 s |
| `packages/tiers/index.ts` (paquete transversal) | 189 archivos / 2.299 tests / 48,66 s |

Aviso honesto: mientras `vitest.setup.ts` o `vitest.config.ts` estén en el diff contra `origin/master`, `--changed` corre la suite **entera** — el setup está en el grafo de todos los tests. Es correcto, no es un bug; en un diff normal de producto el número es el de la tabla.

**Última corrida completa anterior: 2026-08-26** (cierre de la ola VTA + FCN W0/W1, pre-push): **589 archivos / 7.747 tests — 7.741 passed, 4 skipped, 2 corregidos en la misma tanda** (los gemelos de `client-status`/`directory-status` pinneaban «corte en el futuro» con la constante real, que ese mismo día se fijó al ISO del deploy; re-corridos 37/37 verdes). Además: `pnpm typecheck` y `tsc` mobile 0 errores, lint 0 errores (517 warnings preexistentes), `docs:check`, `check:tokens`, boundaries y `expo export --platform android` VERDES, todos sobre el árbol asentado.

## Comandos locales

Instalación reproducible:

```bash
pnpm install --frozen-lockfile
```

Gates normales:

```bash
pnpm docs:check
pnpm lint
pnpm typecheck
pnpm check:tokens
pnpm test:changed   # durante el trabajo
pnpm exec vitest run  # UNA vez, pre-push
```

**Regla de Vitest en local** (gates proporcionales, 2026-09-02): mientras se trabaja se corre `pnpm test:changed` (`vitest run --changed origin/master`), que ejecuta solo los archivos afectados por el diff contra `origin/master` — incluidos los cambios sin commitear. La suite completa se corre **una sola vez antes del push**, que es la regla del repo, y en CI la cubren los tres shards del job `unit`.

`vitest.config.ts` limita `maxWorkers` al 50 % de los cores en local (16 cores ⇒ 8 workers) para que la corrida completa no deje el PC inusable; en CI (`process.env.CI`) sube al 100 % porque el runner es dedicado.

TypeScript móvil no forma parte todavía del script raíz `typecheck`; ejecutarlo cuando cambia RN:

```bash
pnpm exec tsc --noEmit -p apps/mobile/tsconfig.json
```

Playwright conectado al entorno configurado:

```bash
pnpm e2e:check-env
pnpm test:e2e
```

No correr E2E remoto contra producción sin confirmar personas de prueba, entorno y alcance de writes.

## Matriz por tipo de cambio

| Cambio | Verificación mínima adicional |
|---|---|
| Markdown/estructura documental | `pnpm docs:check` |
| Web TS/TSX | lint, typecheck, Vitest focalizado y completo antes de merge |
| Mobile TS/TSX | TypeScript móvil, Vitest de lógica compartida, Expo Doctor/export y smoke device |
| Tokens/UI compartida | `check:tokens`, light/dark, EVA/custom y viewport móvil |
| RLS/migración | branch Supabase, SQL positivo/negativo con roles reales, advisors, types regenerados |
| Auth/pagos/webhooks | unit tests, idempotencia, entorno sandbox y reconcile posterior |
| Nutrición/intake/offline | unit/read models, aislamiento, reintentos y smoke web+device |
| Release | quality, E2E manual de riesgo, build firmado y smoke del artefacto exacto |

## Cómo registrar un gate

Actualizar este archivo solo con el resultado consolidado:

- fecha;
- SHA o run;
- entorno/plataforma;
- comando o workflow;
- resultado y bloqueador pendiente.

No pegar logs extensos, screenshots, payloads, credenciales ni listas de cientos de suites. Los artefactos viven en GitHub Actions; los defectos accionables viven en issues/specs activos.

## Gates pendientes de la tanda 05-09 (orden del owner: sin gates en la sesión de cierre)

La tanda de código del 05-09 (3 huecos de pricing · `EVA-NEXTJS-18` O7.7 · W6 correos por comportamiento
detrás de flag · residuo de O7.6 · B11 + PostHog role coach + `app_version`) se commiteó **local, sin push
y SIN correr ningún gate**, por orden explícita del owner. Nada de esto está verde: se corre entero en la
sesión siguiente, antes del push.

Vitest primero (comandos deduplicados):

```bash
pnpm vitest run "apps/web/src/app/join/[invite_code]" apps/web/src/lib/coach-subscription-gate.test.ts "apps/web/src/app/admin/(panel)/coaches" packages/tiers apps/web/src/app/coach/reactivate
pnpm vitest run WorkoutPlanCard date-utils weekPendingWorkouts
pnpm vitest run apps/web/src/lib/email apps/web/src/app/api/cron/onboarding-behavior apps/web/src/app/api/cron/drip-hygiene apps/web/src/services/email
pnpm vitest run apps/web/src/components/nutrition/NotesThread.test.tsx "apps/web/src/app/coach/clients/[clientId]" apps/web/src/lib/bodycomp
pnpm vitest run apps/web/src/lib/posthog apps/web/src/services/feature-prefs.service.test.ts
```

Después:

```bash
pnpm --filter @eva/web typecheck
pnpm exec eslint $(git diff --name-only dff9b4fb -- '*.ts' '*.tsx')   # solo los archivos tocados
pnpm test:changed                                                      # suite acotada a lo cambiado vs origin/master
```

E2E y prod, **después del deploy**:

```bash
gh workflow run CI --ref master   # job e2e manual
pnpm qa:prod:suave                # Playwright contra prod, 1 navegador
```

- El dispatch del CI es lo que **cierra W6.8 de `ciclo-real-y-por-lado` y QA-01**: los secrets `E2E_*`
  viven en GitHub, no localmente, así que el E2E no se corre desde la máquina ni hace falta `.env.local`.
- **Sumado el 05-09 (sesión de estudio, sin código):** el SDD `docs/specs/retiro-starter-y-enterprise/` (draft)
  agrega solo `pnpm docs:check` a esta tanda. Los gates de su ejecución (Starter S0–S3, Enterprise E0/E1) viven en
  [su TASKS § Gates acumulados](../specs/retiro-starter-y-enterprise/TASKS.md) y se corren cuando ese tren cierre.

## Pendientes actuales

- [x] Artefactos del run `30185211552` retenidos (`D:\tmp\eva-artifacts-856829fa\`: build.aab + build.ipa) y procesamiento en TestFlight/Play internal verificado por el owner (2026-07-25).
- [ ] Completar smoke Android/iOS de la paridad activa.
- [ ] Ejecutar E2E manual antes del siguiente release con cambios de auth/RLS/pagos/nutrición. **Deuda concreta**: Pricing v2 (2026-08-17) tocó pagos, entitlements y el cerco de invitaciones y salió sin correr `e2e`.
- [ ] Reescribir el canary E2E de publicación de plan: `tests/nutrition-v2/builder-publish.spec.ts` está en `test.describe.skip` desde el retiro del par viejo, y el editor único —hoy camino ÚNICO de escritura de planes— quedó sin E2E.
- [ ] Hacer deterministas los jobs Playwright antes de volverlos obligatorios en cada PR.
