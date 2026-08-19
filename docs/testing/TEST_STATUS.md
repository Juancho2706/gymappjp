---
status: active
owner: engineering
last_verified: "2026-08-19 @ ce601562"
canonical: true
---

# Verificación y estado de pruebas

Fuente canónica de cómo se valida el repositorio y cuáles son los gates pendientes. No mantiene un inventario manual de cada archivo de prueba; Vitest, Playwright y Git son ese inventario.

## Gates que bloquean PR

El job `quality` de `.github/workflows/ci.yml` corre en pull requests hacia `main`, `master` o `rnmobiledenuevo`, y en pushes a `main`/`master`:

1. `pnpm docs:check` (sin dependencias instaladas);
2. `pnpm install --frozen-lockfile --ignore-scripts`;
3. `pnpm lint`;
4. `pnpm typecheck` para web;
5. `pnpm check:tokens` para paridad del design system;
6. `pnpm exec vitest run`.

`pnpm audit --audit-level=high --prod` también corre, pero permanece informativo (`continue-on-error`) para evitar que una indisponibilidad/advisory externo bloquee código sin revisión.

## Gates locales obligatorios que CI no corre

El job `quality` no los ejecuta, pero las reglas del repo y las specs vigentes los exigen antes de entregar. Saltarlos es entregar sin gate; no convierte nada en «verde» (agregados en el saneo documental del 2026-08-19: existían y este documento no los nombraba):

1. `pnpm check:nutrition-v2-boundaries` — frontera de Nutrition V2 (`scripts/check-nutrition-v2-boundaries.mjs`).
2. `pnpm check:meal-completions-deprecation` — guarda de la deprecación de `meal_completions`.
3. `node scripts/cabina-visual-check.mjs` — gate visual Playwright del editor único (T3.v Cabina + Guía Viva + Sello v2): asserts BLOQUEANTES de geometría, contraste y recorrido de los tours sobre el harness `dev-harness/nutrition-editor` (308 declarados en el corte del Sello v2, 2026-08-17). Levanta el dev server de `apps/web` en el puerto 3123 salvo que reciba `BASE_URL`.
4. `pnpm --filter @eva/mobile exec tsc --noEmit` — TypeScript móvil; el `typecheck` raíz solo cubre web.

## Gates manuales de CI

`e2e` solo corre mediante `workflow_dispatch`. `nutrition-smoke` sí se dispara en push/PR/dispatch, pero con `continue-on-error: true` a nivel de job y cada paso condicionado a la presencia de los secrets E2E: sin credenciales no-opea en verde y en ningún caso bloquea un PR.

Motivo: usan Supabase real, secrets y datos preparados; todavía no son deterministas para cada PR. No se consideran “verdes” porque el job haya sido omitido.

`e2e` ejecuta:

- aislamiento RLS enterprise;
- suite Playwright general;
- artefacto `playwright-report-e2e`.

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
pnpm exec vitest run
```

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

## Pendientes actuales

- [x] Artefactos del run `30185211552` retenidos (`D:\tmp\eva-artifacts-856829fa\`: build.aab + build.ipa) y procesamiento en TestFlight/Play internal verificado por el owner (2026-07-25).
- [ ] Completar smoke Android/iOS de la paridad activa.
- [ ] Ejecutar E2E manual antes del siguiente release con cambios de auth/RLS/pagos/nutrición. **Deuda concreta**: Pricing v2 (2026-08-17) tocó pagos, entitlements y el cerco de invitaciones y salió sin correr `e2e`.
- [ ] Reescribir el canary E2E de publicación de plan: `tests/nutrition-v2/builder-publish.spec.ts` está en `test.describe.skip` desde el retiro del par viejo, y el editor único —hoy camino ÚNICO de escritura de planes— quedó sin E2E.
- [ ] Hacer deterministas los jobs Playwright antes de volverlos obligatorios en cada PR.
