---
status: active-static-complete
owner: product-engineering
last_verified: "2026-07-26 @ e0db4285"
canonical: live-backlog
source_of_truth: specs/mobile-entry-experience/SPEC.md
---

# TASKS — Experiencia de entrada de EVA Mobile

> Backlog ejecutable de [`SPEC.md`](SPEC.md) según [`PLAN.md`](PLAN.md). El owner aprobó las cuatro
> decisiones el 2026-07-26. Los checks físicos continúan abiertos aunque el código esté cerrado
> estáticamente.

## F0 · Auditoría, investigación y aprobación

- [x] Leer documentación canónica y tracker de paridad móvil.
- [x] Auditar splash nativo/React, walkthrough, selector, código, login, branding e intents.
- [x] Contrastar login RN con las cuatro variantes white-label de web responsive.
- [x] Confirmar assets `alumno-scan`, `coach-plan`, `progreso` y `logro@2x`.
- [x] Revisar guías oficiales Apple, Android, Expo, React Native y Supabase.
- [x] Documentar hallazgos con lentes Producto, UX/UI, Frontend/Mobile, Arquitectura, Backend,
      Seguridad, QA y Release.
- [x] Owner aprueba walkthrough de tres slides y trofeo como acento.
- [x] Owner aprueba campo único para código/slug/enlace.
- [x] Owner aprueba splash continuo sin espera ceremonial.
- [x] Owner aprueba ejecutar este P0 antes de ola 5.

## F1 · P0 contrato y acceso

- [x] T1 — Parser/schema compartido.
  - Scope: código, slug, `/c`, `/invite`, query/hash, URI malformado.
  - Verification: tests unitarios en `@eva/schemas` y consumidores web/RN sin regex duplicado.
- [x] T2 — Resolver de branding con errores tipados.
  - Scope: separar resolución, persistencia y actualización de contexto.
  - Verification: coach A→B, caché corrupta, sin red y no encontrado.
- [x] T3 — Endpoint autenticado de workspace.
  - Scope: sesión/JWT, standalone, enterprise, activo/archivado, `setLastWorkspace`, destino.
  - Verification: tests de ruta; service role solo server-side; body no concede identidad.
- [x] T4 — Login RN consume validación autoritativa.
  - Scope: sign-in, destino, force password, error y sign-out seguro.
  - Verification: paridad con `clientLoginAction` web.
- [x] T5 — Intents sin fetch fuera de React.
  - Scope: `/c` y `/invite` manual/deep link convergen.
  - Verification: cold start, warm start y URI inválido.

## F2 · Walkthrough visual

- [x] T6 — Copiar assets 1×/2× a `apps/mobile/assets/onboarding/`.
  - Verification: Metro resuelve densidad desde el import base; bundle sin duplicados accidentales.
- [x] T7 — Implementar tres slides con narrativa aprobada.
  - Verification: ilustraciones visibles offline; trofeo no compite con `progreso`.
- [x] T8 — Implementar responsive, a11y y motion; certificación VoiceOver/TalkBack pendiente en F5.
  - Verification: 320×568, texto ampliado, VoiceOver/TalkBack y Reduce Motion.
- [x] T9 — Persistencia de skip/finish y convergencia estática de sesión/deep links.
  - Verification: primer/segundo arranque y links no muestran walkthrough indebidamente.

## F3 · Selector e identificación

- [x] T10 — Rediseñar selector compacto.
  - Verification: alumno/coach claros, scroll en altura baja y targets 44 pt/48 dp.
- [x] T11 — Unificar código, slug y enlace en un campo.
  - Verification: paste/edit/submit explícito, teclado visible, sin input 1×1.
- [x] T12 — Estados y transición al login.
  - Verification: formato, loading, doble tap, no encontrado, red, retry, back y cambiar coach.
- [x] T13 — Preservar las cuatro variantes tras auditoría 1:1 del login white-label.
  - Verification: `clasico`, `hero`, `energia`, `minimal`; light/dark; EVA/custom.

## F4 · Splash nativo

- [x] T14 — Migrar `app.json` al config plugin `expo-splash-screen`.
  - Verification: config resuelta para Android/iOS y light/dark.
- [x] T15 — Eliminar doble splash y espera mínima obligatoria.
  - Verification: cold/warm start sin flash; fuentes/sesión lentas tienen feedback continuo.
- [x] T16 — Auditar y retirar splashes huérfanos.
  - Verification: cero importadores antes de borrar; diff acotado.
- [ ] T17 — Build y QA física.
  - Verification: EAS Android+iOS; splash no certificado desde Expo Go.

## F5 · Gates y cierre

- [x] `pnpm --filter @eva/mobile exec tsc --noEmit`.
- [x] `pnpm typecheck`.
- [x] Tests unitarios/integración: 61/61 focalizados y suite completa 4130/4130 verdes.
- [x] `pnpm check:tokens`.
- [x] `pnpm docs:check`.
- [x] `expo export` Android/iOS.
- [ ] Matriz device: Android/iOS × light/dark × EVA/custom × online/offline.
- [x] Actualizar `docs/status/MOBILE_PARITY.md`, `docs/status/CURRENT.md` y testing real.
- [ ] Cerrar P0/P1/P2 y retomar ola 5.

## Definition of Done

- [ ] Los criterios de aceptación de `SPEC.md` tienen evidencia enlazada.
- [x] No hay lógica de autorización duplicada o basada en caché/UI.
- [x] No hay dependencias nuevas ni migración DB: el modelo actual resolvió el alcance.
- [x] Diff revisado sin tocar cambios ajenos.
- [x] Build/export verde y QA física se reportan como gates distintos.
