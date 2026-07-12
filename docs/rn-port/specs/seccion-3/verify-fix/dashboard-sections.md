# Verificación en curso — dashboard-sections (Sección 3 coach)

Fecha: 2026-07-12. Estado: tanda A aplicada; unidad aún abierta.

## Cerrado en tanda A

- Header contra el bloque realmente montado en `DashboardShell.tsx:108-157`:
  fecha Santiago a 13 px, `Hola, {firstName}` a 28 px y cluster exacto
  Insights/campana/avatar. Se retiraron del header RN el saludo conceptual,
  subtítulo de pendientes y acceso Search que no existen en ese bloque PWA.
- FAB contra `DashboardFab.tsx`: posición `right 20`, safe-area +92, `cta-fill`,
  copy “Acción rápida” y sólo Crear alumno / Importar / Programa con sus destinos.
- Billing banners contra `BillingBanners.tsx`: superficies, borde y foreground
  sport/warning/danger 100/500/700 por scheme; icono 16; acciones y rutas
  Reactivar/Renovar/Activar plan verbatim; recomendación de tier conserva query.
- PulseHero contra `PulseHero.tsx`: count-up 820 ms reduced-motion-aware, métrica
  display 800/tabular, danger-600 y delta de En riesgo igual a web (`igual`).
- Ya presentes y reconfirmados: agenda con horas/iconos/contador; Novedades con
  tonos sport/success/ember; campana con `useFocusEffect`, imagen y rollback;
  NextStepInset con estructura y tonos web.

## Pendiente antes de cerrar unidad

- `MobileClientStatsSheet`: promedio en header, color por umbral, anatomía de filas
  y decidir el host visual bottom-sheet conservando seguridad `nativeModal`.
- Modales onboarding/free/public-code y sus estados/copy.
- Barrido final de exports montados, claro/oscuro y marca custom.
- Gates completos de la tanda y QA visual device.
