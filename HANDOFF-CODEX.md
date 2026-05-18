# HANDOFF-CODEX.md — Sesion Codex 2026-05-17

Contexto rapido para continuar en Claude Code.

## Reglas criticas

- Rama de trabajo v2: `v2/enterprise`.
- No push de v2.
- No tocar Supabase prod.
- Supabase dev solo local.
- MCP Supabase apunta a prod: no usarlo para SQL/dev.
- Antes de pasar de fase, avisar a Juan.

## Estado git

Ultimo estado al cerrar:

- Working tree limpio.
- Rama: `v2/enterprise`.
- Ultimos commits relevantes:
  - `2f93ef0 chore: scaffold expo mobile app`
  - `1cedea8 docs: sync phase and manual tasks`
  - `d73e47a chore: move web app into workspace`
  - `a084741 fix: require email confirmation for free coaches`

## Hotfix master/prod realizado antes de volver a v2

Problema prod:

- Registro coach free fallaba con:
  `new row for relation "coaches" violates check constraint "coaches_subscription_status_check"`

Causa:

- Master insertaba `subscription_status = 'pending_email'`.
- CHECK constraint prod no permitia ese valor.

Fix aplicado en `master` y pusheado:

- Commit: `eeb1a1c fix: allow free coach registration`
- Free coach en master queda `active` en `coaches`, pero Supabase Auth mantiene `email_confirm: false`.
- Se volvio a `v2/enterprise`.

## Registro free coach v2

Juan pidio que v2 SI exija confirmacion de email.

Implementado:

- Migration:
  - `supabase/migrations/20260517160000_allow_pending_email_subscription_status.sql`
  - Agrega `pending_email` y otros statuses al CHECK `coaches_subscription_status_check`.
- `apps/web/src/app/(auth)/register/actions.ts`
  - Free coach crea row con `subscription_status = 'pending_email'`.
  - Redirige a `/verify-email`.
- `apps/web/src/app/auth/confirm/route.ts`
  - Cuando Supabase confirma email, si tier free + pending_email, pasa a `active`.
- Test actualizado:
  - `apps/web/src/app/(auth)/register/actions.test.ts`

Validado antes del monorepo:

- `npx supabase db reset`
- `npx vitest run 'src/app/(auth)/register/actions.test.ts'`
- `npm run typecheck`
- `npm run lint`
- `npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1`
- `npm run build`

Commit:

- `a084741 fix: require email confirmation for free coaches`

## Fase 6A — Monorepo web

Completada localmente.

Movido:

- `src/` -> `apps/web/src/`
- `public/` -> `apps/web/public/`
- `next.config.ts` -> `apps/web/next.config.ts`
- `tsconfig.json` -> `apps/web/tsconfig.json`
- `postcss.config.mjs` -> `apps/web/postcss.config.mjs`
- `components.json` -> `apps/web/components.json`
- `vercel.json` -> `apps/web/vercel.json`

Agregado:

- Root `package.json` con workspaces:
  - `apps/*`
  - `packages/*`
- `apps/web/package.json`
- `packages/types`
- `packages/schemas`

Configs ajustadas:

- `package.json`
- `package-lock.json`
- `vitest.config.ts`
- `eslint.config.mjs`
- `apps/web/tsconfig.json`
- `scripts/check-meal-completions-deprecation.mjs`
- `.gitignore`

Notas:

- `.env.local` y `.env.development.local` fueron copiados a `apps/web/` localmente, pero estan ignorados.
- `apps/web/.next/` esta ignorado.
- `next-env.d.ts` esta ignorado.

Validado:

- `npm run typecheck` OK
- `npm run lint` OK, solo warnings existentes
- `npm run build` OK
- `npx vitest run "apps/web/src/app/(auth)/register/actions.test.ts"` OK
- `npx playwright test tests/enterprise/rls-isolation.spec.ts --workers=1` OK

Commit:

- `d73e47a chore: move web app into workspace`

## Docs sincronizados

Actualizado:

- `CURRENT_PHASE.md`
  - Fase actual ahora: `6B.0 Pre-flight Mobile`.
  - 6A marcada como completada localmente.
  - Validaciones de 6A listadas.
- `MANUAL_TASKS.md`
  - Agregado `MT-26`: cambiar Vercel Root Directory a `apps/web`.
  - Importante: no hacerlo aun si no se va a deployar v2.

Commit:

- `1cedea8 docs: sync phase and manual tasks`

## Fase 6B.0 — Pre-flight Mobile

Iniciada, no completa.

Hecho:

- `apps/mobile/` creado con `npx create-expo-app@latest apps/mobile --template blank-typescript --yes`.
- Dependencias Expo/RN instaladas:
  - `expo-updates`
  - `@sentry/react-native`
  - `expo-notifications`
  - `expo-device`
  - `expo-constants`
  - `expo-router`
  - `expo-linking`
  - `expo-crypto`
  - `react-native-safe-area-context`
  - `react-native-screens`
  - `@react-native-async-storage/async-storage`
- `package-lock.json` actualizado.

Commit:

- `2f93ef0 chore: scaffold expo mobile app`

Importante:

- Intente aplicar un patch grande para configurar Expo Router/EAS/app.json/theme/push, pero fallo por mismatch en `apps/mobile/package.json`.
- No quedo aplicado ese patch.
- El scaffold actual sigue bastante base de Expo.

Pendiente para completar 6B.0 codigo local:

- Renombrar `apps/mobile/package.json`:
  - `"name": "@eva/mobile"`
  - `"main": "expo-router/entry"`
- Crear `apps/mobile/eas.json`.
- Completar `apps/mobile/app.json`:
  - name `EVA`
  - slug `eva-fitness`
  - scheme `eva`
  - iOS bundle `cl.evaapp.eva`
  - Android package `cl.evaapp.eva`
  - `targetSdkVersion: 35`
  - permisos exactos
  - `expo-updates`
  - Sentry plugin
  - runtimeVersion policy
- Crear `apps/mobile/PrivacyInfo.xcprivacy`.
- Crear `apps/mobile/app/index.tsx` con pantalla inicial simple:
  - `SOY COACH`
  - `SOY ALUMNO`
- Crear `apps/mobile/lib/theme.tsx`.
- Crear `apps/mobile/lib/push.ts`.
- Crear:
  - `apps/web/public/.well-known/apple-app-site-association`
  - `apps/web/public/.well-known/assetlinks.json`
- Crear `.github/workflows/mobile-build.yml`.
- Crear `.maestro/alumno-login.yaml`.
- Actualizar `CURRENT_PHASE.md` con checks parciales.
- Actualizar `MANUAL_TASKS.md` si aparecen nuevas acciones manuales.

Pendiente manual Juan:

- `eas login`
- Crear cuenta Expo/EAS y `EXPO_TOKEN` (`MT-14`).
- Crear Sentry `eva-rn` y DSN (`MT-15`).
- Guimel agrega Apple ID como App Manager (`MT-11`).
- Registrar Bundle ID `cl.evaapp.eva` (`MT-12`).
- Google Play Developer account ($25) (`MT-13`).
- Obtener Apple Team ID para AASA.
- Obtener Android SHA256 cert fingerprint para `assetlinks.json`.
- Age rating 13+ en App Store Connect.
- Maestro instalado localmente.

## Cosas a vigilar

- `apps/mobile/node_modules/` existe localmente pero debe estar ignorado por `apps/mobile/.gitignore`.
- No correr `npm audit fix --force`.
- No hacer `eas build` todavia si no hay `EXPO_TOKEN`/cuentas configuradas.
- No cambiar Vercel Root Directory hasta que Juan confirme deploy/preview v2.
- Next 16 avisa que `middleware` esta deprecated hacia `proxy`, pero no tocar ahora.

## Proxima accion recomendada

Continuar 6B.0 codigo local:

1. Ajustar `apps/mobile/package.json`.
2. Crear `eas.json`.
3. Reemplazar `app.json`.
4. Crear `PrivacyInfo.xcprivacy`.
5. Crear `lib/theme.tsx` y `lib/push.ts`.
6. Crear `.well-known` y GitHub Actions.
7. Validar:
   - `npm run typecheck -w @eva/mobile` si se agrega script.
   - `npm run typecheck`
   - `npm run build` web sigue OK.
8. Commit.

