//
//  EvaLiveActivityModule.swift — puente ActivityKit ⇄ JS (Ola 7A).
//
//  Es el equivalente iOS de lo que en Android hace `live-timer-notification.ts` a través de
//  notify-kit: publicar/actualizar/retirar el cronómetro VIVO del sistema. Lo consume
//  `components/alumno/workout/timers/live-activity.ts` con un `requireOptionalNativeModule` guardado,
//  así que mientras no exista un binario con este módulo enlazado TODO el camino iOS es NO-OP seguro
//  (exactamente el mismo patrón con el que convivió notify-kit antes del build EAS #2).
//
//  ── QUÉ EXPONE Y POR QUÉ ─────────────────────────────────────────────────────
//  · `isSupported()`   → `false` en iOS < 16.2 o si el usuario apagó las Live Activities en Ajustes.
//                        El JS lo consulta UNA vez y se apaga solo; nada de intentar y fallar.
//  · `start(kind, …)`  → devuelve el id de la actividad, o `nil` si no se pudo. `kind` es "rest" o
//                        "cardio": se mantiene UNA actividad viva POR KIND (pueden coexistir un
//                        descanso y un bloque de cardio) y `start` sobre un kind ya vivo ACTUALIZA en
//                        vez de apilar — misma semántica que reusar el id de notificación en Android.
//  · `update(kind, …)` → mueve el estado (pausa, +15 s, nueva fase) sin recrear la actividad.
//  · `end(kind)`       → la cierra de inmediato.
//  · `drainCommands()` → vacía el buzón del App Group donde los App Intents dejan los botones que el
//                        alumno tocó con la app cerrada, y devuelve JSON. Es la contraparte de la cola
//                        module-level de `rest-remote-commands.ts` en Android.
//
//  ── POR QUÉ EL BUZÓN Y NO UN EVENTO A JS ─────────────────────────────────────
//  Un `LiveActivityIntent` corre en el proceso de la app SIN abrirla y sin garantía de que haya un
//  runtime JS vivo. Emitir un evento se perdería. El App Group (`UserDefaults(suiteName:)`) sobrevive
//  a que la app esté suspendida o terminada; el JS lo drena al volver al frente.
//
//  ⚠️ Swift NO se compila en Windows: la validación real de este archivo es el build EAS #3.
//

import ActivityKit
import ExpoModulesCore
import Foundation

/// Parámetros que viajan desde JS. Todos opcionales salvo el título: la actividad debe poder nacer
/// con lo mínimo y enriquecerse en los `update()` siguientes.
struct EvaLiveActivityParams: Record {
  @Field var title: String = ""
  @Field var subtitle: String?
  @Field var accentHex: String?
  /// Fin absoluto en epoch ms → cuenta REGRESIVA.
  @Field var endEpochMs: Double?
  /// Inicio absoluto en epoch ms → cuenta ASCENDENTE.
  @Field var startEpochMs: Double?
  @Field var stageText: String?
  @Field var paused: Bool = false
  /// Texto congelado ("1:23") con el que se dibuja la pausa.
  @Field var pausedSecondsText: String?
  /// `true` sólo para el cronómetro ascendente de cardio. Se persiste en el App Group porque el
  /// intent de "Reanudar" no puede deducirlo del estado en pausa (ver `EvaTimerIntents.swift`).
  @Field var countsUp: Bool = false
}

public class EvaLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("EvaLiveActivity")

    Function("isSupported") { () -> Bool in
      guard #available(iOS 16.2, *) else { return false }
      return ActivityAuthorizationInfo().areActivitiesEnabled
    }

    Function("start") { (kind: String, params: EvaLiveActivityParams) -> String? in
      guard #available(iOS 16.2, *) else { return nil }
      return EvaLiveActivityController.start(kind: kind, params: params)
    }

    Function("update") { (kind: String, params: EvaLiveActivityParams) -> Void in
      guard #available(iOS 16.2, *) else { return }
      EvaLiveActivityController.update(kind: kind, params: params)
    }

    Function("end") { (kind: String) -> Void in
      guard #available(iOS 16.2, *) else { return }
      EvaLiveActivityController.end(kind: kind)
    }

    // El buzón es sólo `UserDefaults` y no necesitaría ActivityKit, pero vive en el controlador (que
    // sí está anotado), así que el guard se repite: en iOS < 16.2 nunca hubo actividad que pudiera
    // dejar un comando, de modo que `"[]"` es la respuesta correcta y no una degradación.
    Function("drainCommands") { () -> String in
      guard #available(iOS 16.2, *) else { return "[]" }
      return EvaLiveActivityController.drainCommands()
    }
  }
}

// MARK: - Controlador

@available(iOS 16.2, *)
enum EvaLiveActivityController {
  /// ⚠️ Estas tres constantes están DUPLICADAS en
  /// `targets/eva-timer-activity/_shared/EvaTimerCommandBus.swift` (otro módulo Swift, no se pueden
  /// compartir). Si cambian acá, cambiarlas allá.
  static let appGroup = "group.cl.evaapp.eva"
  static let commandsKey = "eva.liveactivity.commands"
  static func countsUpKey(_ kind: String) -> String { "eva.liveactivity.countsUp.\(kind)" }

  private static var defaults: UserDefaults? { UserDefaults(suiteName: appGroup) }

  private static func date(fromEpochMs ms: Double?) -> Date? {
    guard let ms, ms.isFinite, ms > 0 else { return nil }
    return Date(timeIntervalSince1970: ms / 1000.0)
  }

  private static func contentState(_ params: EvaLiveActivityParams) -> EvaTimerAttributes.ContentState {
    EvaTimerAttributes.ContentState(
      endDate: params.paused ? nil : date(fromEpochMs: params.endEpochMs),
      startDate: params.paused ? nil : date(fromEpochMs: params.startEpochMs),
      paused: params.paused,
      pausedSecondsText: params.paused ? params.pausedSecondsText : nil,
      stageText: params.stageText
    )
  }

  /// La actividad viva de un `kind`, o `nil`. Se consulta `Activity.activities` (fuente del sistema)
  /// en vez de cachear una referencia: sobrevive a que el proceso se haya reiniciado entremedio, que
  /// es justo el escenario de una app que volvió del fondo.
  private static func activity(for kind: String) -> Activity<EvaTimerAttributes>? {
    Activity<EvaTimerAttributes>.activities.first { $0.attributes.kind == kind }
  }

  static func start(kind: String, params: EvaLiveActivityParams) -> String? {
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
    defaults?.set(params.countsUp, forKey: countsUpKey(kind))

    // Un kind ya vivo se ACTUALIZA: apilar dos actividades del mismo cronómetro sería el equivalente
    // de apilar notificaciones en Android, que el id estable justamente evita.
    if let existing = activity(for: kind) {
      push(existing, contentState(params))
      return existing.id
    }

    let attributes = EvaTimerAttributes(
      kind: kind,
      title: params.title,
      subtitle: params.subtitle,
      accentHex: params.accentHex,
      logoAssetName: nil
    )
    do {
      let activity = try Activity.request(
        attributes: attributes,
        content: ActivityContent(state: contentState(params), staleDate: nil),
        pushType: nil
      )
      return activity.id
    } catch {
      // Fallar al publicar jamás puede romper el cronómetro in-app: el JS ya tiene su propio reloj.
      return nil
    }
  }

  static func update(kind: String, params: EvaLiveActivityParams) {
    defaults?.set(params.countsUp, forKey: countsUpKey(kind))
    guard let activity = activity(for: kind) else { return }
    push(activity, contentState(params))
  }

  static func end(kind: String) {
    guard let activity = activity(for: kind) else { return }
    Task { await activity.end(nil, dismissalPolicy: .immediate) }
  }

  /// Vacía el buzón y devuelve JSON `[{"id":"rest-pause","atMs":123}]`. Devuelve `"[]"` si no hay
  /// nada (o si el App Group no resolviera), nunca lanza.
  ///
  /// La lectura y el borrado van seguidos y sobre el mismo `UserDefaults`, que serializa sus accesos:
  /// un comando escrito por un intent entre medio se pierde o se conserva entero, nunca a medias.
  static func drainCommands() -> String {
    guard let defaults, let raw = defaults.array(forKey: commandsKey) as? [[String: Any]], !raw.isEmpty else {
      return "[]"
    }
    defaults.removeObject(forKey: commandsKey)
    // Se normaliza a tipos JSON puros: `UserDefaults` devuelve NSNumber y JSONSerialization los
    // acepta, pero cualquier valor exótico tumbaría la serialización entera.
    let sanitized: [[String: Any]] = raw.compactMap { entry in
      guard let id = entry["id"] as? String else { return nil }
      let atMs = (entry["atMs"] as? NSNumber)?.doubleValue ?? 0
      return ["id": id, "atMs": atMs]
    }
    guard let data = try? JSONSerialization.data(withJSONObject: sanitized),
          let json = String(data: data, encoding: .utf8) else {
      return "[]"
    }
    return json
  }

  /// `Activity.update` es `async` desde iOS 16.2; el módulo expone funciones síncronas al JS, así que
  /// el envío se despacha en un `Task` (no hay resultado que esperar: la UI la dibuja el sistema).
  private static func push(_ activity: Activity<EvaTimerAttributes>,
                           _ state: EvaTimerAttributes.ContentState) {
    Task { await activity.update(ActivityContent(state: state, staleDate: nil)) }
  }
}
