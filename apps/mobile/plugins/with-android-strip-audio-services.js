const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins')

/**
 * Quita del manifest fusionado los dos servicios en primer plano que `expo-audio` 1.1.1 declara en
 * SU propio AndroidManifest (android/src/main/AndroidManifest.xml de la libreria; su config plugin
 * no los saca). Spec: docs/specs/android-113-play/SPEC.md §1.
 *
 * POR QUE: Play Console marca la version de produccion con «servicios en primer plano restringidos
 * que se inician desde BOOT_COMPLETED» (issue expo/expo#41627, SDK 54, sin fix oficial). Es analisis
 * estatico: cruza los tipos `mediaPlayback`/`microphone` de estos dos servicios con los receptores de
 * reinicio que la app SI necesita (notify-kit, WorkManager, expo-notifications).
 *
 * POR QUE ES SEGURO: EVA usa expo-audio solo para `createAudioPlayer` + `setAudioModeAsync` con
 * `shouldPlayInBackground: false` (components/alumno/workout/timers/sound.ts).
 *   · AudioControlsService solo arranca desde `AudioPlayer.setActiveForLockScreen` (AudioPlayer.kt).
 *   · AudioRecordingService solo arranca al grabar (AudioRecorder.kt).
 *   · Lo demas que los nombra (`AudioControlsService.clearSession()`) hace `getInstance()?.…` y no
 *     toca el manifest.
 * `tests/mobile/android-strip-audio-services.test.ts` falla si alguien empieza a usar controles de
 * pantalla bloqueada o grabacion: en ese caso hay que sacar ESTE plugin antes, o el servicio no
 * existiria en runtime.
 *
 * El permiso `FOREGROUND_SERVICE_MEDIA_PLAYBACK` que trae la misma libreria se bloquea aparte, con
 * `android.blockedPermissions` de app.json (la via nativa de Expo; agrega el mismo tools:node="remove").
 *
 * VERIFICACION: `expo config --type introspect` muestra los dos `<service tools:node="remove">`; el
 * manifest FUSIONADO (con las librerias) solo existe tras Gradle y lo revisa el guard del AAB en
 * `.github/workflows/mobile-build.yml` (scripts/mobile/verify-android-aab.mjs).
 */

const TOOLS_NS = 'http://schemas.android.com/tools'

const STRIPPED_SERVICES = [
  'expo.modules.audio.service.AudioControlsService',
  'expo.modules.audio.service.AudioRecordingService',
]

function stripAudioServices(manifest) {
  manifest.manifest.$ = manifest.manifest.$ || {}
  manifest.manifest.$['xmlns:tools'] = TOOLS_NS

  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest)
  app.service = app.service || []
  for (const name of STRIPPED_SERVICES) {
    const existing = app.service.find((service) => service?.$?.['android:name'] === name)
    if (existing) {
      existing.$['tools:node'] = 'remove' // idempotente
    } else {
      app.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } })
    }
  }
  return manifest
}

function withAndroidStripAudioServices(config) {
  return withAndroidManifest(config, (cfg) => {
    cfg.modResults = stripAudioServices(cfg.modResults)
    return cfg
  })
}

module.exports = withAndroidStripAudioServices
module.exports.stripAudioServices = stripAudioServices
module.exports.STRIPPED_SERVICES = STRIPPED_SERVICES
