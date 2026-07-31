# Pod del MÓDULO NATIVO LOCAL de las Live Activities (Ola 7A).
#
# Es un módulo local (`apps/mobile/modules/`), no un paquete de npm: `expo-modules-autolinking`
# escanea ese directorio por defecto (`nativeModulesDir = ./modules`, verificado en
# expo-modules-autolinking@3.0.26) y linkea cualquier carpeta con `expo-module.config.json`, sin
# necesidad de `package.json`. Por eso la versión va escrita a mano acá.
#
# `:ios => '15.1'` es el piso del POD (el de la app), NO el de las Live Activities: todo el código de
# ActivityKit está detrás de `#available(iOS 16.2, *)` y en dispositivos anteriores el módulo responde
# `isSupported() == false` y no hace nada. La extensión que dibuja la actividad sí sube a 16.2, pero
# eso se configura en `targets/eva-timer-activity/expo-target.config.js`.

Pod::Spec.new do |s|
  s.name           = 'EvaLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Live Activities (lockscreen + Dynamic Island) para los cronometros de EVA.'
  s.description    = 'Modulo nativo local que expone ActivityKit al JS de EVA: start/update/end de la Live Activity del descanso y de cardio, y drenaje de los comandos que dejan los App Intents en el App Group.'
  s.license        = 'MIT'
  s.author         = 'EVA Technology SpA'
  s.homepage       = 'https://eva-app.cl'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
