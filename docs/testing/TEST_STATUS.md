---
status: active
owner: engineering
last_verified: 2026-07-20
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

## Gates manuales de CI

Los jobs `e2e` y `nutrition-smoke` solo corren mediante `workflow_dispatch`.

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

Estado confirmado al 20 de julio de 2026:

| Gate | Estado | Evidencia |
|---|---|---|
| Android `previewv2` | verde | build reportado por el dueño |
| iOS `previewv2` | pendiente de reintento | fallo previo de selección de credenciales; configuración corregida en `c6743ef3` |
| Expo Doctor | verde | 18/18 checks después del arreglo de perfil |
| Config EAS Android | verde | sigue `internal` + APK para `previewv2` |
| Config EAS iOS | verde estático | `local` + `store` + Release + imagen Xcode 26; falta build real |
| Smoke device Android/iOS | pendiente | seguimiento en [MOBILE_PARITY.md](../status/MOBILE_PARITY.md) |

No marcar iOS ni paridad como completos hasta tener artefacto y smoke en dispositivo.

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

- [ ] Repetir iOS `previewv2` con `c6743ef3` o un descendiente.
- [ ] Completar smoke Android/iOS de la paridad activa.
- [ ] Ejecutar E2E manual antes del siguiente release con cambios de auth/RLS/pagos/nutrición.
- [ ] Hacer deterministas los jobs Playwright antes de volverlos obligatorios en cada PR.
