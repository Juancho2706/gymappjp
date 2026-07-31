//
//  EvaTimerIntents.swift  (carpeta `_shared` → se linkea al target de la APP y al de la EXTENSIÓN)
//
//  Los BOTONES de la Live Activity. Equivalente iOS de las `actions` de notify-kit en Android
//  (`REST_RUNNING_ACTIONS`, `CARDIO_PAUSED_ACTIONS`, …) y de su handler headless.
//
//  ── POR QUÉ ESTE ARCHIVO VIVE EN `_shared` (y no en el módulo nativo) ─────────
//  `LiveActivityIntent` es un contrato de DOS procesos y Apple exige que el tipo exista en ambos:
//    · la EXTENSIÓN lo necesita para poder escribirlo en `Button(intent:)`;
//    · la APP lo necesita porque el sistema ejecuta `perform()` en el proceso de la app —sin
//      abrirla— y lo resuelve por el identificador del intent.
//  `@bacons/apple-targets` linkea todo lo que esté en `_shared` a los DOS targets, que es
//  exactamente el patrón que la propia documentación del plugin recomienda para los intents. Meterlos
//  en el pod del módulo nativo NO funcionaría: la extensión no linkea los pods de la app.
//
//  ── iOS 16 vs iOS 17 ─────────────────────────────────────────────────────────
//  Los botones interactivos existen desde iOS 17. Todo este archivo está tras `@available(iOS 17.0, *)`
//  y la vista los envuelve en `#available`: en iOS 16.2–16.x la Live Activity se muestra COMPLETA pero
//  sin botones (degradación limpia), y el alumno controla el timer abriendo EVA como siempre.
//
//  ── DOBLE EFECTO DE CADA `perform()` ─────────────────────────────────────────
//  (a) mueve la actividad AL INSTANTE (`EvaTimerActivityOps`) para que el lockscreen responda aunque
//      el JS esté muerto, y (b) deja el comando en el App Group (`EvaTimerBus.appendCommand`) para que
//      el motor React adopte el mismo estado cuando la app vuelva al frente. Es la misma división de
//      trabajo que en Android: el handler ACTÚA y la cola AVISA; nadie aplica el delta dos veces.
//

import AppIntents
import Foundation

// MARK: - Descanso

@available(iOS 17.0, *)
struct EvaRestPauseIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Pausar descanso"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    let now = Date()
    await EvaTimerActivityOps.pause(kind: EvaTimerBus.kindRest, at: now)
    EvaTimerBus.appendCommand(id: EvaTimerBus.actionRestPause, at: now)
    return .result()
  }
}

@available(iOS 17.0, *)
struct EvaRestResumeIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Reanudar descanso"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    let now = Date()
    await EvaTimerActivityOps.resume(kind: EvaTimerBus.kindRest, at: now, countsUp: false)
    EvaTimerBus.appendCommand(id: EvaTimerBus.actionRestResume, at: now)
    return .result()
  }
}

@available(iOS 17.0, *)
struct EvaRestPlus15Intent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Sumar 15 segundos"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    let now = Date()
    await EvaTimerActivityOps.extend(kind: EvaTimerBus.kindRest, at: now, by: EvaTimerBus.plusSeconds)
    EvaTimerBus.appendCommand(id: EvaTimerBus.actionRestPlus15, at: now)
    return .result()
  }
}

@available(iOS 17.0, *)
struct EvaRestSkipIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Saltar descanso"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    let now = Date()
    // Saltar CIERRA la actividad: no queda nada que mostrar y la sesión sigue en la app.
    await EvaTimerActivityOps.end(kind: EvaTimerBus.kindRest)
    EvaTimerBus.appendCommand(id: EvaTimerBus.actionRestSkip, at: now)
    return .result()
  }
}

// MARK: - Cardio

@available(iOS 17.0, *)
struct EvaCardioPauseIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Pausar cardio"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    let now = Date()
    await EvaTimerActivityOps.pause(kind: EvaTimerBus.kindCardio, at: now)
    EvaTimerBus.appendCommand(id: EvaTimerBus.actionCardioPause, at: now)
    return .result()
  }
}

@available(iOS 17.0, *)
struct EvaCardioResumeIntent: LiveActivityIntent {
  static var title: LocalizedStringResource = "Reanudar cardio"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    let now = Date()
    // El cronómetro por distancia cuenta HACIA ARRIBA; el countdown y los intervalos, hacia abajo.
    // Al pausar se pierden ambos instantes, así que el sentido se lee del flag que el módulo nativo
    // dejó en el App Group al publicar la actividad (ver `EvaTimerCardioMode`).
    let countsUp = EvaTimerCardioMode.countsUp(for: EvaTimerBus.kindCardio)
    await EvaTimerActivityOps.resume(kind: EvaTimerBus.kindCardio, at: now, countsUp: countsUp)
    EvaTimerBus.appendCommand(id: EvaTimerBus.actionCardioResume, at: now)
    return .result()
  }
}

/// Cómo sabe el intent si debe reanudar hacia ARRIBA o hacia ABAJO.
///
/// El modo NO viaja en los atributos (son inmutables y el hero de cardio cambia de forma entre
/// bloques) y al pausar se pierden los dos instantes, así que no se puede deducir del estado. Se
/// persiste en el App Group cada vez que el módulo nativo publica la actividad —el único punto donde
/// el dato existe con certeza— bajo la clave `eva.liveactivity.countsUp.<kind>`.
///
/// ⚠️ La MISMA clave se escribe desde `modules/eva-live-activity/ios/EvaLiveActivityModule.swift`
/// (otro módulo Swift, no puede ver este tipo). Si cambia acá, cambiar allá.
///
/// Sin flag → cuenta REGRESIVA, que es el caso mayoritario (countdown por duración e intervalos).
@available(iOS 16.2, *)
enum EvaTimerCardioMode {
  static func key(for kind: String) -> String { "eva.liveactivity.countsUp.\(kind)" }

  static func countsUp(for kind: String) -> Bool {
    UserDefaults(suiteName: EvaTimerBus.appGroup)?.bool(forKey: key(for: kind)) ?? false
  }
}
