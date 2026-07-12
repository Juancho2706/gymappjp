# VERIFY/FIX — `directory-row-cards`

Fecha: 2026-07-12  
Fuente de verdad viva: `apps/web/src/app/coach/clients/DirRowCard.tsx`.

## Resultado

Unidad cerrada a nivel código/spec. `DirRowCard` RN reproduce la fila web móvil
activa. `ClientCard.tsx` no se modificó: quedó sin call sites cuando
`directory-screen` restauró la segunda vista `DirTableMobile`; su contraparte
`ClientCardV2` también es código muerto en web.

## Verificación elemento por elemento

| Elemento | Web | RN final |
|---|---|---|
| Card | radius-card, p14, gap12, border-subtle, card, shadow-xs | Mismos tokens/geometría; `shadow('xs')`. |
| Anillo | 50, stroke5, umbrales 75/50, SPORT white-label | 50/stroke5; SPORT se resuelve desde `branding.primaryColor`, no desde accent clamp. |
| Inicial/dot | Archivo 900 18; dot 13 y sin log = danger | Mismos tamaños/copy/umbrales; fallback `?`. |
| Nombre | 15.5 black, tracking -0.025em | 15.5 `displayBlack`, `letterSpacing:-0.39`. |
| Severidad | Span 19 px, px6, gap4, 10.5 bold; icono/texto -700 | Pill local exacto con AlertOctagon/AlertTriangle/Check y ramps scheme-aware. |
| Meta | 12 px regular; adherencia mono bold; gap8; separador border-strong | Mismos pesos/gaps; `theme.ink300`. Nutrición agrupa icono/texto con gap4 y usa `ember-700`. |
| Estado | Archivado, Pausado y Pend. sync con tres tonos distintos | Pills locales `surface-sunken/subtle`, `ink-100/600`, `info-100/700`. |
| Kebab | Ghost 36×36, radius-control, icono 18 ink-700 | 36×36/r14, `text-ink-700`; `stopPropagation()` conserva cuerpo→ficha. |
| Animación | Sin stagger por fila | Eliminado stagger `MotiView`; queda sólo feedback pressed nativo. |

## Datos/acciones

- Sin pulse: `0%`, anillo danger, sin badge de severidad, último `—` y dot danger.
- Nutrición sólo aparece con porcentaje mayor que cero y riesgo/flag.
- Cuerpo abre ficha; kebab abre `ClientActionsSheet`; acciones siguen delegadas a
  handlers del screen.
- Sin fetch propio, TextInput ni cálculo de día calendario.

## Gates

- `pnpm exec tsc --noEmit` — PASS.
- `node scripts/check-token-parity.mjs` — PASS, 86/86.
- `pnpm exec expo export --platform android` — PASS.
- Smoke visual device light/dark × EVA/custom — pendiente de build/device.
