const { withDangerousMod } = require('expo/config-plugins')
const fs = require('fs')
const path = require('path')

/**
 * with-ios-modular-headers
 *
 * Arregla el error de `pod install` clasico de @react-native-google-signin en
 * un prebuild de Expo con New Architecture (static libraries por defecto):
 *
 *   [!] The Swift pod `AppCheckCore` depends upon `GoogleUtilities` and
 *       `RecaptchaInterop`, which do not define modules. To opt into those
 *       targets generating module maps [...] you may set `use_modular_headers!`
 *       globally in your Podfile, or specify `:modular_headers => true` for
 *       particular dependencies.
 *
 * GoogleSignIn (dep transitiva de google-signin) arrastra a AppCheckCore, un
 * pod Swift que necesita importar GoogleUtilities y RecaptchaInterop. Esos dos
 * son ObjC y no emiten module map cuando se linkea estatico, asi que Swift no
 * los puede `import`. CocoaPods aborta el install.
 *
 * Seguimos la recomendacion PUNTUAL de CocoaPods (NO `use_modular_headers!`
 * global, que fuerza module maps para TODO el grafo y suele romper otros pods
 * ObjC): declaramos `:modular_headers => true` solo para los dos pods que el
 * error nombra. Declararlos explicitamente para una dep transitiva es valido en
 * CocoaPods y activa la generacion de module map sin tocar el resto.
 */

const MARKER = '# >>> EVA modular headers (google-signin / AppCheckCore fix)'
const POD_LINES = [
    MARKER,
    "  pod 'GoogleUtilities', :modular_headers => true",
    "  pod 'RecaptchaInterop', :modular_headers => true",
    '  # <<< EVA modular headers',
]

module.exports = function withIosModularHeaders(config) {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const podfilePath = path.join(
                config.modRequest.platformProjectRoot,
                'Podfile',
            )
            if (!fs.existsSync(podfilePath)) return config

            let contents = fs.readFileSync(podfilePath, 'utf8')

            // Idempotente: si ya inyectamos, no dupliques.
            if (contents.includes(MARKER)) return config

            const block = '\n' + POD_LINES.join('\n') + '\n'

            // Inserta las lineas dentro del target principal, justo despues de
            // `use_expo_modules!` (siempre presente en el Podfile de Expo).
            if (contents.includes('use_expo_modules!')) {
                contents = contents.replace(
                    'use_expo_modules!',
                    'use_expo_modules!' + block,
                )
            } else {
                // Fallback: primera declaracion de target.
                const targetRe = /(target\s+['"][^'"]+['"]\s+do[^\n]*\n)/
                if (targetRe.test(contents)) {
                    contents = contents.replace(targetRe, '$1' + block)
                } else {
                    // Ultimo recurso: no encontramos donde; no rompas el build.
                    return config
                }
            }

            fs.writeFileSync(podfilePath, contents, 'utf8')
            return config
        },
    ])
}
