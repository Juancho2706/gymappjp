# Verificación final — directory-summary (Sección 3 coach)

Fecha: 2026-07-12. Estado: paridad de archivos propios cerrada.

## Resultado

Comparado contra el bloque móvil realmente montado de
`apps/web/src/app/coach/clients/CoachWarRoom.tsx`.

- Resumen colapsable y persistente `eva.dir.resumenOpen`, con fade-in.
- Pulse Riesgo/Atención: count-up spring 120/22/0.4, ArrowRight 15, padding
  14×13, tipografía y opacidades 0.95/0.80.
- Ramps exactas por scheme: danger 100/500/600 y warning 100/500/700; el cero
  usa `text-subtle`, no muted.
- Metric chips: padding 7×8, count-up, 15.5/900, sport-600 y ember-700.
- Estado seleccionado usa `text-strong` + `border-strong` y texto
  `surface-card`; corrige el blanco sobre casi-blanco en dark.
- Eyebrow/chevron usan `text-subtle`; línea colapsada usa danger-600.
- Labels y métricas: Total / Activos / Adher. / Nutri.
- `DirectoryAlertBanner` se conserva como alerta operativa RN adicional; no
  reemplaza ningún elemento del WarRoom web.

## Fuera de esta unidad

Header “Tu seguimiento de hoy”/“Alumnos”, icon-buttons y card Herramientas viven
en `clientes.tsx`; se verifican en `directory-screen`.

## Gates

- `pnpm exec tsc --noEmit`: EXIT 0 previo al gate final.
- Tokens 86/86 y export Android: se registran con el commit de tanda.
- QA visual device light/dark × EVA/custom: pendiente.
