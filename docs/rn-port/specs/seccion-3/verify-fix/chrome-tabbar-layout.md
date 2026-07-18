# Verificación final — chrome-tabbar-layout (Sección 3 coach)

Fecha: 2026-07-12.

## Resultado

Paridad de código cerrada contra la cápsula responsive de
`apps/web/src/components/coach/CoachSidebar.tsx`. La decisión anterior de
conservar el overflow nativo quedó superada por el plan 1:1: la web sigue siendo
la fuente de verdad y el único bloqueo de producto vigente es el doble-FAB del
directorio.

| Contrato web | Evidencia web | Resultado RN |
|---|---|---|
| Hasta cinco accesos directos, sin “Más” | `CoachSidebar.tsx:110,175-183` | `CoachMobileChrome.tsx`: mismo `MOBILE_TAB_KEYS`, filtro por permisos y `slice(0,5)`; eliminado el sheet/slot “Más”. |
| Orden y copy | `CoachSidebar.tsx:64-76,110` | Inicio, Alumnos, Programas, Nutrición, Opciones; Equipo aparece cuando el resolver team lo coloca entre los cinco. |
| Minimizar al bajar y revelar al subir | `CoachSidebar.tsx:119-160` | `CoachTabbarScrollProvider`: umbral acumulado `abs(dy)>6`, minimiza sólo con `dy>0 && y>80`, resetea al volver arriba o cambiar de tab. |
| Insets 14→72 y labels ocultos | `CoachSidebar.tsx:338-339,388-392,411-421` | `MotiView` anima `left/right` 14→72; gap/padding y label `height/opacity` siguen el estado minimizado. |
| Indicador | `CoachSidebar.tsx:356-372` | 8 px interior, ancho por slot, radio 22, `sport-500` 15%/24%, transición spring. |
| Colores de tab | `CoachSidebar.tsx:395` | Activo `sport-600` derivado de la marca y scheme; inactivo token fijo `ink-400` (`#818C9A`) incorporado al theme. |
| Icono y label | `CoachSidebar.tsx:403-421` | 24 px, stroke 2, fill 18%, translateY -1, texto 10/600 u 800 y tracking 0.1. |
| Estado bloqueado | `CoachSidebar.tsx:176-183,373-427` | “Reactivar” dejó de ser CTA relleno: usa el mismo tab estándar de una sola ranura. El gate de suscripción del layout permanece intacto. |
| Fondo/posición | `CoachSidebar.tsx:333-354` | `surface-card` 74%, borde `text-strong` 9%, radio 30, padding 8 y safe-area +16. |

## Cableado de scroll

El evento se conectó a la región vertical principal de cada tab visible:

- Inicio: `CoachMainWrapper.tsx`.
- Programas: `builder.tsx`.
- Alumnos: ambos modos de `clientes.tsx`, incluido el handler Reanimated con
  `runOnJS` sólo al superar 6 px.
- Nutrición: plantillas, alumnos, alimentos y recetas.
- Opciones: `settings.tsx`.
- Ejercicios: ruta tab oculta/deep-link; conserva el mismo comportamiento si se
  abre dentro del navigator.

No se tocó el árbol del alumno/ejecutor. Los accesos secundarios continúan en el
hub Opciones como en la web; quitar “Más” no eliminó sus pantallas ni deep links.
`/coach/team` y `/coach/reactivate` quedaron dentro de `(tabs)` para que la
cápsula tampoco desaparezca en esas dos rutas; el componente anterior de Equipo
se reutiliza y la URL pública de Reactivar no cambió.

## Gates

- `pnpm exec tsc --noEmit` en `apps/mobile`: EXIT 0.
- `node scripts/check-token-parity.mjs`: 86/86.
- `pnpm exec expo export --platform android`: EXIT 0.

Pendiente fuera del gate automatizado: smoke visual en dispositivo, light/dark y
marca EVA/custom, para certificar la animación y blur reales del fabricante.
