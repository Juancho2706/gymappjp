# VERIFY/FIX — `directory-sheets`

Fecha: 2026-07-12  
Fuente: `DirectoryActionBar.tsx`, `ClientActionsSheet.tsx` y primitivo web `sheet.tsx`.

## Resultado

Unidad cerrada a nivel código/spec. Los tres sheets mantienen `Modal` RN nativo
(sin incompatibilidad Gorhom/Reanimated 4) y alinean contenido, geometría,
tokens, límites y accesibilidad con la PWA.

## Verificación

- Overlay negro 60%; radius-sheet 28; handle nativo preservado.
- Botón cerrar visible 32×32, borde/surface-sunken, X 16, igual al primitivo web.
- Altura máxima responsiva: Filtros `min(85%,620)`, Orden `min(85%,520)`,
  Acciones `min(88%,620)`; cuerpo scrollable y padding inferior safe-area.
- Filtros conserva tres grupos independientes Estado/Riesgo/Programa, copy
  verbatim, filas 44, radius-sm 10, label 13.5 y footer `cta-fill` “Ver resultados”.
- Checks usan `sport-600`; labels de grupo y badges usan `text-subtle`.
- Orden usa “Ordenar por”, filas 44, checks 15 y labels 13.5.
- Acciones contiene Ficha, WhatsApp, Editar, Reset, Pausar/Reactivar,
  Archivar/Desarchivar y Eliminar con iconos/copy web. Los accesos nativos
  Compartir/Programa/Nutrición se preservan como atajos adicionales.
- Avatar fijo `ink-900` + `sport-400`; iconos usan ramps -600, no hex -500.
- Filas exponen roles checkbox/radio/button y estados checked; cada sheet se
  anuncia como modal con label.

## Adaptaciones RN sancionadas

- Sin `backdrop-blur`: `Modal` RN no ofrece backdrop-filter; scrim 60% conserva
  contraste.
- Confirmaciones sensibles abren `Alert`/`NativeDialog` nativos del screen. Delete
  exige escribir nombre y Reset muestra/copia clave temporal, por lo que no hay
  pérdida funcional frente al `ConfirmBody` web.
- Handle se mantiene además de X/cierre por overlay.

## Gates

- `pnpm exec tsc --noEmit` — PASS.
- `node scripts/check-token-parity.mjs` — PASS, 86/86.
- `pnpm exec expo export --platform android` — PASS.
- Smoke device light/dark × EVA/custom — pendiente.
