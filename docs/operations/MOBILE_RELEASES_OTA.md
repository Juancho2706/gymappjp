---
status: active
owner: mobile-release
last_verified: "2026-08-20 @ a2cca2a5"
canonical: true
---

# Releases móviles y OTA

Política operativa para `apps/mobile`. La configuración ejecutable prevalece:

- `apps/mobile/app.json`: identidad nativa, `expo-updates` y `runtimeVersion`;
- `apps/mobile/eas.json`: perfiles, canales y firma;
- `.github/workflows/mobile-build.yml`: build y submit manuales;
- `.github/workflows/mobile-ota.yml`: publicación OTA y subida de sourcemaps;
- `apps/mobile/metro.config.js`: Debug ID del bundle (`getSentryExpoConfig`);
- `apps/mobile/lib/ota.ts`: descarga y aplicación en runtime.

`apps/enterprise` no está cubierto por esta guía: conserva identificadores EAS placeholder y no tiene `expo-updates` configurado.

## Estado efectivo

- Expo SDK 54, React Native 0.81 y Expo Router 6.
- `runtimeVersion.policy = appVersion`: un OTA solo llega a binarios con la misma versión compatible.
- EAS CLI no está fijado a una versión exacta: `eas.json` exige `>= 14.0.0` y GitHub Actions instala `latest`.
- Solo `production` declara un canal OTA.
- `previewv2` genera binarios internos, pero no declara canal; no prometer ni publicar OTA para esos binarios sin configurar primero un canal explícito.
- 2026-07-29: `staging` (apuntaba a un Supabase local por IP de LAN, inusable en CI) y `prodpreview` (subset de `production` sin submit) fueron retirados de `eas.json` y del workflow. La opción `enterprise` salió del picker del workflow (app archivada, estrategia Teams-first).
- El build ocurre localmente dentro de GitHub Actions con `eas build --local`; no consume créditos de EAS Build.
- 2026-08-19: `updates.fallbackToCacheTimeout` pasó de `0` a `6000`. Decisión del owner: en arranque en frío la app espera hasta 6 s a que baje el OTA disponible y lo lanza en el acto, en vez de servir el bundle embebido con bugs viejos y aplicar el update recién en el segundo arranque. Si el update no alcanza a bajar en esos 6 s, arranca con el bundle cacheado y el camino de siempre (`isUpdatePending` → aviso de reinicio en `lib/ota.ts`) sigue funcionando igual. Es configuración de binario: **no viaja por OTA**, entra recién con la build 57 (1.1.1) y posteriores.
- 2026-08-20: `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` viven en `eas.json` (perfiles `previewv2` y `production`) y `mobile-ota.yml` las lee de ahí. Son la project API key pública de PostHog (write-only de ingesta). El binario 1.1.2 (iOS 58 / Android 85) se compiló **sin** ellas: su bundle embebido no emite analítica de producto hasta que reciba un OTA publicado con la key, o hasta la próxima build.

## Partición de runtimes vigente (2026-08-20)

`runtimeVersion.policy = appVersion` significa que **un OTA alcanza solo a los binarios cuya `version` coincide con la del `app.json` del commit que se publica**. Hoy conviven tres runtimes en el canal `production`:

| Runtime | Binario | Quién lo tiene | Cómo se le publica |
|---|---|---|---|
| `1.1.0` | 54 (iOS) / 81 (Android) | App Store y closed testing de Play — **el público** | Desde un tag `ota/1.1.0-<fecha>` creado sobre `4206f340` (último commit con `version: 1.1.0`) + cherry-picks solo-JS. Último: `ota/1.1.0-20260820` = `39e64ff8` (grupos `5d8e8110` / `bcfd1eb4`). |
| `1.1.1` | 57 / 84 | En revisión de Apple + closed testing de Play | Desde `master` mientras `app.json` diga 1.1.1 (hasta `2fdecebd`), o un tag `ota/1.1.1-<fecha>`. Último: `ota/1.1.1-20260820` = `b4d958fa` (grupos `0f32fd7d` / `c18f92d8`). |
| `1.1.2` | 58 / 85 | TestFlight + closed testing de Play | Desde `rnmobiledenuevo` (o un tag sobre ella): lleva Share Entreno, que necesita los módulos nativos de este binario. |

Reglas que salen de esto:

- **Antes de publicar, mirar `version` en `app.json` del commit que se va a exportar.** Publicar desde `master` después de un bump solo llega a la versión nueva: el 2026-08-19 los OTA de `2fdecebd` salieron a runtime 1.1.1 y los usuarios de 1.1.0 no recibieron nada hasta el tag del 20-08.
- Para alcanzar un runtime viejo: crear un worktree en el último commit con esa `version`, aplicar solo hunks de `apps/mobile` + `packages` que no toquen `package.json`/lockfile (ningún módulo nativo nuevo), correr `tsc` mobile y los tests afectados ahí, commitear, taguear `ota/<version>-<fecha>`, pushear **solo el tag** (Vercel no construye tags) y disparar `gh workflow run mobile-ota.yml --ref <tag> -f platform=<android|ios> -f branch=production -f message="…"`.
- `--platform all` **falla** (exporta web sin `react-native-web`); la opción se retiró del workflow el 2026-08-20. Siempre un dispatch por plataforma.
- Verificar con `eas update:list --branch production --limit 8 --json` que cada publicación muestre el `runtimeVersion` esperado y un grupo por plataforma.

| Perfil | Uso | Android | iOS | OTA |
|---|---|---|---|---|
| `development` | cliente de desarrollo/simulador | interno | simulador | no configurado |
| `previewv2` | QA de la rama móvil (API = preview Vercel de la rama) | APK | IPA firmada para distribución | sin canal |
| `production` | stores | AAB | IPA | canal `production` |

## Elegir OTA o binario nuevo

Publicar OTA únicamente cuando todo el cambio sea JavaScript/TypeScript o assets cargados por el bundle y funcione con las capacidades nativas ya instaladas.

Forzar build nuevo si cambia cualquiera de estos elementos:

- Expo SDK, React Native o una dependencia con código nativo;
- plugins, permisos, entitlements, privacy manifest o configuración de `app.json`;
- icono, splash, firma, bundle/package identifier o credenciales;
- `runtimeVersion`/versión de app;
- comportamiento que invoque una API nativa ausente en el binario instalado.

Ante duda, usar binario nuevo. Una migración de base de datos nunca se revierte publicando otro binario u OTA.

## Build y distribución

1. Esperar CI verde, incluido `Mobile Integration CI` para cambios en `apps/mobile` o `packages`.
2. En GitHub Actions, ejecutar `Mobile Build (Local — no EAS credits)` con `app=mobile`, plataforma y perfil correctos.
3. Para `previewv2` y `production`, el workflow inyecta las variables públicas de Supabase desde GitHub Secrets y falla si faltan.
4. Descargar y probar el artefacto el mismo día. El workflow solicita 14 días, pero la política efectiva actual del repositorio limita la retención a un día; no depender del valor solicitado sin verificar primero la configuración del repositorio.
5. Activar `submit_ios` solo para una IPA destinada a TestFlight. Activar `submit_android` solo con perfil `production`; el destino es el track `alpha` (closed testing) de Google Play (`eas.json` → `submit.production.android.track`).
6. Promover a producción solo después de smoke test en dispositivo real, sin errores de arranque, autenticación, navegación, cámara, notificaciones ni persistencia offline.

Los nombres de secretos y el procedimiento de firma viven en el workflow. Sus valores nunca se copian a Markdown, commits, logs ni comentarios de PR.

### Enviar a revisión de Apple sin la sesión web

`iOS Submit for Review (ASC API)` (`.github/workflows/ios-submit-review.yml` → `scripts/asc-submit-review.mjs`) crea la versión en App Store Connect, carga «Novedades» por locale, adjunta una build ya procesada en TestFlight, copia la App Review Information de la versión anterior si falta y envía la review submission, usando la misma API Key de `eas submit`. Reglas: correr primero con `dry_run=true` (lista versiones/estados/build y no escribe nada); aborta solo si otra versión sigue en revisión; ASC exige «Novedades» en todas las localizaciones habilitadas (hoy `es-MX` y `en-US`). `gh workflow run` solo resuelve workflows presentes en `master`. Primer uso: 1.1.2 (58) → `WAITING_FOR_REVIEW` el 2026-08-21 02:23 UTC.

## Publicación OTA

Los OTA se publican **solo** desde `.github/workflows/mobile-ota.yml` (`Mobile OTA Update` en GitHub Actions). Publicar a mano desde una máquina local está prohibido por runbook: el incidente del 2026-08-11 fueron tres OTA android publicados localmente cuyo bundle salió sin `EXPO_PUBLIC_SUPABASE_URL` y crasheaba al boot. El workflow usa las mismas secrets que las builds y falla antes de publicar si alguna está vacía.

Antes de publicar:

- confirmar por diff que no hay cambios nativos;
- correr `pnpm --filter @eva/mobile exec tsc --noEmit` y las pruebas afectadas;
- registrar commit, versión de app, canal y motivo (el input `message` del workflow es obligatorio y es ese registro).

`production` es el único canal OTA (`staging` fue retirado 2026-07-29). No usar `previewv2` como destino mientras siga sin canal.

En runtime, `checkForOtaUpdate()` consulta al abrir y al volver a foreground, con máximo un intento por hora. Descarga en segundo plano y ofrece reiniciar; en desarrollo, cuando Updates está deshabilitado o ante error, no altera el arranque.

## Observabilidad (Sentry)

Un release móvil no está entregado hasta que sus símbolos están en Sentry. Un crash sin sourcemap ni dSYM es un stack trace minificado: sirve para contar, no para arreglar.

Piezas y quién hace qué:

| Pieza | Dónde | Qué aporta |
|---|---|---|
| `getSentryExpoConfig` | `apps/mobile/metro.config.js` | estampa el Debug ID en bundle y sourcemap; sin él ningún mapa matchea |
| plugin `@sentry/react-native/expo` | `apps/mobile/app.json` | escribe `sentry.properties` con org `eva-zs` y proyecto `eva-mobile` |
| `SENTRY_AUTH_TOKEN` | secret de GitHub Actions | credencial de subida; nunca en `eas.json` ni en Markdown |
| `Sentry.init` | `apps/mobile/app/_layout.tsx` | gateado por `EXPO_PUBLIC_SENTRY_DSN`; sin DSN es no-op total |

- 2026-08-19: se quitó `SENTRY_DISABLE_AUTO_UPLOAD` de los perfiles `production` y `previewv2` de `eas.json`. Desde entonces el build sube sourcemaps (Android vía `sentry.gradle`, iOS vía sus build phases) y dSYMs como parte del propio build.
- `mobile-build.yml` trae un guard **duro**: sin `SENTRY_AUTH_TOKEN` la build falla antes de empezar. Un binario que se instala en tiendas y no se puede simbolizar no vale el ciclo de build.
- `mobile-ota.yml` trae un guard **suave**: sin el secret avisa y sigue. El contraste es deliberado — un OTA suele ser un hotfix con gente rota esperando, y ya está publicado cuando corre ese paso.
- El OTA sube sus sourcemaps con `sentry-expo-upload-sourcemaps dist` (binario de `@sentry/react-native`). No sustituirlo por `sentry-cli` a mano: el wrapper copia `debugId` a `debug_id` en el mapa antes de subirlo, y ese paso es el que hace que el mapa matchee con el bundle.
- Crear el token: sentry.io → Settings → Auth Tokens, scopes `project:releases`, `org:read` y `project:write`. Guardarlo como secret `SENTRY_AUTH_TOKEN` en GitHub → Settings → Secrets and variables → Actions. Su valor nunca se copia a Markdown, commits ni logs.

## Rollback e incidente

- OTA defectuoso: publicar el commit JS conocido-bueno al mismo canal y la misma `runtimeVersion`; luego verificar en un binario real.
- Cambio nativo defectuoso: detener rollout/submit y preparar otro binario. El OTA no puede retirar código nativo.
- Crash de arranque: conservar el artefacto, commit, perfil y logs de Actions/Sentry; no publicar cambios adicionales hasta aislar si el fallo es bundle, entorno, firma o código nativo.
- Base de datos: aplicar solo correcciones forward-only mediante el runbook de DB; no hacer rollback destructivo desde la app.
