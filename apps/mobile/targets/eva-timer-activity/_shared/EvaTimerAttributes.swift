//
//  EvaTimerAttributes.swift  (copia A — carpeta `_shared` del target)
//
//  ⚠️ COPIA SINCRONIZADA — EDITAR AMBAS ⚠️
//  Gemela byte-idéntica de:
//      apps/mobile/modules/eva-live-activity/ios/EvaTimerAttributes.swift
//  Cualquier cambio de campo, nombre o tipo debe aplicarse en LAS DOS o la Live Activity deja de
//  renderizar (ActivityKit machea la actividad con su UI por el NOMBRE del tipo de atributos).
//
//  ── POR QUÉ HAY DOS COPIAS Y NO UN SOLO ARCHIVO ───────────────────────────────
//  Son TRES módulos Swift distintos y ninguno puede importar a los otros dos:
//    1. El POD del módulo nativo (`EvaLiveActivity`, autolinkeado desde `modules/`) es quien crea la
//       actividad cuando el JS llama `start()`. Un pod se compila ANTES que el target de la app, así
//       que NO puede importar símbolos de la app.
//    2. El TARGET DE LA APP (`EVA`) es donde corren los App Intents de los botones (requisito de
//       `LiveActivityIntent`: el intent se ejecuta en el proceso de la app, sin abrirla).
//    3. El TARGET DE LA EXTENSIÓN (`EvaTimerActivity`) es quien dibuja el lockscreen y la isla; una
//       extensión NO linkea los pods de la app.
//  La carpeta `_shared` de `@bacons/apple-targets` resuelve 2 y 3 de un solo archivo (linkea cada
//  archivo al target principal Y al target de la extensión). Lo que NINGÚN mecanismo resuelve es 1:
//  por eso el pod lleva su propia copia. Duplicar el struct es la vía que Apple tolera —el matching
//  entre procesos es por nombre de tipo, no por identidad de módulo—, y es lo que hay que verificar
//  en dispositivo en el build EAS #3.
//
//  ── ESPEJO DEL CONTRATO ANDROID ──────────────────────────────────────────────
//  `kind` reemplaza al id/canal de notificación de Android ("rest"/"cardio"), y `endDate`/`startDate`
//  son el equivalente exacto de `timestamp` + `chronometerDirection`: instantes ABSOLUTOS que el
//  sistema cuenta solo, con el JS congelado. `pausedSecondsText` existe porque —igual que Android—
//  no hay forma de congelar un contador nativo: la pausa se representa con el texto ya formateado.
//

import ActivityKit
import Foundation

/// Identidad ESTÁTICA (no cambia en toda la vida de la actividad) + estado dinámico del cronómetro.
@available(iOS 16.2, *)
struct EvaTimerAttributes: ActivityAttributes {
  /// Lo que sí cambia en cada `update()`.
  struct ContentState: Codable, Hashable {
    /// Fin ABSOLUTO para cuenta REGRESIVA. `nil` = no hay regresiva viva.
    var endDate: Date?
    /// Inicio ABSOLUTO para cuenta ASCENDENTE (cardio por distancia). `nil` = no hay ascendente viva.
    var startDate: Date?
    /// En pausa: ni `endDate` ni `startDate` valen; manda `pausedSecondsText`.
    var paused: Bool
    /// Texto YA formateado ("01:23") con el que se dibuja la pausa. Congelarlo acá evita que la
    /// extensión tenga que saber de relojes: en pausa no hay nada que contar.
    var pausedSecondsText: String?
    /// Contexto de la fase/serie ("Serie 2 de 4", "Trote 3 de 6"). Opcional.
    var stageText: String?
  }

  /// `"rest"` | `"cardio"`. Permite que las dos actividades coexistan y que cada intent encuentre
  /// la suya (`Activity.activities.first { $0.attributes.kind == ... }`).
  var kind: String
  /// Título en negrita del lockscreen ("Descanso · sigue Press banca").
  var title: String
  /// Línea secundaria atenuada. Opcional.
  var subtitle: String?
  /// Acento de marca en hex `#RRGGBB`. Opcional (default: azul EVA).
  var accentHex: String?
  /// Nombre del imageset del target a usar como figura. Opcional (default: `evaMark`).
  /// DIFERIDO a propósito: el logo del COACH exigiría cachear la imagen dentro del App Group para
  /// que la extensión pueda leerla (no tiene red ni acceso al sandbox de la app). En iOS siempre va
  /// la figura EVA; el logo del coach sigue siendo exclusivo de Android.
  var logoAssetName: String?
}
