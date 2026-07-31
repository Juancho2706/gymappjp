/**
 * WIDGET EXTENSION de las LIVE ACTIVITIES de EVA (Ola 7A) — el equivalente iOS del cronómetro vivo
 * que en Android resuelve `components/alumno/workout/timers/live-timer-notification.ts` con el
 * `chronometer` de notify-kit.
 *
 * ── POR QUÉ UN TARGET Y NO UNA LIBRERÍA ────────────────────────────────────────
 * ActivityKit EXIGE una Widget Extension propia: el lockscreen y la Dynamic Island los dibuja otro
 * proceso (el de la extensión), no la app. No hay librería de RN que lo evite —`expo-live-activity`
 * fue deprecada en jun-2026—, así que el target se genera con `@bacons/apple-targets`, que linkea
 * esta carpeta al proyecto Xcode en cada `expo prebuild` (Continuous Native Generation intacta: el
 * directorio `ios/` sigue siendo desechable).
 *
 * ── QUÉ APORTA CADA CAMPO ──────────────────────────────────────────────────────
 * · `type: 'widget'` → el plugin ya inyecta por defecto los frameworks WidgetKit + SwiftUI +
 *   ActivityKit + AppIntents y el `NSExtensionPointIdentifier` correcto (verificado en
 *   `@bacons/apple-targets@5.0.0`, `build/target.js` → `TARGET_REGISTRY.widget`), así que acá NO se
 *   repiten: duplicarlos sólo agrega superficie para equivocarse.
 * · `deploymentTarget: '16.2'` → piso REAL de las Live Activities con `ActivityContent` moderno. La
 *   app principal sigue en su piso (15.1); esta extensión es la única que sube. Los BOTONES exigen
 *   iOS 17 y por eso van tras `#available(iOS 17.0, *)` en Swift, no acá.
 * · `entitlements` → App Group compartido con la app. Es el ÚNICO canal por el que los App Intents
 *   (que corren en el proceso de la app, no acá) le dejan comandos al JS: `UserDefaults(suiteName:)`.
 *   Se espeja el valor de `app.json` en vez de escribirlo a mano para que no puedan divergir.
 * · `images.evaMark` → genera el imageset de la figura EVA dentro del `Assets.xcassets` del target.
 *   La extensión NO puede leer los assets de la app, así que la marca tiene que vivir acá; se pinta
 *   como plantilla blanca (`.renderingMode(.template)`) en el Swift.
 *
 * ⚠️ Swift NO se compila en Windows: la validación real de este target es el build EAS #3.
 */

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  // Nombre del producto/target en Xcode. Se fija explícito porque el default es el nombre del
  // directorio (`eva-timer-activity`), y un product name con guiones complica el `PRODUCT_MODULE_NAME`.
  name: 'EvaTimerActivity',
  displayName: 'EVA Timer',
  // Prefijo con punto → se cuelga del bundle id de la app: `cl.evaapp.eva.timeractivity`.
  bundleIdentifier: '.timeractivity',
  deploymentTarget: '16.2',
  colors: {
    // sport-500 de EVA DS (mismo acento que usa el cronómetro de Android).
    $accent: '#2680FF',
    $widgetBackground: '#0B0E13',
  },
  images: {
    evaMark: '../../assets/eva-mark-filled.png',
  },
  entitlements: {
    'com.apple.security.application-groups':
      config.ios?.entitlements?.['com.apple.security.application-groups'] ?? [],
  },
})
