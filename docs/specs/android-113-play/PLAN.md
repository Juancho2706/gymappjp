---
status: active
owner: mobile-release
last_verified: "2026-09-25 @ a2a5e7b3"
canonical: false
---

# PLAN — Android 1.1.3: limpiar los dos avisos de Play sin romper nada

Ver [SPEC](SPEC.md). Tareas en [TASKS](TASKS.md).

---

## 1. Forma del tren

```text
W0 prerrequisitos (owner + web)  ─┐
W1 código A (config + guardas)   ─┴─► W2 OTA de alineación → build A → guard → PRODUCCIÓN
                                        (QA opcional con APK universal mientras Google revisa)
                                        └─► W3 post-A (smoke, 48 h, pistas, OTA de transición)
W4 código B (R8 + Sentry)  ─────────────► W5 build B → guard + piso de ofuscación → PRODUCCIÓN
                                        (matriz de QA con APK universal mientras Google revisa)
                                        └─► W6 cierre (docs, memoria, SDD done)
```

- W1 y W4 son código; el resto es operación. W4 puede escribirse mientras A está en revisión, pero
  **B no sube a Play hasta que A esté publicada** (SPEC §7).
- Ningún paso cambia JS de la app ⇒ ningún OTA nuevo por este tren salvo el de TASKS W2.2, que
  publica el mismo commit del binario.

## 2. Binario A — quitar los servicios de expo-audio

### 2.1 Enfoque elegido y descartes

| Opción | Veredicto |
|---|---|
| **Config plugin propio con `tools:node="remove"` sobre los 2 `<service>`** + `android.blockedPermissions` para `FOREGROUND_SERVICE_MEDIA_PLAYBACK` | ✔ Elegido. Mismo patrón que `plugins/with-android-cleartext.js`; el merger de manifest de Android borra las entradas de la librería; cero código nativo; reversible borrando una línea de `app.json`. `blockedPermissions` es la vía nativa de Expo para quitar permisos (agrega el mismo `tools:node="remove"`). |
| Subir expo-audio | ✘ No hay fix oficial (issue #41627 abierto) y `AGENTS.md` prohíbe subir dependencias nativas como efecto colateral. |
| `pnpm patch` del manifest de expo-audio | ✘ Frágil ante reinstalaciones y difícil de ver en review; el plugin deja la intención en `app.json`. |
| Reemplazar expo-audio por otra librería | ✘ Riesgo alto para cero beneficio: el reproductor de hoy funciona. |

### 2.2 Plugin `apps/mobile/plugins/with-android-strip-audio-services.js`

Contrato (el worker lo implementa con el estilo de `with-health-connect.js`: cabecera que explica
el porqué, idempotente, sin dependencias fuera de `expo/config-plugins`):

```js
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins')

// Servicios que expo-audio 1.1.1 declara en SU manifest (android/src/main/AndroidManifest.xml).
// EVA nunca los arranca: ver SPEC §1. Si algún día se usa setActiveForLockScreen o grabación,
// hay que sacar este plugin (lo exige tests/mobile/android-strip-audio-services.test.ts).
const STRIPPED_SERVICES = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
]

function stripAudioServices(manifest) {
  manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools'
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
  app.service = app.service ?? []
  for (const name of STRIPPED_SERVICES) {
    if (!app.service.some((s) => s?.$?.['android:name'] === name)) {
      app.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } })
    }
  }
  return manifest
}

module.exports = function withAndroidStripAudioServices(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = stripAudioServices(cfg.modResults)
    return cfg
  })
}
module.exports.stripAudioServices = stripAudioServices
module.exports.STRIPPED_SERVICES = STRIPPED_SERVICES
```

`app.json`:

- `plugins`: agregar `"./plugins/with-android-strip-audio-services"` junto a los otros plugins
  locales.
- `android.blockedPermissions`: `["android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"]`.
- `android.permissions` **no se toca** (`RECORD_AUDIO` y `RECEIVE_BOOT_COMPLETED` se quedan).

### 2.3 Guardas

1. **`tests/mobile/android-strip-audio-services.test.ts`** (vitest, proyecto `mobile-node`):
   - `stripAudioServices` sobre un manifest mínimo agrega los 2 `remove` y `xmlns:tools`; aplicado
     dos veces no duplica.
   - `app.json` registra el plugin, bloquea `FOREGROUND_SERVICE_MEDIA_PLAYBACK` y **conserva**
     `RECEIVE_BOOT_COMPLETED` y `RECORD_AUDIO` en `android.permissions`.
   - Barrido de `apps/mobile` (sin `node_modules`, `android/`, `ios/`) y `packages/`: cero usos de
     `setActiveForLockScreen`, `updateLockScreenMetadata`, `clearLockScreenControls`,
     `useAudioRecorder`, `useAudioRecorderState`, `AudioRecorder`, `RecordingPresets`,
     `requestRecordingPermissionsAsync`. El mensaje de fallo dice «sacar el plugin
     with-android-strip-audio-services antes de usar esto».
2. **Guard del AAB en CI** (`.github/workflows/mobile-build.yml`, solo `profile == production`,
   después del build y **antes** del submit) + script `scripts/mobile/verify-android-aab.mjs`:
   - bundletool fijado por versión y SHA-256 (descarga de GitHub Releases; nunca `latest`);
     `dump manifest --bundle build.aab`.
   - **Falla** si aparece `expo.modules.audio.service.`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, o algún
     `<service>` con `foregroundServiceType` en {mediaPlayback, microphone, camera, dataSync,
     phoneCall, mediaProjection}; o si falta alguno de los 3 receptores de `BOOT_COMPLETED`
     (`app.notifee.core.RebootBroadcastReceiver`,
     `androidx.work.impl.background.systemalarm.RescheduleReceiver`,
     `expo.modules.notifications.service.NotificationsService`).
   - **Avisa** (no falla) si falta `com.google.android.gms.permission.AD_ID` (D1).
   - Imprime versionName/versionCode en el resumen del job. En B, además, el proxy de ofuscación
     (§3.4).
   - Las listas viven en el script, no en YAML, para poder testearlas.
3. **Destino del submit** (D6, directo a producción): input nuevo `android_track` en
   `mobile-build.yml` con opciones `alpha` (default, comportamiento actual) y `production`; perfil
   de submit nuevo `production-store` en `eas.json` que extiende `production` con
   `track: production` (y `releaseStatus: completed`, 100 % directo por D3). El default no cambia
   ⇒ ninguna corrida existente cambia de destino. La cuenta de servicio necesita permiso de
   publicar en producción (TASKS W0.5).
4. **QA durante la revisión (opcional en A, muy recomendado en B):** Play Console → Explorador de
   app bundles → versión → «Descargar APK universal firmado». Se instala encima de la versión
   pública (misma firma de Play) mientras Google revisa. Si aparece un problema antes de la
   aprobación, un build corregido subido a producción reemplaza al que está en revisión.

### 2.4 App Link `/coach/subscription` fuera de ambas plataformas (D5)

- `app.json`: borrar los 2 `intentFilters` de `/coach/subscription` (ambos hosts).
- `tests/mobile/applinks-claims.test.ts:104`: `/coach/subscription` pasa a «no reclamado» en
  Android (se conserva la aserción de `/reset-password`).
- iOS: quitar `"/coach/subscription"` de `apps/web/public/.well-known/apple-app-site-association` y
  pasar `applinks-claims.test.ts:138` a `toBe(false)`. Es deploy web (sin binario); el CDN de Apple
  tarda en propagar.
- `OpenInAppCard.tsx` ya es solo texto: no cambia. Su comentario (líneas 11-18) promete volver a
  un botón «cuando el binario con el filtro esté en las tiendas»: se reescribe para decir que el
  filtro se retiró a propósito (D5) y que el puente web→app, si vuelve, usa `intent://` en Android
  como `/auth/confirm`.

### 2.5 Verificación local sin tocar el disco

`pnpm --filter @eva/mobile exec expo config --type introspect --json` evalúa los mods sin generar
`android/`: el manifest resultante (`_internal.modResults.android.manifest`) tiene que mostrar los
2 `<service tools:node="remove">` y el `uses-permission` bloqueado. El manifest **fusionado** (con
las librerías) solo existe tras Gradle: lo cubre el guard del AAB.

## 3. Binario B — R8

### 3.1 Configuración

`app.json` → `expo-build-properties.android`:

```json
{
  "minSdkVersion": 26,
  "enableMinifyInReleaseBuilds": true,
  "enableShrinkResourcesInReleaseBuilds": false,
  "extraProguardRules": "<ver §3.2>"
}
```

`@sentry/react-native/expo` → `experimental_android`:

```json
{
  "enableAndroidGradlePlugin": true,
  "autoUploadProguardMapping": true,
  "includeProguardMapping": true,
  "uploadNativeSymbols": false,
  "autoUploadNativeSymbols": false,
  "includeNativeSources": false
}
```

Solo el mapping: hoy no se suben símbolos NDK y este tren no suma cambios que no pide. El plugin
(SAGP 5.11.0, `withSentryAndroidGradlePlugin.js`) apaga `autoInstallation` y `tracingInstrumentation`
⇒ no inyecta SDK ni instrumentación nuevos. Si SAGP rompe el build, se retira y el mapping sigue
llegando a Play dentro del AAB (Android vitals desofusca solo).

### 3.2 Reglas keep: la frontera JS↔nativo no se ofusca

Principio: R8 rompe lo que se alcanza por reflexión/JNI sin regla. En RN eso vive en la **frontera
JS↔nativo** (módulos y view managers), que es código chico. Lo pesado del DEX (androidx, Kotlin,
OkHttp, media3, SDK de Facebook, Play services, Sentry, `react-android`) trae sus propias reglas y
es lo que mueve la métrica. Entonces:

```proguard
# expo-secure-store + R8 en SDK 54: "2nd argument cannot be cast to SecureStoreOptions"
# (expo/expo discussions/43567). lib/biometric.ts depende de esto.
-keep class expo.modules.securestore.** { *; }
-keep class com.facebook.jni.** { *; }

# Frontera JS↔nativo de librerías SIN reglas consumer propias (inventario 2026-09-25):
-keep class org.asyncstorage.** { *; }
-keep class com.reactnativecommunity.netinfo.** { *; }
-keep class com.reactnativegooglesignin.** { *; }
-keep class io.sentry.react.** { *; }
-keep class com.shopify.reactnative.skia.** { *; }
-keep class com.bleplx.** { *; }
-keep class com.facebook.reactnative.androidsdk.** { *; }
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.common.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class cl.json.** { *; }
-keep class fr.greweb.reactnativeviewshot.** { *; }
-keep class com.reactnativecommunity.webview.** { *; }
```

Ya traen reglas consumer (no se tocan): `expo` / `expo-modules-core`, `expo-image`, `expo-updates`,
`react-native-health-connect`, `react-native-notify-kit`, `react-native-reanimated`,
`react-native-svg`, `react-native-worklets`. `expo-notifications` tiene
`-keep class expo.modules.notifications.** {*;}` en su `proguard-rules.pro`: el worker confirma si
el `expo-module-gradle-plugin` lo aplica como consumer; si no, se agrega a `extraProguardRules`.

**Escalada si la matriz de QA encuentra otro módulo Expo roto:** `-keep class expo.modules.** { *; }`
completo, y se vuelve a medir. Nunca `-dontobfuscate`, `-dontoptimize`, `-dontshrink` ni
`-keep class ** { *; }`.

### 3.3 Qué NO se hace en B

- `enableShrinkResourcesInReleaseBuilds` queda en `false` (SPEC §5).
- Ningún cambio de JS: B es el mismo bundle que A más R8.

### 3.4 Medición antes de producción

Sin pista de prueba (D6), la medición que frena tiene que ocurrir **en CI, antes del submit**:

1. **Piso en CI** (`verify-android-aab.mjs`, flag `--min-obfuscation 30`): lee
   `BUNDLE-METADATA/com.android.tools.build.obfuscation/proguard.map` del AAB y calcula clases
   renombradas / total. Si el mapping no existe (R8 no corrió) o el proxy da < 30 %, el job falla y
   nada sube a Play. Solo se pasa el flag en los builds con R8.
2. **Número real, después de subir:** Play Console → Explorador de app bundles → versión de B. Con
   AGP 8.11 Play lee `r8.json`. Meta ≥ 35 % en las tres métricas. Si el proxy de CI y el número de
   Play difieren mucho, se recalibra el piso del paso 1 y se anota en `MOBILE_RELEASES_OTA.md`.

## 4. Archivos

| Acción | Ruta | Binario |
|---|---|---|
| CREATE | `apps/mobile/plugins/with-android-strip-audio-services.js` | A |
| UPDATE | `apps/mobile/app.json` (plugin, `blockedPermissions`, sin filtros `/coach/subscription`) | A |
| CREATE | `tests/mobile/android-strip-audio-services.test.ts` | A |
| CREATE | `scripts/mobile/verify-android-aab.mjs` (+ test de sus listas en `tests/mobile/verify-android-aab.test.ts`) | A |
| UPDATE | `.github/workflows/mobile-build.yml` (guard del AAB, input `android_track`) | A |
| UPDATE | `apps/mobile/eas.json` (submit `production-store`) | A |
| UPDATE | `tests/mobile/applinks-claims.test.ts` (`/coach/subscription` fuera en ambas) | A |
| UPDATE | `apps/web/src/app/coach/subscription/_components/OpenInAppCard.tsx` (solo el comentario) | A |
| UPDATE | `apps/web/src/app/privacidad/page.tsx` (+ `LAST_UPDATED`) | W0 web |
| UPDATE | `apps/web/public/.well-known/apple-app-site-association` | W0 web |
| UPDATE | `apps/mobile/app.json` (`expo-build-properties`, `experimental_android` de Sentry) | B |
| UPDATE | `docs/operations/MOBILE_RELEASES_OTA.md` (tabla de runtimes, guard AAB, R8) | W3 / W6 |
| UPDATE | `docs/status/CURRENT.md`, `docs/README.md` (índice de specs) | W6 |

## 5. Datos

Sin cambios de DB, RLS ni tipos generados.

## 6. Plan de pruebas

- **Unit (vitest, por archivo):** `android-strip-audio-services.test.ts`,
  `verify-android-aab.test.ts`, `applinks-claims.test.ts`, `native-intent.test.ts`,
  `store-compliance.test.ts`.
- **Config:** `expo config --type introspect` (§2.5) y `expo install --check` (el mismo guard del CI).
- **Build:** CI `mobile-build.yml` production android; guard del AAB verde.
- **Manual (owner, dispositivo real):** lista de TASKS W2.6 (A) y matriz W5.3 (B), en al menos un
  Android 14+ y, si hay, uno Android 12–13. Durante la revisión con el APK universal firmado
  (opcional en A, muy recomendado en B) o tras la publicación, actualizando desde Play.
- **Web:** `pnpm typecheck` + `pnpm build` solo si W0 toca la web (privacidad/AASA); preview de
  Vercel para leer la página.
- **Sin E2E:** no hay flujo de UI nuevo.

## 7. Rollback

| Qué falla | Dónde se detecta | Salida |
|---|---|---|
| Guard del AAB | CI, antes del submit | No se sube nada; corregir y relanzar |
| Guard o piso de ofuscación en CI | CI, antes del submit | No se sube nada; ajustar keeps y relanzar |
| Crash en el QA con APK universal, antes de la aprobación | Owner, durante la revisión | Nadie afectado; fix + build nuevo (versionCode +1) a producción, que reemplaza al que está en revisión |
| Problema de JS en producción | Sentry | OTA a runtime 1.1.3 (llega a A y B) |
| Problema nativo de A en producción | Sentry / vitals | Revertir el plugin en `app.json` ⇒ binario 1.1.3 nuevo ⇒ revisión (≤ 7 días). No hay «detener lanzamiento» con 100 % directo (D3) |
| Crash por R8 en producción | Sentry (con mapping) / vitals | Keep rule o `enableMinifyInReleaseBuilds: false` ⇒ binario nuevo ⇒ revisión |
| Declaración de Play rechazada | Correo de Play | Corregir la declaración y reenviar el mismo AAB |
