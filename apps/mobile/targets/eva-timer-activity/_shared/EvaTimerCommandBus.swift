//
//  EvaTimerCommandBus.swift  (carpeta `_shared` → se linkea al target de la APP y al de la EXTENSIÓN)
//
//  Lo que en Android hacen `rest-remote-commands.ts` / `cardio-remote-commands.ts` desde el handler
//  headless de notify-kit, acá lo hace Swift: cuando el alumno toca un botón de la Live Activity, el
//  App Intent (1) MUEVE la actividad al instante —no puede esperar a que despierte el JS, que puede
//  tardar minutos o no despertar nunca— y (2) DEJA EL COMANDO ESCRITO en el App Group para que el
//  puente JS lo drene al volver la app al frente y el motor React adopte el mismo estado.
//
//  ── POR QUÉ EL APP GROUP Y NO UN EVENTO ──────────────────────────────────────
//  Un `LiveActivityIntent` corre en el proceso de la app SIN abrirla y SIN garantía de que exista un
//  runtime JS vivo (la app puede estar suspendida o terminada). Mandar un evento a JS se perdería.
//  `UserDefaults(suiteName:)` del App Group es el único buzón que sobrevive a ambos procesos y a que
//  la app esté muerta. Es exactamente el rol que en Android cumple la cola module-level del bundle.
//
//  ── IDS DE ACCIÓN: LOS MISMOS QUE ANDROID ────────────────────────────────────
//  `rest-pause` / `rest-plus15` / `rest-skip` / `rest-resume` / `cardio-pause` / `cardio-resume`.
//  No son ids nuevos: el puente JS enruta por el MISMO prefijo (`rest-` / `cardio-`) que el registro
//  compartido de notificaciones, así que las dos plataformas hablan un solo idioma.
//
//  ⚠️ Swift no compila en Windows: validar en el build EAS #3.
//

import ActivityKit
import Foundation

/// Constantes compartidas por la app, la extensión y el módulo nativo.
///
/// El App Group va HARDCODEADO (no derivado de `Bundle.main.bundleIdentifier`) a propósito: en el
/// proceso de la extensión ese identificador es el del widget (`cl.evaapp.eva.timeractivity`) y
/// derivarlo daría un suite distinto en cada proceso — el buzón quedaría partido en dos. Debe
/// coincidir con `ios.entitlements` de `app.json` y con `expo-target.config.js`.
enum EvaTimerBus {
  static let appGroup = "group.cl.evaapp.eva"
  static let commandsKey = "eva.liveactivity.commands"

  static let kindRest = "rest"
  static let kindCardio = "cardio"

  static let actionRestPause = "rest-pause"
  static let actionRestPlus15 = "rest-plus15"
  static let actionRestSkip = "rest-skip"
  static let actionRestResume = "rest-resume"
  static let actionCardioPause = "cardio-pause"
  static let actionCardioResume = "cardio-resume"

  /// Segundos que suma "+15 s" — misma unidad que el botón in-app y que `REST_PLUS_SECONDS`.
  static let plusSeconds: TimeInterval = 15

  /// Anexa un comando al buzón del App Group. Nunca lanza: un fallo del buzón no puede impedir que
  /// el botón mueva la actividad (lo visible para el alumno).
  static func appendCommand(id: String, at date: Date = Date()) {
    guard let defaults = UserDefaults(suiteName: appGroup) else { return }
    var queue = defaults.array(forKey: commandsKey) as? [[String: Any]] ?? []
    // Techo defensivo: si la app nunca vuelve a abrirse, el buzón no puede crecer sin fin.
    if queue.count >= 64 { queue.removeFirst(queue.count - 63) }
    queue.append(["id": id, "atMs": date.timeIntervalSince1970 * 1000.0])
    defaults.set(queue, forKey: commandsKey)
  }

  /// "01:23" a partir de segundos. Espeja `formatClock()` de los wrappers JS.
  static func clockText(_ totalSeconds: Double) -> String {
    let safe = max(0, Int(totalSeconds.rounded()))
    return String(format: "%d:%02d", safe / 60, safe % 60)
  }

  /// Segundos representados por un texto "m:ss" (vuelta de `clockText`, para reanudar desde pausa).
  static func seconds(fromClockText text: String?) -> Double {
    guard let parts = text?.split(separator: ":"), parts.count == 2,
          let minutes = Double(parts[0]), let seconds = Double(parts[1]) else { return 0 }
    return minutes * 60 + seconds
  }
}

// MARK: - Mutaciones de la actividad viva

@available(iOS 16.2, *)
enum EvaTimerActivityOps {
  /// La actividad viva de un `kind`, o `nil`. Se busca en `Activity.activities` (fuente del sistema)
  /// en vez de guardar una referencia: sobrevive a que el proceso se haya reiniciado entremedio.
  static func activity(for kind: String) -> Activity<EvaTimerAttributes>? {
    Activity<EvaTimerAttributes>.activities.first { $0.attributes.kind == kind }
  }

  private static func push(_ activity: Activity<EvaTimerAttributes>,
                           _ state: EvaTimerAttributes.ContentState) async {
    await activity.update(ActivityContent(state: state, staleDate: nil))
  }

  /// PAUSA: congela el reloj en TEXTO (regresiva o ascendente, según qué instante estuviera vivo) y
  /// suelta ambos instantes. Es la misma decisión que Android: un contador nativo no se congela, así
  /// que la pausa se dibuja con el número ya escrito.
  static func pause(kind: String, at now: Date) async {
    guard let activity = activity(for: kind) else { return }
    var state = activity.content.state
    let frozen: Double
    if let end = state.endDate {
      frozen = max(0, end.timeIntervalSince(now))
    } else if let start = state.startDate {
      frozen = max(0, now.timeIntervalSince(start))
    } else {
      frozen = EvaTimerBus.seconds(fromClockText: state.pausedSecondsText)
    }
    state.paused = true
    state.pausedSecondsText = EvaTimerBus.clockText(frozen)
    state.endDate = nil
    state.startDate = nil
    await push(activity, state)
  }

  /// REANUDA desde el texto congelado. Recrea el instante absoluto a partir de AHORA, para que el
  /// tiempo en pausa no se descuente (misma regla que `handleResume` en los puentes JS).
  /// `countsUp` distingue el cronómetro ascendente de cardio de las cuentas regresivas.
  static func resume(kind: String, at now: Date, countsUp: Bool) async {
    guard let activity = activity(for: kind) else { return }
    var state = activity.content.state
    let frozen = EvaTimerBus.seconds(fromClockText: state.pausedSecondsText)
    state.paused = false
    state.pausedSecondsText = nil
    if countsUp {
      state.startDate = now.addingTimeInterval(-frozen)
      state.endDate = nil
    } else {
      // Sin segundos congelados no hay nada honesto que reanudar: se cierra en vez de resucitar un
      // reloj en cero (espeja el "nada que reanudar" de los puentes JS).
      guard frozen > 0 else {
        await end(kind: kind)
        return
      }
      state.endDate = now.addingTimeInterval(frozen)
      state.startDate = nil
    }
    await push(activity, state)
  }

  /// "+15 s": corre el fin absoluto. `max(fin, ahora)` porque si la cuenta ya venció mientras el JS
  /// dormía, los 15 s se suman desde AHORA y no desde un pasado (una actividad que nace muerta).
  static func extend(kind: String, at now: Date, by seconds: TimeInterval) async {
    guard let activity = activity(for: kind) else { return }
    var state = activity.content.state
    let base = max(state.endDate ?? now, now)
    state.paused = false
    state.pausedSecondsText = nil
    state.endDate = base.addingTimeInterval(seconds)
    await push(activity, state)
  }

  /// Cierra la actividad de inmediato (Saltar / bloque terminado).
  static func end(kind: String) async {
    guard let activity = activity(for: kind) else { return }
    await activity.end(nil, dismissalPolicy: .immediate)
  }
}
