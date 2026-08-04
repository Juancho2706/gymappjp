//
//  EvaTimerActivityWidget.swift  (SOLO target de la extensión)
//
//  La UI de la Live Activity: tarjeta de lockscreen + Dynamic Island. Es el gemelo iOS de la
//  notificación ONGOING con `chronometer` que dibuja Android — y como allá, el CONTADOR LO CUENTA EL
//  SISTEMA: `Text(timerInterval:)` recibe instantes ABSOLUTOS y WidgetKit lo redibuja solo, con la
//  pantalla apagada, la app suspendida y el JS congelado. No hay ticker, ni timer, ni push.
//
//  ── PALETA ───────────────────────────────────────────────────────────────────
//  Fondo oscuro translúcido (EVA DS `ink-900` sobre el material del sistema), título en bold, línea
//  secundaria atenuada y el contador monoespaciado grande tintado con el acento de marca que viaja en
//  los atributos. `accentHex` inválido o ausente → azul EVA (`sport-500`), misma regla defensiva que
//  `resolveColor()` en los wrappers JS.
//
//  ── FIGURA EVA (y por qué no el logo del coach) ──────────────────────────────
//  La extensión corre en otro proceso, sin red y sin acceso al sandbox de la app, así que sólo puede
//  usar assets compilados en su propio bundle: la figura EVA (`evaMark`, generada por
//  `expo-target.config.js`) pintada como plantilla blanca. El logo del COACH —que en Android sí va
//  como `largeIcon`— queda DIFERIDO a propósito: exigiría cachear el archivo dentro del App Group y
//  mantener esa caché al día con el branding runtime.
//
//  ── BOTONES ──────────────────────────────────────────────────────────────────
//  Sólo iOS 17+ (`Button(intent:)` no existe antes). En iOS 16.2–16.x la tarjeta se ve completa, sin
//  la fila de botones: degradación limpia, nunca una fila muerta.
//
//  ⚠️ Swift no compila en Windows: la validación real de esta vista es el build EAS #3.
//

import ActivityKit
// AppIntents: `LiveActivityIntent` (constraint de EvaTimerActionButton) y la sobrecarga
// `Button(intent:)` viven ahí — sin este import el target de la extensión no compila (build #3).
import AppIntents
import SwiftUI
import WidgetKit

// MARK: - Bundle

@main
struct EvaTimerActivityBundle: WidgetBundle {
  var body: some Widget {
    EvaTimerLiveActivity()
  }
}

// MARK: - Configuración

struct EvaTimerLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: EvaTimerAttributes.self) { context in
      EvaTimerLockScreenCard(
        attributes: context.attributes,
        state: context.state
      )
      .padding(.horizontal, 16)
      .padding(.vertical, 14)
      // ink-900 de EVA DS con transparencia: se apoya en el material del lockscreen sin perder
      // contraste sobre fondos claros.
      .activityBackgroundTint(Color(red: 0.027, green: 0.031, blue: 0.047).opacity(0.82))
      .activitySystemActionForegroundColor(.white)
    } dynamicIsland: { context in
      let accent = EvaTimerPalette.accent(context.attributes.accentHex)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          EvaTimerMark(accent: accent)
            .frame(width: 26, height: 26)
        }
        DynamicIslandExpandedRegion(.trailing) {
          EvaTimerCounter(state: context.state, accent: accent, size: 30)
        }
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 2) {
            Text(context.attributes.title)
              .font(.system(size: 14, weight: .bold))
              .lineLimit(1)
            if let stage = context.state.stageText ?? context.attributes.subtitle {
              Text(stage)
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
        }
        DynamicIslandExpandedRegion(.bottom) {
          if #available(iOS 17.0, *) {
            EvaTimerActionRow(kind: context.attributes.kind, paused: context.state.paused)
          }
        }
      } compactLeading: {
        EvaTimerMark(accent: accent)
          .frame(width: 16, height: 16)
      } compactTrailing: {
        EvaTimerCounter(state: context.state, accent: accent, size: 13)
          .frame(maxWidth: 56)
      } minimal: {
        EvaTimerCounter(state: context.state, accent: accent, size: 12)
          .frame(maxWidth: 44)
      }
      .keylineTint(accent)
    }
  }
}

// MARK: - Tarjeta del lockscreen

struct EvaTimerLockScreenCard: View {
  let attributes: EvaTimerAttributes
  let state: EvaTimerAttributes.ContentState

  var body: some View {
    let accent = EvaTimerPalette.accent(attributes.accentHex)
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .center, spacing: 10) {
        EvaTimerMark(accent: accent)
          .frame(width: 22, height: 22)
        VStack(alignment: .leading, spacing: 2) {
          Text(attributes.title)
            .font(.system(size: 15, weight: .bold))
            .foregroundStyle(.white)
            .lineLimit(1)
          if let subtitle = state.stageText ?? attributes.subtitle, !subtitle.isEmpty {
            Text(subtitle)
              .font(.system(size: 13))
              .foregroundStyle(.white.opacity(0.62))
              .lineLimit(1)
          }
        }
        Spacer(minLength: 8)
        EvaTimerCounter(state: state, accent: accent, size: 34)
      }

      if state.paused {
        Text("En pausa")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(.white.opacity(0.62))
      }

      if #available(iOS 17.0, *) {
        EvaTimerActionRow(kind: attributes.kind, paused: state.paused)
      }
    }
  }
}

// MARK: - Contador

/// El contador VIVO. Con `endDate` cuenta hacia abajo, con `startDate` hacia arriba y en pausa
/// muestra el texto congelado — el mismo trío de estados que la notificación de Android
/// (`direction: 'down' | 'up' | 'none'`).
struct EvaTimerCounter: View {
  let state: EvaTimerAttributes.ContentState
  let accent: Color
  let size: CGFloat

  var body: some View {
    Group {
      if state.paused {
        Text(state.pausedSecondsText ?? "0:00")
      } else if let end = state.endDate {
        // `ClosedRange` exige inicio <= fin: una cuenta ya vencida se dibuja como un instante
        // mínimo en vez de reventar la vista.
        Text(timerInterval: Date()...max(end, Date().addingTimeInterval(1)),
             countsDown: true,
             showsHours: false)
      } else if let start = state.startDate {
        // Un ascendente no vence solo (lo cierra quien lo abrió): se le da un techo generoso.
        Text(timerInterval: start...start.addingTimeInterval(24 * 60 * 60),
             countsDown: false,
             showsHours: false)
      } else {
        Text("0:00")
      }
    }
    .font(.system(size: size, weight: .semibold, design: .monospaced))
    .monospacedDigit()
    .foregroundStyle(accent)
    .multilineTextAlignment(.trailing)
  }
}

// MARK: - Botones (iOS 17+)

@available(iOS 17.0, *)
struct EvaTimerActionRow: View {
  let kind: String
  let paused: Bool

  var body: some View {
    HStack(spacing: 8) {
      if kind == EvaTimerBus.kindCardio {
        if paused {
          EvaTimerActionButton(title: "Reanudar", systemImage: "play.fill", intent: EvaCardioResumeIntent())
        } else {
          EvaTimerActionButton(title: "Pausar", systemImage: "pause.fill", intent: EvaCardioPauseIntent())
        }
      } else if paused {
        EvaTimerActionButton(title: "Reanudar", systemImage: "play.fill", intent: EvaRestResumeIntent())
        EvaTimerActionButton(title: "Saltar", systemImage: "forward.end.fill", intent: EvaRestSkipIntent())
      } else {
        EvaTimerActionButton(title: "Pausar", systemImage: "pause.fill", intent: EvaRestPauseIntent())
        EvaTimerActionButton(title: "+15 s", systemImage: "goforward.15", intent: EvaRestPlus15Intent())
        EvaTimerActionButton(title: "Saltar", systemImage: "forward.end.fill", intent: EvaRestSkipIntent())
      }
    }
  }
}

@available(iOS 17.0, *)
struct EvaTimerActionButton<I: LiveActivityIntent>: View {
  let title: String
  let systemImage: String
  let intent: I

  var body: some View {
    Button(intent: intent) {
      Label(title, systemImage: systemImage)
        .font(.system(size: 12, weight: .semibold))
        .lineLimit(1)
        .frame(maxWidth: .infinity)
    }
    .buttonStyle(.bordered)
    .tint(.white.opacity(0.16))
    .foregroundStyle(.white)
  }
}

// MARK: - Figura EVA

struct EvaTimerMark: View {
  let accent: Color

  var body: some View {
    // Plantilla blanca: la figura se pinta con el color, no trae el suyo (el PNG de origen es la
    // marca sólida de EVA).
    Image("evaMark")
      .resizable()
      .renderingMode(.template)
      .aspectRatio(contentMode: .fit)
      .foregroundStyle(.white)
  }
}

// MARK: - Paleta

enum EvaTimerPalette {
  /// sport-500 de EVA DS — mismo respaldo que `BRAND_COLOR` en los wrappers JS.
  static let fallback = Color(red: 0.149, green: 0.502, blue: 1.0)

  /// `#RRGGBB` / `#AARRGGBB` → Color. Cualquier otra cosa cae al azul EVA en vez de dejar la vista
  /// sin acento (el hex puede venir del branding del coach, que es dato de DB).
  static func accent(_ hex: String?) -> Color {
    guard var raw = hex?.trimmingCharacters(in: .whitespacesAndNewlines), raw.hasPrefix("#") else {
      return fallback
    }
    raw.removeFirst()
    guard raw.count == 6 || raw.count == 8, let value = UInt64(raw, radix: 16) else { return fallback }
    let rgb = raw.count == 8 ? value & 0x00FF_FFFF : value
    return Color(
      red: Double((rgb >> 16) & 0xFF) / 255.0,
      green: Double((rgb >> 8) & 0xFF) / 255.0,
      blue: Double(rgb & 0xFF) / 255.0
    )
  }
}
