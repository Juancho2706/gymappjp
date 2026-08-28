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
- 2026-08-20: `EXPO_PUBLIC_POSTHOG_KEY` / `EXPO_PUBLIC_POSTHOG_HOST` viven en `eas.json` (perfiles `previewv2` y `production`) y `mobile-ota.yml` las lee de ahí. Son la project API key pública de PostHog (write-only de ingesta). El binario 1.1.2 (iOS 58 / Android 85) se compiló **sin** ellas: su bundle embebido no emite analítica de producto hasta que reciba un OTA publicado con la key, o hasta la próxima build. **Cerrado 2026-08-28:** las builds 86 (Android, 21-08, `eb665848`) y 59 (iOS, 26-08, `b9b38b9f`) descienden de `a2cca2a5` ⇒ ya llevan la key embebida.

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
**Excepción puntual (owner, 2026-08-22 tarde):** `ota/1.1.0-20260822` = `024fd435` — port solo-JS de `ee560977` (teclado numérico del editor de pautas con «Listo»/✓) sobre `ota/1.1.0-20260821`, porque `eas channel:insights production --runtime-version 1.1.0` (7 d) mostró **65 usuarios únicos** en 1.1.0 contra 26 en 1.1.1 y 25 en 1.1.2: el público NO había migrado. La regla sigue vigente; cada excepción se decide con ese número a la vista. Publicado 19:10Z: grupos `a730fe6e` android (run 32592931370) / `bfad5f7d` ios (32592933543), ambos verdes.
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
(32581494202)). Los 4 verdes.
Quinta tanda (16:4xZ): `ota/1.1.2-20260822e` = `4a914dc0` (mensajes de WhatsApp sin 👋 — WhatsApp Desktop Windows lo rompe; grupos `e3267430`
android (32582226693) / `c2bfd97c` ios (32582228383)) · `ota/1.1.1-20260822d` = `e240d15d` (mismo port; grupos `4c163825` android (32582232091) /
`4956af62` ios (32582233803)). Los 4 verdes. El worktree del port sigue en `$CLAUDE_JOB_DIR/tmp/wt-ota-1.1.1` (HEAD `e240d15d`).

**Aplicación del 2026-08-28 (el piso sube a 1.1.2):** ASC releído con `ios-submit-review.yml` `dry_run=true` (run 33212983838): `1.1.2=READY_FOR_SALE · 1.1.1=READY_FOR_SALE · 1.1.0=READY_FOR_SALE`. Diff `b9b38b9f` (build 59) → `1e25229c` sin cambio nativo (`package.json`, lockfile y `plugins/` intactos; lo único de binario es `34d1187a`, que estrecha los intentFilters Android a `/c/.*/login` — va en el próximo binario, sin fecha) ⇒ OTA iOS desde `master` @`1e25229c` (keypad: primer dígito reemplaza + tope 999) → runtime 1.1.2, grupo `d402f897` (run 33213145463, verde). Android 1.1.2 ya lo tenía (`1df2ff6d`, 27-08) y 1.1.1 lo recibió por port (`1de993fd` = `6e5c9ccb`). Desde hoy 1.1.1 no recibe ports salvo excepción decidida con `eas channel:insights --channel production --runtime-version 1.1.1` a la vista (7 d al 28-08: 1.1.0 = 2 usuarios únicos embebido + 4 OTA · 1.1.1 = 13 + 49 · 1.1.2 = 20 + 39).

## Partición de runtimes vigente (2026-08-21)

`runtimeVersion.policy = appVersion` significa que **un OTA alcanza solo a los binarios cuya `version` coincide con la del `app.json` del commit que se publica**. Hoy conviven tres runtimes en el canal `production`:

| Runtime | Binario | Quién lo tiene | Cómo se le publica |
|---|---|---|---|
| `1.1.0` | 54 (iOS) / 81 (Android) | App Store y closed testing de Play — **el público** | Desde un tag `ota/1.1.0-<fecha>` creado sobre `4206f340` (último commit con `version: 1.1.0`) + cherry-picks solo-JS. Último: `ota/1.1.0-20260822` = `024fd435` (excepción: teclado numérico `ee560977`; grupos `a730fe6e` android / `bfad5f7d` ios). Anteriores: `ota/1.1.0-20260821` = `c5501cc3` (Pricing v3; grupos `4b12bb78` android / `c095d5e1` ios), `ota/1.1.0-20260820` = `39e64ff8`. |
| `1.1.1` | 57 / 84 | App Store hasta que el público migre a 1.1.2 (piso desde 28-08: sin ports nuevos salvo excepción por insights) | Desde `master` mientras `app.json` diga 1.1.1 (hasta `2fdecebd`), o un tag `ota/1.1.1-<fecha>`. Último: `ota/1.1.1-20260822n` = `8b59900d` (mismo fix del splash: tile 144, relevo sin parpadeo; grupos `3866fdc7` android (run 32603496757) / `83bd6ee7` ios (32603498092)). Anterior: `ota/1.1.1-20260822m` = `e20fef42` (mismo fix del splash; grupos `003a2534` android (run 32601883117) / `00e0f786` ios (32601884476)). Anterior: `ota/1.1.1-20260822l` = `aecac05f` (causa raíz white-label: vars() por identidad en ThemeContext, glow/Avatar/parser logo/LoaderPreview; sin el bloque onboarding v2; grupos `d75fd1f0` android (run 32601021200) / `64b7c43d` ios (32601022764)). Anterior: `ota/1.1.1-20260822k` = `8c1faf2c` (marca del coach en Opciones/header/FAB, Herramientas, splash/loaders con marca; sin el copy del cupo ni Mi panel, que dependen de onboarding v2; grupos `dfda0cc1` android (run 32599730247) / `0a0b119c` ios (32599731663)). Anterior: `ota/1.1.1-20260822j` = `371a0362` (QA Android del owner 22-08: cupo sin demo, ⋮ en dark, Mi marca unificada, guardar plan con overlay — sin el gate de persona, que 1.1.1 no tiene; grupos `3c5c3a56` android (run 32596723355) / `daae8f00` ios (32596724754)). Anterior: `ota/1.1.1-20260822i` = `142fc894` (port de los fixes del coach 22-08: borrar plantillas V2, «Ver el plan del día», clave temporal copiable/WhatsApp, modales con la X fuera del notch; grupos `a32f81fa` android (run 32593724739) / `2c8f7797` ios (32593726116)). Anterior: `ota/1.1.1-20260822h` = `4005e0f9` (solo el ⋮ de la fila del alumno en dark; grupos `3284fd6c` android (32585910963) / `bc95f4a7` ios (32585913059)). Anteriores: `ota/1.1.1-20260822g` = `2b19321a` (mismo port; grupos `3a22af0b` android / `11b5d8af` ios). Anterior: `ota/1.1.1-20260822f` = `c94e621c` (mismo port; grupos `f66dab4b` android / `c76712a9` ios). Anterior: `ota/1.1.1-20260822e` = `51fffada` (teclado numérico del editor de pautas con «Listo» en iOS / ✓ en Android; grupos `e841fe3c` android / `a9c96a83` ios), `ota/1.1.1-20260822d` = `e240d15d` (WhatsApp sin emoji; `4c163825` / `4956af62`), `ota/1.1.1-20260822c` = `101ac299` (muro en el alta corta + invite sin EVA; `b7c249d3` / `0404b8be`), `ota/1.1.1-20260822b` = `abbd7f87` (W6.10 + header `x-eva-platform`; `230bd40b` / `65033c6d`), `ota/1.1.1-20260822` = `e1d9cdcd` (W4+W5+W6), `ota/1.1.1-20260821` = `fce4ceb8` (Pricing v3), `ota/1.1.1-20260820` = `b4d958fa`. |
| `1.1.2` | 58→59 (iOS) / 85→86 (Android) | **App Store (`READY_FOR_SALE` 28-08) + closed testing Alpha de Play — el piso** | Desde `master` (= `rnmobiledenuevo`; `app.json` sigue en 1.1.2). Último: `master` @`1e25229c` (keypad: reemplaza + tope 999; grupos android `1df2ff6d` (27-08, run 33092462018) / ios `d402f897` (28-08, run 33213145463)); entre el 23-08 y el 27-08 los OTA salieron desde la rama sin tag (ver `eas update:list`). Anterior: `ota/1.1.2-20260822o` = `4cefb6ca` (splash con marca: tile 144 = alto visible del icono nativo, relevo en dos tiempos sin parpadeo (overlay invisible hasta `painted`), sin destello de la firma EVA; grupos `94392187` android (run 32603492445) / `544b7233` ios (32603493732)). Anterior: `ota/1.1.2-20260822n` = `15f86f3f` (el splash cruza de verdad a la marca del coach: la marca entraba por setTimeout(0) y perdía la carrera contra el render que navega; grupos `2fbf10b6` android (run 32601878198) / `c113c28f` ios (32601879841)). Anterior: `ota/1.1.2-20260822m` = `dd27abf0` (causa raíz del white-label: ThemeContext pasaba vars() por spread y ninguna variable de marca aplicaba — ahora por identidad; glowSport, Avatar teñido, logoUrl del API, LoaderPreview; grupos `2b20af4f` android (run 32600649416) / `0cdef0b4` ios (32600651089)). Anterior: `ota/1.1.2-20260822l` = `b74dfc53` (marca del coach en Opciones/header/FAB, Herramientas rediseñada, splash/loaders con marca, copy del cupo sin nombre del demo, guía con memoria por especialidad; grupos `ffda2b7f` android (run 32599351869) / `27521179` ios (32599353873)). Anterior: `ota/1.1.2-20260822k` = `92523319` (QA Android del owner: el alumno de ejemplo no ocupa cupo, ⋮ en dark, gate de especialidad no se repite, Mi marca con una sola «Pantalla de carga», guardar plan con overlay verde; grupos `360efecb` android (run 32596390729) / `3ad93947` ios (32596392342)). Anterior: `ota/1.1.2-20260822j` = `6eeda57d` (iPhone vuelve a la app al confirmar —web—, borrar plantillas V2, «Ver el plan del día», clave temporal, modales/notch; grupos `02d2bedc` android (run 32593633216) / `1922a54b` ios (32593635820)). Anterior: `ota/1.1.2-20260822h` = `95f0cbde` (QA del owner: la guía aterriza en el paso siguiente, marca EVA en los pasos, «Ver mi app» explicado, Mi panel RN, paso 3 template-first y alta guiada RN, ⋮ en dark; grupos `37f1ec76` android (32585883853) / `1fb68587` ios (32585885704)). Anteriores: `ota/1.1.2-20260822i` = `9b2f15f5` (Mi plan: cupo en una línea, callout Android, celebración EVA; grupos `28ca5f8d` android / `8cced802` ios). Anterior: `ota/1.1.2-20260822g` = `9f6ca283` (verify-email entra solo + vuelta a la app tras confirmar + registro; grupos `f17092d4` android / `d1abbacd` ios). Anterior: `ota/1.1.2-20260822f` = `ee560977` (teclado numérico del editor de pautas con «Listo» en iOS / ✓ en Android; grupos `a3499531` android / `b7f88874` ios), `ota/1.1.2-20260822e` = `4a914dc0` (WhatsApp sin emoji; `e3267430` / `c2bfd97c`), `ota/1.1.2-20260822d` = `443aa350` (muro en el alta corta + invite por persona; `d8af5381` / `4bd9dfd2`), `ota/1.1.2-20260822c` = `1937ede7` (píldora de la guía; `4818b015` / `f9790a83`), `ota/1.1.2-20260822b` = `8cf7b886` (onboarding v2 RN + W6.10 + header; `17fa6905` / `93834df2`), `ota/1.1.2-20260822` = `a1c2f2f9` (W4+W5+W6), `ota/1.1.2-20260821` = `2edea500` (Pricing v3). |
Sexta tanda (17:2xZ): `ota/1.1.2-20260822g` = `9f6ca283` (verify-email entra solo al panel con las credenciales del alta en memoria + vuelta desde el
correo por `eva://auth/confirmed` + registro sin pill y contraseña visible; grupos `f17092d4` android (32583939815) / `d1abbacd` ios (32583941257)) ·
`ota/1.1.1-20260822f` = `c94e621c` (mismo port sobre 51fffada; grupos `f66dab4b` android (32584019869) / `c76712a9` ios (32584021321)). Los 4 verdes.
El worktree del port queda en `c94e621c`. Nota web asociada: `/auth/confirm` con `src=app` en Android redirige a `intent://…scheme=eva;package=cl.evaapp.eva`
(c6df14ff); un alta hecha ANTES de ese deploy no lleva `src=app` y sigue aterrizando en el panel web.
Séptima tanda (17:5xZ): `ota/1.1.2-20260822i` = `9b2f15f5` (Mi plan: cupo en una línea, aviso Android como callout, celebración con figura EVA +
check; grupos `28ca5f8d` android (32584579327) / `8cced802` ios (32584580609)) · `ota/1.1.1-20260822g` = `2b19321a` (mismo port; grupos
`3a22af0b` android (32584634910) / `11b5d8af` ios (32584636432)). Los 4 verdes. Worktree del port en `2b19321a`.

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
