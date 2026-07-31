const { AndroidConfig, withAndroidManifest, withMainActivity } = require('expo/config-plugins')

/**
 * Health Connect (QA-4 / H19) — lo que el config plugin de `react-native-health-connect` NO hace.
 *
 * 1) DELEGATE DE PERMISOS (bloqueante, es la causa del "Conectar salud te saca de la app").
 *    La libreria exige que MainActivity registre el ActivityResultLauncher en `onCreate`:
 *      HealthConnectPermissionDelegate.setPermissionDelegate(this)
 *    Su plugin solo agrega el intent-filter de rationale; el paso de MainActivity queda a mano y en
 *    un proyecto CNG (android/ gitignored) se pierde en CADA prebuild. Sin el, `requestPermission()`
 *    lanza `UninitializedPropertyAccessException` DENTRO de una corrutina sin handler => crash nativo
 *    no atrapable desde JS (o promesa colgada para siempre y boton en "Conectando…").
 *    Tiene que ser en `onCreate`: `registerForActivityResult` lanza IllegalStateException si se
 *    llama con la Activity ya STARTED — por eso no hay atajo "lazy desde JS".
 *
 * 2) ACTIVITY-ALIAS Android 14+ (API 34+). Desde Android 14 Health Connect es parte del sistema y el
 *    link "Politica de privacidad" de su pantalla de permisos se resuelve por
 *    VIEW_PERMISSION_USAGE + categoria HEALTH_PERMISSIONS. Sin el alias ese link no lleva a ningun
 *    lado y la revision de Play para apps con `android.permission.health.*` lo valida.
 *
 * FAIL-FAST: si el ancla de MainActivity no matchea (cambio de template de Expo) el plugin LANZA.
 * Preferimos un prebuild rojo y ruidoso antes que un APK verde con "Conectar salud" roto.
 *
 * VERIFICACION tras `npx expo prebuild -p android --clean` (NO se corre desde este worktree):
 *   grep -n 'setPermissionDelegate'       android/app/src/main/java/cl/evaapp/eva/MainActivity.kt
 *   grep -n 'ViewPermissionUsageActivity' android/app/src/main/AndroidManifest.xml
 * Los dos tienen que dar match; si no, el build no sirve.
 */

const IMPORT_LINE = 'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate'
const CALL = 'HealthConnectPermissionDelegate.setPermissionDelegate(this)'
const ALIAS_NAME = 'ViewPermissionUsageActivity'

function withHealthConnectDelegate(config) {
  return withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== 'kt') {
      throw new Error('[with-health-connect] MainActivity debe ser Kotlin (Expo SDK 54 genera .kt).')
    }
    let src = cfg.modResults.contents
    if (src.includes(CALL)) return cfg // idempotente

    if (!src.includes(IMPORT_LINE)) {
      if (!/^package .+$/m.test(src)) {
        throw new Error('[with-health-connect] no se encontro la linea `package` en MainActivity.kt')
      }
      src = src.replace(/^(package .+\r?\n)/m, `$1\n${IMPORT_LINE}\n`)
    }

    // SIEMPRE despues de `super.onCreate(...)` (expo-splash-screen inyecta setTheme ANTES de esa
    // linea; meterse en el medio rompe el splash).
    const anchor = /(super\.onCreate\([^)]*\)[^\n]*\r?\n)/
    if (!anchor.test(src)) {
      throw new Error('[with-health-connect] no se encontro `super.onCreate(...)` en MainActivity.kt')
    }
    src = src.replace(anchor, `$1    ${CALL}\n`)

    if (!src.includes(CALL)) {
      throw new Error('[with-health-connect] no se pudo inyectar setPermissionDelegate en onCreate')
    }
    cfg.modResults.contents = src
    return cfg
  })
}

function withHealthConnectPermissionUsage(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults)
    app['activity-alias'] = app['activity-alias'] || []
    const exists = app['activity-alias'].some((a) => a?.$?.['android:name'] === ALIAS_NAME)
    if (!exists) {
      app['activity-alias'].push({
        $: {
          'android:name': ALIAS_NAME,
          'android:exported': 'true',
          'android:targetActivity': '.MainActivity',
          'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW_PERMISSION_USAGE' } }],
            category: [{ $: { 'android:name': 'android.intent.category.HEALTH_PERMISSIONS' } }],
          },
        ],
      })
    }
    return cfg
  })
}

module.exports = function withHealthConnect(config) {
  return withHealthConnectPermissionUsage(withHealthConnectDelegate(config))
}
