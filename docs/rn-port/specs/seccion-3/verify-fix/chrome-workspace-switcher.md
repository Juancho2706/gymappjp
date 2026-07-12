# Verificación adversarial — chrome-workspace-switcher

Fecha: 2026-07-12. Fuente: `WorkspaceSwitchSheet.tsx` y trigger móvil de
`DashboardShell.tsx`.

## Resultado

Cero P0/P1 y cero P2 accionable. La unidad y su trigger fueron comparados contra
el web móvil actual.

## Paridad confirmada

- sheet crítico usa `nativeModal`; abre desde frío sin el path -999 de gorhom;
- título y descripción son verbatim;
- no muestra botón X, como `showCloseButton={false}` web;
- fila activa usa borde sport-300 + fondo sport-100;
- caja activa usa sport-500 + icono on-sport;
- iconos coinciden: Dumbbell, UsersRound y Building2;
- labels visibles agregan `- Coach`/`- Equipo` donde corresponde;
- subtítulo reproduce el tipo web: `coach standalone`, `enterprise coach` o
  `coach team`, con capitalize;
- trailing activo muestra Check + “Actual”;
- avatar multi-workspace recupera el caret circular de 18 px; un solo workspace
  conserva el avatar sin caret y abre Opciones;
- condición de montaje `workspaces.length > 1`, cierre, tap de fila activa,
  selección, persistencia, a11y y frescura foreground permanecen cableados.

## Adaptaciones nativas justificadas

- RN cambia el contexto local/JWT-aware mediante el store y re-renderiza el árbol;
  web realiza server action + navegación completa. El resultado observable es el
  mismo workspace activo.
- No se muestra spinner porque la transición RN es síncrona; no existe una espera
  de red equivalente que comunicar.
- Haptic de press es aditivo nativo y no altera contenido ni flujo.
