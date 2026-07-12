# VERIFY/FIX — `ficha-shell-hero`

Fecha: 2026-07-12

## Estado

Unidad en progreso. Tanda A cerró shell, hero, tabs, FAB y helpers de fecha.
Pendiente antes de cerrar: menú ⋮ completo y soporte team de sus endpoints.

## Tanda A

- Refetch de ficha por `useFocusEffect`; carga inicial visible y retornos del
  builder silenciosos. Secuencias ignoran respuestas viejas; error de red tiene
  retry y no se presenta como “Alumno no encontrado”.
- Day-detail también refresca por foco con cancelación y `finally`; el refresh
  ya no pisa la fecha elegida por el coach.
- Estado usa `deriveClientStatus` con score acumulado equivalente y señales de
  hoy; conserva Al día/Atención/Urgente.
- Semana, última actividad y helpers compartidos usan días calendario Santiago.
- Header vuelve a “Alumnos” sin duplicar el nombre que ya vive en el hero.
- Activity y barra de adherencia leen `sport-400/500` white-label; sombras,
  tracking, gap y motivos se alinearon al web vivo.
- Tab bar mantiene BlurView Android, usa surface-app tokenizado, geometría web,
  hint descartable/reduced-motion y estado stuck con borde/sombra.
- Badges leen PRs, días efectivos del programa A/B y comidas/riesgo nutricional.
- FAB exige al menos 10 dígitos, queda visible deshabilitado al faltar teléfono y
  abre `wa.me` sin mensaje, igual al FAB web.
- No se tocaron tabs hermanos ni árbol alumno/ejecutor.

## Pendiente

- Reemplazar ActionSheet reducido por acciones web completas: editar, WhatsApp
  con acceso, reset, pausar, archivar y eliminar.
- Ampliar reset/status/delete mobile para workspace team antes de cablear esas
  acciones; autorización servidor obligatoria.
- Verificación final y gates completos de cierre.
