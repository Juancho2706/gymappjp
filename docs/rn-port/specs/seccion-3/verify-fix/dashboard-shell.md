# Verificación final — dashboard-shell (Sección 3 coach)

Fecha: 2026-07-12.

## Resultado

Paridad de código del shell cerrada contra
`apps/web/src/app/coach/dashboard/_components/DashboardShell.tsx`,
`apps/web/src/app/coach/dashboard/error.tsx` y
`apps/web/src/components/coach/CoachMainWrapper.tsx`.

| Contrato | Evidencia web | Resultado RN |
|---|---|---|
| Refetch al recuperar la tab | RSC vuelve a consultar en cada request; gotcha RN de tabs persistentes | `home.tsx` usa `useFocusEffect`; primer foco carga inicial y focos siguientes refrescan sin desmontar el dashboard. |
| Pull-to-refresh | Shell refrescable | `RefreshControl` conserva `loading` y `refreshing` separados. |
| Error recuperable | `error.tsx:19-32` | Copy verbatim “Algo fallo al cargar el dashboard”, mensaje fallback y botón “Reintentar” con `RotateCcw`; también permite pull-to-refresh. |
| Umbral Teams | `DashboardShell.tsx:101` | Elite monta banner sólo con `totalClients >= 80`. |
| Insights | `DashboardShell.tsx:58,118-125` | Abre `MobileClientStatsSheet`, no navega a Opciones. |
| Campana | `DashboardShell.tsx:126-131` | `MobileGreetingHeader` monta `CoachNewsBell`, con novedades reales y badge propio. |
| Avatar/workspace | `DashboardShell.tsx:135-154,216-222` | Multi abre switcher con caret; single navega a Opciones. |
| Orden móvil | `DashboardShell.tsx:91-204` | banners → header → pulse → prioridad → agenda → novedades → onboarding; FAB fuera del scroll. |
| Gutter | `CoachMainWrapper.tsx:64,72` (`px-5`) | 20 px. |
| Offset superior | `globals.css:200` + cancelación `-mt-6` del dashboard | safe-area +16 px. |
| Reserva inferior | `globals.css:198,203` | safe-area +88 px. |

El wrapper también reporta el scroll a la cápsula del coach, requisito de la
unidad `chrome-tabbar-layout`. No se tocó el árbol del alumno/ejecutor.

## Residuo fuera de esta unidad

La composición visual y copy internos de cada widget pertenecen a
`dashboard-sections`; se verifican en su unidad. No se contabilizan aquí como
cierre del shell.
