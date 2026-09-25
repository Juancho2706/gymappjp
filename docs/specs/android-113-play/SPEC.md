---
status: active
owner: mobile-release
last_verified: "2026-09-25 @ a2a5e7b3"
canonical: false
---

# SPEC — Android 1.1.3: limpiar los dos avisos de Play sin romper nada

> Android 1.1.2 (versionCode 86) está pública en Play desde el 22-09. El panel de la versión de
> producción marca **dos problemas** que hoy no bloquean nada: servicios en primer plano de tipo
> restringido junto a receptores de `BOOT_COMPLETED`, y **ofuscación DEX del 1 %** (umbral 25 %,
> obligatorio desde **febrero de 2027**). Este tren los cierra con **dos binarios Android 1.1.3**
> (A y B) sin tocar iOS, sin migraciones y sin cambiar el comportamiento de la app para el usuario.
>
> Origen: sesión del owner del 24/25-09 (decisiones D1–D8 en §4). Plan en [PLAN.md](PLAN.md);
> tareas en [TASKS.md](TASKS.md).

**Cero migraciones, cero RPC, cero pantallas nuevas.** Lo que cambia es configuración nativa de
Android (`app.json`, un config plugin, CI) y, como requisito de publicación, la página web
`/privacidad`.

---

## 1. El problema, con evidencia (verificada contra HEAD `a2a5e7b3`)

| # | Aviso de Play | Causa real | Evidencia |
|---|---|---|---|
| P1 | «Servicios en primer plano restringidos que se inician desde `BOOT_COMPLETED`» | `expo-audio` 1.1.1 declara **en el manifest de la librería** `AudioControlsService` (`mediaPlayback`) y `AudioRecordingService` (`microphone`), más `FOREGROUND_SERVICE_MEDIA_PLAYBACK`. Su plugin no los quita. La app tiene 3 receptores de `BOOT_COMPLETED` legítimos ⇒ el análisis estático de Google cruza ambos. | `node_modules/.pnpm/expo-audio@1.1.1…/android/src/main/AndroidManifest.xml`; issue abierto expo/expo#41627 (SDK 54, sin fix oficial) |
| P2 | «Optimización DEX bajo el umbral: Ofuscación 1 %» | R8 apagado: `expo-build-properties` solo fija `minSdkVersion` (`apps/mobile/app.json`); `android/` es CNG, no versionado. | Play exige ≥ 25 % en **ofuscación, optimización y reducción** para apps con > 10 MB de DEX desde feb 2027 ([ayuda de Play](https://support.google.com/googleplay/android-developer/answer/17492799)) |

**Por qué los servicios nunca arrancan hoy (y por eso quitarlos es seguro):** EVA usa `expo-audio`
solo para `createAudioPlayer` + `setAudioModeAsync({ shouldPlayInBackground: false })`
(`apps/mobile/components/alumno/workout/timers/sound.ts:128-176`). `AudioControlsService` solo se
inicia desde `AudioPlayer.setActiveForLockScreen` (`AudioPlayer.kt:103-110`) y
`AudioRecordingService` solo desde la grabación (`AudioRecorder.kt:103`); ninguna de las dos APIs
aparece en `apps/mobile`. Las referencias estáticas restantes (`AudioControlsService.clearSession()`
en `AudioModule.kt:272` y `AudioPlayer.kt:283`) hacen `getInstance()?.…` y no tocan el manifest.
`expo-video` no se importa en ningún archivo (solo un comentario en `useRestTimerEngine.ts:52`) y
no declara servicio. Es el único par de servicios con tipo restringido entre las librerías nativas
de `apps/mobile`: `react-native-notify-kit` declara `app.notifee.core.ForegroundService` **sin**
tipo y `expo-notifications` solo su servicio de FCM.

## 2. Lo que Android 1.1.3 trae SÍ O SÍ (nativo acumulado desde el build 86, `eb665848`, 21-08)

Cualquier binario nuevo de Android arrastra esto; iOS 1.1.3 ya lo tiene en producción desde el 16-09.
Cada fila es un cambio de comportamiento que el QA de A tiene que mirar.

| Cambio | Commit | Efecto en Android |
|---|---|---|
| SDK de Meta (`react-native-fbsdk-next` 13.4.3 → `facebook-android-sdk:18.+`) + `expo-tracking-transparency` | `17eca043` (15-09) | Meta activo: `fb_mobile_activate_app` automático en cada arranque (**todos los usuarios, alumnos incluidos**, sin hoja de consentimiento: ATT es solo iOS) y `fb_mobile_complete_registration` en el alta de coach. El SDK agrega `com.google.android.gms.permission.AD_ID` ⇒ Play **rechaza el envío** si la declaración de ID de publicidad dice «No». |
| App Links: `/c/.*/login` (antes `pathPrefix /c/`), fuera `/invite/` | `34d1187a` (26-08) | Arregla en Android el bug «Vive tu app» (todo el árbol `/c/…` del alumno se abría en la app). El link pelado `/c/{coach}` ya no lo reclama la app: la web redirige a `/c/{coach}/login` y Chrome re-evalúa el redirect. Guard: `tests/mobile/applinks-claims.test.ts`. |
| App Link `/coach/subscription` (ambos hosts) | `a1c2f2f9` (22-08) | **Hueco de embudo:** los correos de venta (drip, checkout abandonado, comportamiento) llevan su CTA a `/coach/subscription?utm_…` (`apps/web/src/lib/email/*`). En un Android con EVA instalada ese CTA abre «Mi plan» en la app, que **no tiene camino de pago** (política de tiendas: una línea sin link, `subscription.tsx:271`). Hoy pasa lo mismo en iOS (el AASA lo reclama desde el 26-08). **D5: sale de ambos.** |
| `@eva/client-dossier`, `@eva/onboarding`, `@react-navigation/native` | varios | Solo JS; ya corren en iOS 1.1.3 y en los ports de Android 1.1.2. |

## 3. Usuarios afectados

- **Coaches y alumnos con Android** (Play, producción): reciben la actualización a 1.1.3 sin
  cambios visibles salvo App Links (§2) y el SDK de Meta.
- **Owner** (operación): declaraciones en Play Console, QA en dispositivo, publicación.
- **iOS:** ningún binario ni OTA nuevo. Único efecto: con D5, el AASA (deploy web) deja de
  reclamar `/coach/subscription` ⇒ ese link abre la web también en iPhone.

## 4. Decisiones

### Tomadas por el owner (25-09, opción múltiple)

- **D1. Meta en Android: activo.** Antes de enviar A a producción: Play Console → «Contenido de la
  app → ID de publicidad = Sí» y «Seguridad de los datos» actualizada (§6.3), y la política de
  privacidad web menciona a Meta.
- **D2. Dos binarios con versionName 1.1.3:** A (bajo riesgo, P1) primero; B (R8, P2) después, con
  QA propio. Play acepta el mismo versionName con versionCode distinto (remoto: hoy 86 ⇒ A = 87,
  B = 88 si no hay builds intermedios).
- **D3. Producción al 100 % directo**, sin lanzamiento por etapas.
- **D4. Cada plataforma sube su versión sola.** Hoy coinciden en 1.1.3 (runtime OTA compartido);
  cuando diverjan vuelve la partición de runtimes de `MOBILE_RELEASES_OTA.md`.

### Tomadas por el owner con el plan (25-09, opción múltiple)

- **D5 (Q1). El App Link `/coach/subscription` sale de Android y de iOS.** Android: se borran sus
  2 `intentFilters` en A. iOS: se quita del AASA por deploy web (sin binario). Los CTA de los correos
  de venta vuelven a abrir la web, que sí cobra.
- **D6 (Q2). Sin pista de prueba: cada binario se sube directo a la pista de producción.** El QA del
  owner pasa a ser (a) opcional durante la revisión de Google, con el APK universal firmado que
  ofrece el explorador de app bundles, y (b) smoke en el teléfono tras la publicación. Para B la
  red previa es automática: guard del AAB + piso de ofuscación en CI antes del submit (PLAN §3.4).
- **D7 (Q3). `/privacidad` se completa:** Meta, Sentry, Flow y Google además de los subprocesadores
  actuales; la §9 deja de negar el rastreo de terceros.
- **D8 (Q4). Meta queda igual que iOS:** `fb_mobile_activate_app` automático para todos los usuarios
  de Android, declarado en Play y en `/privacidad`. Sin cambios de código.

## 5. Objetivos y no objetivos

**Objetivos**

1. El panel de la versión de producción de Android deja de mostrar P1 (binario A).
2. Ofuscación, optimización y reducción ≥ 25 % en el explorador de app bundles para el AAB de B,
   con margen (meta ≥ 35 %), antes de febrero de 2027.
3. **Cero regresiones**: todo lo que funciona hoy en Android 1.1.2 sigue funcionando igual (§6.1).
4. Crashes nativos de B legibles: mapping de R8 en Play (automático en el AAB) y en Sentry.
5. Guardas automáticas para que ninguna build futura reintroduzca P1 ni rompa las invariantes.

**No objetivos**

- Subir expo-audio, Expo SDK o cualquier dependencia (regla de `AGENTS.md`).
- Arreglar las recomendaciones no bloqueantes de Play (APIs edge-to-edge obsoletas, orientación
  fija en pantallas grandes).
- Quitar `RECORD_AUDIO` (lo pide también `expo-camera`), `FOREGROUND_SERVICE` (lo usa notify-kit)
  o cualquier receptor de `BOOT_COMPLETED`.
- `enableShrinkResourcesInReleaseBuilds` (borra recursos resueltos por nombre, p. ej. el ícono de
  notificación de notify-kit, y no suma a la métrica DEX).
- Badge de Google Play en la landing (`apps/web/src/lib/app-links.ts:15`
  `ANDROID_STORE_IS_PUBLIC = false`, `landing-v2/Hero.tsx:307` «Solo iOS»): cambio web aparte.
- Binario iOS nuevo.

## 6. Criterios de aceptación

### 6.1 Invariantes «no romper» (aplican a A y a B)

- [ ] Los 3 receptores de `BOOT_COMPLETED` siguen en el manifest fusionado:
      `app.notifee.core.RebootBroadcastReceiver`, `androidx.work.impl.background.systemalarm.RescheduleReceiver`
      y el de `expo.modules.notifications`.
- [ ] Siguen `FOREGROUND_SERVICE`, `RECORD_AUDIO`, `RECEIVE_BOOT_COMPLETED`, `POST_NOTIFICATIONS`,
      los 6 permisos `health.*`, cámara y biometría.
- [ ] Sonidos del cronómetro (4 timbres, tick 3-2-1, tono del sistema), notificación en vivo del
      descanso con botones y en pantalla bloqueada, háptica.
- [ ] Notificaciones locales programadas sobreviven a un reinicio del teléfono; push recibido.
- [ ] Login email y Google, biometría, Salud Conectada, sensor BLE, cámara/escáner, galería, Share
      Entreno (Skia + view-shot + share), impresión/PDF, selector de documentos, WebView de videos.
- [ ] OTA: el binario arranca con su bundle embebido y aplica un OTA de runtime 1.1.3.
- [ ] iOS: sin cambios de binario ni de OTA; `app.json` solo cambia en claves exclusivas de Android.
      El AASA solo pierde `/coach/subscription` (D5); el resto de sus reclamos queda igual.
- [ ] Android 1.1.2 sigue recibiendo sus OTA por tag hasta que su público migre (A9).

### 6.2 Binario A (P1)

- [ ] El AAB no contiene `expo.modules.audio.service.AudioControlsService`,
      `expo.modules.audio.service.AudioRecordingService` ni `FOREGROUND_SERVICE_MEDIA_PLAYBACK`;
      ningún `<service>` declara tipo `mediaPlayback`, `microphone`, `camera`, `dataSync`,
      `phoneCall` ni `mediaProjection`. Lo verifica un guard de CI sobre el AAB (bundletool).
- [ ] El AAB contiene `com.google.android.gms.permission.AD_ID` (D1) y versionName `1.1.3`.
- [ ] Test que impide usar `setActiveForLockScreen` o cualquier API de grabación de expo-audio sin
      retirar antes el plugin que quita los servicios.
- [ ] Play Console → panel de la versión de A: P1 ya no aparece.
- [ ] Declaraciones de Play (ID de publicidad + Seguridad de los datos) y `/privacidad` alineadas
      con lo que el SDK de Meta hace (§6.3) **antes** del envío a producción.
- [ ] App Link `/coach/subscription` fuera de `app.json` y del AASA (D5), con
      `applinks-claims.test.ts` al día.
- [ ] Smoke del owner en su teléfono tras la publicación (TASKS W2.6); QA con el APK universal
      durante la revisión, opcional (D6).

### 6.3 Declaraciones y política (requisito de publicación)

- Play Console → Política → Contenido de la app → **ID de publicidad: Sí**; fines: Analítica,
  Publicidad o marketing.
- **Seguridad de los datos:** «Identificadores del dispositivo u otros» y «Actividad en la app →
  Interacciones con la app», **recopilados y compartidos** (Meta), fines Analítica + Publicidad o
  marketing; cifrados en tránsito. Hoy la ficha dice «No se comparten datos con terceros».
- **`/privacidad`** (`apps/web/src/app/privacidad/page.tsx`): Meta Platforms en §5, uso de
  identificadores publicitarios y eventos de app en §4/§9, cómo desactivarlo (Android: «Borrar ID
  de publicidad»; iOS: ATT), y la §9 deja de negar el rastreo de terceros. Alcance **D7**: además
  de Meta, Sentry (errores), Flow (pagos) y Google (inicio de sesión) en §5.

### 6.4 Binario B (P2)

- [ ] R8 activo (`enableMinifyInReleaseBuilds: true`), sin reducción de recursos.
- [ ] Antes del submit, el proxy de ofuscación del CI (clases renombradas en el mapping del AAB)
      da ≥ 30 %; si no, el job falla y nada sube.
- [ ] Explorador de app bundles de Play: ofuscación, optimización y reducción **≥ 35 %** cada una
      para el AAB de B (piso duro 25 %).
- [ ] El mapping viaja en el AAB (`BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map`)
      y se sube a Sentry `eva-mobile` (Sentry Android Gradle Plugin, solo mapping).
- [ ] Matriz de QA por librería nativa (TASKS W5.3) hecha tras la publicación; muy recomendado
      hacerla antes, con el APK universal firmado durante la revisión (D6).
- [ ] 48 h en producción con Sentry y Android vitals sin crashes nuevos atribuibles a R8.

## 7. Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Declaración de ID de publicidad o Seguridad de los datos desalineada con el manifest | Envío rechazado o violación de la política de Datos del usuario | W0: declarar antes del envío; guard de CI confirma `AD_ID` en el AAB |
| `/privacidad` no menciona a Meta | Incumplimiento de la política de Datos del usuario de Play; Ley 21.719 (vigente 01-12-2026) | W0.2: deploy web **antes** de enviar A |
| Ya existe un OTA **Android runtime 1.1.3** viejo (grupo `4fea95fe`, «gracia de dunning», `90d7907`) | expo-updates solo carga un OTA más nuevo que el lanzado, así que no debería pisar el bundle embebido; aun así es una bomba latente | W2.2: publicar OTA Android 1.1.3 desde el commit del binario ANTES de compilarlo y subirlo |
| R8 rompe una ruta (reflexión/JNI) y el binario va directo a producción al 100 % (D3, D6) | Crash nativo que ningún OTA arregla; rollback = binario nuevo + revisión | Keeps en toda la frontera JS↔nativo (PLAN §3.2); QA con el APK universal durante la revisión; si aparece un crash antes de la aprobación, subir un build corregido reemplaza al que está en revisión; Sentry con mapping. Palanca opcional del owner: «Publicación gestionada» encendida solo para B, para publicar a mano tras su QA |
| Sin pista de prueba (D6), el QA de A es posterior a la publicación | Un problema de A llega a todos antes de verse | A no cambia código ni JS (solo quita 2 servicios que nunca arrancan y 2 filtros de link); guard del AAB en CI; APK universal durante la revisión si el owner quiere |
| La cuenta de servicio de CI no tiene permiso para publicar en producción | El paso de submit falla | W0.5 lo verifica; si falla, el owner sube el AAB del artefacto de Actions a mano el mismo día (la retención efectiva es 1 día) |
| Crash conocido de SecureStore con R8 en SDK 54 («2nd argument cannot be cast to SecureStoreOptions») | Biometría (`lib/biometric.ts`) rota | Keep `expo.modules.securestore.**` + `com.facebook.jni.**` desde el primer build de B |
| Keeps demasiado amplios | Métrica bajo 25 % | Keeps solo de paquetes chicos de frontera; piso del proxy en CI antes del submit; lectura del explorador tras subir |
| Subir B mientras A está en revisión de producción | Reinicia la revisión de A | B sube a Play solo con A **publicada** |
| Pistas de prueba con builds ≤ 86 siguen activas | El aviso P1 puede seguir listado para «artefactos activos» | W3.3: dejar alpha (e interna) en ≥ 87 o pausadas |
| `facebook-android-sdk:18.+` es versión dinámica | A y B pueden resolver distinto minor del SDK | Registrar la versión resuelta en el log de cada build; B se valida con su propio QA |

## 8. Fuentes

- Play, requisitos de calidad técnica (umbral 25 %, feb 2027, apps > 10 MB DEX):
  https://support.google.com/googleplay/android-developer/answer/17492799
- Cómo mide Play (lee `r8.json` con AGP ≥ 8.10; RN 0.81 usa AGP 8.11.0): https://capgo.app/blog/google-play-obfuscation-capacitor-android/
- expo-audio y `BOOT_COMPLETED`: https://github.com/expo/expo/issues/41627
- SecureStore + R8 en SDK 54: https://github.com/expo/expo/discussions/43567
- R8 en una app Expo grande (Bluesky: minify sí, shrinkResources no, SAGP para Sentry): https://github.com/bluesky-social/social-app/pull/11647
- AD_ID en el SDK de Facebook ≥ 13 y Seguridad de los datos: https://developers.facebook.com/docs/android/getting-started ·
  https://support.google.com/googleplay/android-developer/answer/10787469
