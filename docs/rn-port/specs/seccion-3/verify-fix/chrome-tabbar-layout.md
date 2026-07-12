# Fix pass — chrome-tabbar-layout (Seccion 3 coach)

Fecha: 2026-07-11 · Gate: `npx tsc --noEmit` (apps/mobile) EXIT 0.

## Resultado
No habia P0/P1 accionables. Los hallazgos de verificacion adversarial confirmaron que
el port ya aplico TODOS los fixes Ola 0. Verificados in-place (no se toco nada):

| Fix | Estado | Archivo:linea | Verdad web |
|-----|--------|---------------|------------|
| P0 6a nativeModal (bomba -999) | PRESENTE | CoachMobileChrome.tsx:275 (`<Sheet ... nativeModal>`); soporte Sheet.tsx:145/270 | patron Modal RN ronda 7 |
| 4.1.5 fondo tokenizado | PRESENTE | L197/322 `hexToRgba(theme.card, 0.74)` | color-mix(--surface-card 74%) CoachSidebar.tsx:345 |
| 4.1.6 offset inferior | PRESENTE | L193/321 `insets.bottom + 16` | web +16 (L340) |
| 4.1.7 size24/stroke2 | PRESENTE | L237-239 | web (L409) |
| 4.1.8 icono Movimiento | PRESENTE | L68 `PersonStanding` | nav.ts:101 |

Paridad OK adicional (sin cambios): labels verbatim = DISPLAY_LABELS web L64-76;
indicador slot/radius22/primary 0.15+0.24 = sport-500 15%/24% (L365-366);
letterSpacing 0.1 = 0.01em (L415); fill 0.18 + translateY(-1) = web L405-407;
gate `_layout.tsx:18-29` intacto.

## Residual P1 — PENDIENTE-DECISION-CEO (NO accionable en esta unidad)
Ola0 4.1.1: minimizado on-scroll ausente.
- Web: `CoachSidebar.tsx:139-160` (listener scroll) + L338-339 (insets 14→72, fade de labels).
- RN: `styles.capsule` L344-347 fija `left/right: 14` sin listener; la tabBar no observa
  el scroll de las screens.
- Motivo de no-fix: requiere señal cross-unit (cada screen del grupo `(tabs)` tendria que
  emitir su offset de scroll). Esos archivos son AJENOS a esta unidad (regla 7 — disciplina
  de archivos). Implementarlo aqui obligaria a tocar screens de otras unidades. Se ratifica
  como divergencia documentada; CEO decide implementar el bus de scroll cross-unit u omitir.

## cambiosShell
Ninguno. Cero archivos modificados en esta pasada (todo ya estaba correcto).
