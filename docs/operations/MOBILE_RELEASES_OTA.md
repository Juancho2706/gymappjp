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

## Regla del piso (owner, 2026-08-22): OTA solo desde la versión aprobada por Apple hacia arriba

Antes de publicar, **leer el estado real en App Store Connect** (workflow `ios-submit-review.yml` con `dry_run=true`
imprime «Versiones iOS: x=ESTADO · …»; no asumir desde docs). Se publica a la versión `READY_FOR_SALE` vigente y a las
superiores (en revisión / TestFlight); a runtimes anteriores **no** (el público real ya migró y cada runtime viejo cuesta
un port manual). Android sigue la misma partición. Cuando Apple aprueba una versión nueva, el piso sube.
Aplicado el 2026-08-22: piso 1.1.1 (READY_FOR_SALE) ⇒ OTA a 1.1.1 y 1.1.2; 1.1.0 descartado (tags
`ota/1.1.1-20260822` = `e1d9cdcd`, `ota/1.1.2-20260822` = `a1c2f2f9`; lleva W4+W5+W6 del embudo Free→Pro).
Grupos publicados el 22-08 05:1xZ, los 4 verdes: 1.1.1 android `d4df67f0` (run 32553706927) · 1.1.1 ios `b337b986`
(32553708216) · 1.1.2 android `3974482f` (32553709725) · 1.1.2 ios `caa038a2` (32553711196). El port a 1.1.1 va sin
`app.json` y sin la telemetría `upgrade_gate_hit` del muro (ese runtime no tiene `lib/analytics`).
Segunda aplicación el mismo 2026-08-22 (14:45Z; ASC releído a las 14:38Z: 1.1.2 seguía `WAITING_FOR_REVIEW`, piso 1.1.1): `ota/1.1.2-20260822b` = `8cf7b886`
(master: onboarding v2 RN de DOMINGO + fixes W6.10 del embudo + header `x-eva-platform`) → android `17fa6905` (run 32579444509) / ios `93834df2`
(32579446106); `ota/1.1.1-20260822b` = `abbd7f87` (port MÍNIMO: solo W6.10 + header, sin onboarding v2 — ese runtime no tiene `@eva/onboarding` ni
`persona.ts`, y 1.1.2 trae deps nativas nuevas, así que no se mergea) → android `230bd40b` (32579595187) / ios `65033c6d` (32579596832). Los 4 verdes.
Regla aprendida: cuando el bundle nuevo consume rutas web nuevas (`api/mobile/coach/persona`), el OTA se dispara DESPUÉS de ver el deploy de
master en prod (sonda: la ruta deja de dar 404), nunca antes.
Tercera y cuarta tanda del 22-08: `ota/1.1.2-20260822c` = `1937ede7` (DOMINGO: píldora de la guía, teaser → se desliza al botón y sigue a la
cápsula del nav; grupos `4818b015` android / `f9790a83` ios, runs 32581116703/32581118082) · `ota/1.1.2-20260822d` = `443aa350` (alta corta
del home abre el muro de cupo + acceso por WhatsApp con la plantilla por persona sin EVA; grupos `d8af5381` android (32581397130) /
`4bd9dfd2` ios (32581398959)) · `ota/1.1.1-20260822c` = `101ac299` (port de 443aa350 sin analytics ni gate de persona; se llevó
`packages/schemas/persona.ts` al worktree porque `formatWhatsappInvite` lo necesita; grupos `b7c249d3` android (32581492198) / `0404b8be` ios
(32581494202)). Los 4 verdes. El worktree del port sigue en `$CLAUDE_JOB_DIR/tmp/wt-ota-1.1.1` (HEAD `101ac299`).

## Partición de runtimes vigente (2026-08-21)

`runtimeVersion.policy = appVersion` significa que **un OTA alcanza solo a los binarios cuya `version` coincide con la del `app.json` del commit que se publica**. Hoy conviven tres runtimes en el canal `production`:

| Runtime | Binario | Quién lo tiene | Cómo se le publica |
|---|---|---|---|
| `1.1.0` | 54 (iOS) / 81 (Android) | App Store y closed testing de Play — **el público** | Desde un tag `ota/1.1.0-<fecha>` creado sobre `4206f340` (último commit con `version: 1.1.0`) + cherry-picks solo-JS. Último: `ota/1.1.0-20260821` = `c5501cc3` (Pricing v3; grupos `4b12bb78` android / `c095d5e1` ios). Anterior: `ota/1.1.0-20260820` = `39e64ff8`. |
| `1.1.1` | 57 / 84 | App Store (aprobada 21-08) + closed testing de Play | Desde `master` mientras `app.json` diga 1.1.1 (hasta `2fdecebd`), o un tag `ota/1.1.1-<fecha>`. Último: `ota/1.1.1-20260822c` = `101ac299` (muro en el alta corta + invite sin EVA; grupos `b7c249d3` android / `0404b8be` ios). Anteriores: `ota/1.1.1-20260822b` = `abbd7f87` (W6.10 + header `x-eva-platform`; `230bd40b` / `65033c6d`), `ota/1.1.1-20260822` = `e1d9cdcd` (W4+W5+W6), `ota/1.1.1-20260821` = `fce4ceb8` (Pricing v3), `ota/1.1.1-20260820` = `b4d958fa`. |
| `1.1.2` | 58 / 85 | TestFlight + closed testing de Play | Desde `rnmobiledenuevo` (o un tag sobre ella): lleva Share Entreno, que necesita los módulos nativos de este binario. Último: `ota/1.1.2-20260822d` = `443aa350` (muro en el alta corta + invite por persona; grupos `d8af5381` android / `4bd9dfd2` ios). Anteriores: `ota/1.1.2-20260822c` = `1937ede7` (píldora de la guía; `4818b015` / `f9790a83`), `ota/1.1.2-20260822b` = `8cf7b886` (onboarding v2 RN + W6.10 + header; `17fa6905` / `93834df2`), `ota/1.1.2-20260822` = `a1c2f2f9` (W4+W5+W6), `ota/1.1.2-20260821` = `2edea500` (Pricing v3). |

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
| `Sentry.init` | `apps/mobile/lib/sentry-boot.ts` (importado SEGUNDO en `app/_layout.tsx`, detrás de gesture-handler) | gateado por `EXPO_PUBLIC_SENTRY_DSN`; sin DSN es no-op total. Desde 2026-08-21 corre ANTES del grafo de imports y etiqueta cada evento con `ota.update_id` / `ota.runtime` / `ota.channel` / `ota.embedded_launch` / `ota.emergency_launch` (+ un `warning` si expo-updates arrancó de emergencia) y con el uid del usuario (`syncSentryUser`, solo id) |
| Lifecycle events | `apps/mobile/lib/analytics.ts` (PostHog) | `Application Opened/Installed/Updated/Backgrounded` con `$app_version`/`$app_build` reales (expo-constants) y super-properties `ota_update_id` / `ota_runtime` / `ota_channel`: la única señal de qué binario y qué OTA corre cada device |

- 2026-08-19: se quitó `SENTRY_DISABLE_AUTO_UPLOAD` de los perfiles `production` y `previewv2` de `eas.json`. Desde entonces el build sube sourcemaps (Android vía `sentry.gradle`, iOS vía sus build phases) y dSYMs como parte del propio build.
- `mobile-build.yml` trae un guard **duro**: sin `SENTRY_AUTH_TOKEN` la build falla antes de empezar. Un binario que se instala en tiendas y no se puede simbolizar no vale el ciclo de build.
- `mobile-ota.yml` trae un guard **suave**: sin el secret avisa y sigue. El contraste es deliberado — un OTA suele ser un hotfix con gente rota esperando, y ya está publicado cuando corre ese paso.
- El OTA sube sus sourcemaps con `sentry-expo-upload-sourcemaps dist` (binario de `@sentry/react-native`). No sustituirlo por `sentry-cli` a mano: el wrapper copia `debugId` a `debug_id` en el mapa antes de subirlo, y ese paso es el que hace que el mapa matchee con el bundle.
- Crear el token: sentry.io → Settings → Auth Tokens, scopes `project:releases`, `org:read` y `project:write`. Guardarlo como secret `SENTRY_AUTH_TOKEN` en GitHub → Settings → Secrets and variables → Actions. Su valor nunca se copia a Markdown, commits ni logs.
- **Crash de arranque sin rastro (lección 2026-08-21, Galaxy S24 + build 85):** hasta ese día `Sentry.init` corría después de ~59 imports, así que un throw a tiempo de módulo o un crash nativo del arranque no dejaba NADA en Sentry; PostHog móvil no emitía lifecycle events (no se sabía qué versión corría el device); Play Console › Android vitals tarda ~24 h en mostrar un crash y el informe previo al lanzamiento nunca se generó para la app. Qué hacer hoy ante un «EVA se cerró»: (1) device por USB con depuración → `adb shell dumpsys dropbox --print data_app_crash` trae el stack sin reproducir (Android lo guarda días); (2) Sentry con filtro `ota.update_id` separa «crashea el OTA» de «crashea el binario»; (3) PostHog `Application Opened` por `$app_build` dice quién corre qué; (4) para aislar el bundle sin device: `eas update:republish` del grupo anterior a `production/android`.

## Rollback e incidente

- OTA defectuoso: publicar el commit JS conocido-bueno al mismo canal y la misma `runtimeVersion`; luego verificar en un binario real.
- Cambio nativo defectuoso: detener rollout/submit y preparar otro binario. El OTA no puede retirar código nativo.
- Crash de arranque: conservar el artefacto, commit, perfil y logs de Actions/Sentry; no publicar cambios adicionales hasta aislar si el fallo es bundle, entorno, firma o código nativo.
- Base de datos: aplicar solo correcciones forward-only mediante el runbook de DB; no hacer rollback destructivo desde la app.
