const { withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

/**
 * Manifiesto de privacidad de iOS (`PrivacyInfo.xcprivacy`).
 *
 * POR QUÉ `NSPrivacyTracking` pasó a `true` el 2026-09-15: entró el SDK de Meta
 * (`react-native-fbsdk-next`) y con él la hoja de ATT (`expo-tracking-transparency`). Cuando el
 * usuario ACEPTA el diálogo, el SDK usa el IDFA para atribuir la instalación y el registro a la
 * campaña que los trajo — eso es *tracking* según la definición de Apple, y declararlo `false`
 * con el SDK adentro es un rechazo seguro en review. Los dos tipos nuevos de
 * `NSPrivacyCollectedDataTypes` son exactamente lo que ese SDK manda: el identificador del device
 * (IDFA/IDFV) y la interacción con el producto (`fb_mobile_activate_app`,
 * `fb_mobile_complete_registration`). Van `Linked: false` — EVA no los cruza con la cuenta del
 * coach: el evento viaja sin correo, sin nombre y sin uid (ver `lib/meta-sdk.ts`).
 *
 * `NSPrivacyTrackingDomains` SÍ va acá (aprendido con el rechazo ITMS-91064 de la build 60, 15-09):
 * cuando `NSPrivacyTracking` es `true`, Apple exige que el manifiesto DE LA APP liste los dominios
 * de tracking; no alcanza con que el pod de FBSDKCoreKit los declare en el suyo. El dominio es el
 * mismo que declara ese SDK (`ep1.facebook.com`): si sube de versión y cambia, hay que actualizarlo
 * acá también (se comprueba abriendo el IPA: `Frameworks/FBSDKCoreKit.framework/PrivacyInfo.xcprivacy`).
 *
 * El resto de los tipos (nombre, correo, ejercicio, salud, fotos) queda igual: son de
 * FUNCIONALIDAD de la app, `Tracking: false`, y no los toca ningún SDK de publicidad.
 */
const PRIVACY_MANIFEST = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>CA92.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>C617.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategorySystemBootTime</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>35F9.1</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryDiskSpace</string>
      <key>NSPrivacyAccessedAPITypeReasons</key>
      <array>
        <string>E174.1</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyCollectedDataTypes</key>
  <array>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeName</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeEmailAddress</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeFitnessAndExercise</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeHealth</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypePhotosorVideos</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <true/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <false/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeAppFunctionality</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeDeviceID</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <true/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeDeveloperAdvertising</string>
        <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
      </array>
    </dict>
    <dict>
      <key>NSPrivacyCollectedDataType</key>
      <string>NSPrivacyCollectedDataTypeProductInteraction</string>
      <key>NSPrivacyCollectedDataTypeLinked</key>
      <false/>
      <key>NSPrivacyCollectedDataTypeTracking</key>
      <true/>
      <key>NSPrivacyCollectedDataTypePurposes</key>
      <array>
        <string>NSPrivacyCollectedDataTypePurposeDeveloperAdvertising</string>
        <string>NSPrivacyCollectedDataTypePurposeAnalytics</string>
      </array>
    </dict>
  </array>
  <key>NSPrivacyTracking</key>
  <true/>
  <key>NSPrivacyTrackingDomains</key>
  <array>
    <string>ep1.facebook.com</string>
  </array>
</dict>
</plist>`

module.exports = function withPrivacyManifest(config) {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const iosDir = path.join(config.modRequest.platformProjectRoot)
            const appDir = path.join(iosDir, config.modRequest.projectName ?? 'EVA')
            const manifestPath = path.join(appDir, 'PrivacyInfo.xcprivacy')
            if (!fs.existsSync(appDir)) fs.mkdirSync(appDir, { recursive: true })
            fs.writeFileSync(manifestPath, PRIVACY_MANIFEST, 'utf8')
            return config
        },
    ])
}
