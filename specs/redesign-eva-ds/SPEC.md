# SPEC — Rediseño total EVA con el nuevo Design System

**Feature:** `redesign-eva-ds`
**Branch:** `feat/redesign-eva-design-system` (off `master`)
**Fecha:** 2026-06-29
**Estado:** Aprobado por CEO (full power, decisiones delegadas). Informe previo: `docs/audits/redesign-eva-ds-informe-2026-06-29.md`.

---

## 1. Qué y por qué

Reimplementar **toda la UI de EVA** (web Next.js + mobile React Native) con el nuevo **EVA Design System** que vive en el proyecto Claude Design `d76cae7a-af93-4f35-8dc2-d96b5603e794` ("EVA Design System MASTER OPT new alumno dash"). El diseño es la nueva fuente de verdad visual: tokens, 13 componentes, 2 UI kits (`eva-app` mobile/responsive · `eva-desktop`), light/dark, white-label.

**Objetivo:** la app se ve y se siente como el diseño nuevo, en los dos frentes, **sin perder ninguna función actual**. Se implementa el diseño **tal cual está** (incluida la reorganización de IA que el diseño ya hizo). Las mejoras vienen DESPUÉS de que todo el diseño esté implementado.

## 2. Decisiones bloqueadas (delegadas por el CEO)

- **D0** — Proyecto canónico: **`d76cae7a`**. Las otras 5 copias se ignoran.
- **D1** — Fasear **horizontal**: tokens → componentes → shell/nav → pantallas por dominio.
- **D2** — White-label: **extender `@eva/brand-kit`** para emitir la ramp `--sport-100…700` completa desde el `primary_color` del coach (conserva clamp WCAG + derivación OKLCH; compartido web+mobile). Ember/aqua quedan fijos.
- **D3** — Tipografía: adoptar **Archivo** (display/métricas) + **Hanken Grotesk** (UI/body) + **JetBrains Mono** (métricas/timers) globalmente. `brand_font_key` per-coach sigue overrideando solo el display.
- **D4** — Generar specs SDD antes de implementar (este documento + `PLAN.md` + `TASKS.md` + specs por pantalla/componente extraídos del diseño).

## 3. Restricciones DURAS (no negociables)

1. **RN mobile ≡ Web responsive (ancho móvil).** La app React Native y la PWA/web a ancho móvil deben ser **idénticas** (mismo layout, mismos componentes visuales, mismo comportamiento). Ambas se implementan desde el mismo origen: `ui_kits/eva-app/`. El **desktop** (`ui_kits/eva-desktop/`) es su propia experiencia y NO está atado a esa igualdad. Regla del diseño: a **<760px el desktop colapsa a la app mobile verbatim**.
2. **Cero pérdida de funciones.** Toda función que existe hoy debe existir en el diseño nuevo, aunque el diseño la haya **reubicado** (ej.: en alumno hay un mini-menú de módulos para usarlos; el navbar es distinto). Si una función actual no tiene hogar evidente en el diseño, se levanta como gap explícito — no se borra silenciosamente.
3. **Sin cambios de negocio/DB.** El rediseño es **presentación + tokens**. No se tocan reducers, engines (`@eva/nutrition-engine`), schemas, RLS, server actions, entitlements, ni el contrato de DB. Idealmente **0 migraciones**. La única extensión de lógica permitida es D2 (brand-kit emite ramp).
4. **Arquitectura intacta.** Se respetan los 4 pilares (Clean Architecture, Feature-First, Atomic Design, SDD). Data flow `_data → services → repository → Supabase` sin bypass.
5. **No romper white-label vivo.** Los coaches free (forzados a `SYSTEM_PRIMARY_COLOR`) y Pro+ (custom) deben seguir funcionando. D2 preserva el contrato `coaches.primary_color`/`brand_font_key`/`use_brand_colors_coach`.
6. **Gate de testing del repo.** Por tanda: `typecheck` + `lint` + build verde (web y mobile). Vitest donde aplique. Playwright/E2E + QA visual SOLO al cierre y con OK del CEO.

## 4. Alcance

### In-scope (implementar el diseño completo)
- **Tokens** (los 9 grupos) en web (`@theme`) y mobile (NativeWind).
- **13 componentes** core/data/forms/navigation en ambas plataformas.
- **Coach** (~42 pantallas): Inicio · Alumnos (+Importar CSV, Perfil/Ficha hub) · Programas (plantillas+constructor+catálogo+planificador) · Nutrición (plantillas+plan alumno+alimentos+grupos+recetas) · Opciones (Mi Marca, Suscripción/billing+Reactivar, Módulos, Funciones, eliminar) · Soporte · Equipo (Teams).
- **Alumno** (~13 pantallas): Inicio (anillos adherencia) · Plan Alimenticio · Aprender · Check-in · Movimiento/Composición read-only · **mini-menú de módulos** (nuevo en el diseño) · Rutina full-bleed · Historial · estados de acceso (crear contraseña, onboarding, pausado).
- **Módulos de pago:** Cardio · Movimiento (7 patrones) · Composición (BIA/ISAK), gated por entitlements.
- **Modos:** standalone + Teams (feature set reducido del coach).
- **Navbar/IA nuevos** del diseño (reubicaciones incluidas).
- **Light/dark** + **white-label** (ramp sport por coach).
- **Desktop shell** (`eva-desktop`): sidebar expand/rail + topbar (breadcrumb + búsqueda global + campana + cuenta), master-detail, builder 3-paneles.

### Out-of-scope (de esta fase)
- Enterprise (`/org`) y Admin (`/admin`) — fuera del diseño.
- Mejoras/cambios sobre el diseño ("primero todo como está, después mejoramos").
- Cambios de DB/negocio (salvo D2).
- Landing pública (a confirmar; el diseño no la cubre como pantalla del kit).

## 5. Criterios de aceptación

- **AC1** — Tokens del diseño presentes y aplicados en web y mobile; `typecheck`+`lint`+build verde en ambos.
- **AC2** — Los 13 componentes existen en ambas plataformas, visualmente 1:1 con los showcases del diseño (light + dark).
- **AC3** — Cada pantalla del diseño (`eva-app` + `eva-desktop`) tiene su contraparte implementada, conectada a los datos/acciones reales existentes (no mocks).
- **AC4** — **Paridad:** un set de pantallas clave (dashboard alumno, plan, rutina, check-in, dashboard coach, alumnos, builder) se ve idéntico entre RN mobile y web a 390px de ancho. Checklist de paridad al cierre.
- **AC5** — **Feature-preservation:** matriz "función actual → ubicación en diseño nuevo" completa, sin función huérfana. (Generada en extracción, verificada al cierre.)
- **AC6** — White-label: un coach Pro con `primary_color` custom recolorea correctamente (ramp sport derivada, WCAG AA) en light+dark, web+mobile. Free → system blue.
- **AC7** — Dark mode funciona en todas las pantallas vía `.dark`.
- **AC8** — Sin regresión funcional: flujos críticos (login alumno/coach, ejecutar rutina + log offline, registrar comida, check-in, crear/asignar plan, branding) pasan E2E al cierre.

## 6. Mapeo de origen (qué archivo del diseño alimenta qué)

| Plataforma | Origen en el diseño | Notas |
|-----------|---------------------|-------|
| Web responsive (mobile width) | `ui_kits/eva-app/` (+ `screens/`) | **Idéntico a RN** |
| RN mobile (`apps/mobile`) | `ui_kits/eva-app/` (+ `screens/`) | **Idéntico a web responsive** |
| Web desktop (`apps/web` ≥760px) | `ui_kits/eva-desktop/` + `DESKTOP-OPT-PLAN.md` | Shell propio; <760px = eva-app |
| Tokens (ambos) | `tokens/*.css` | Ya leídos y mapeados |
| Componentes (ambos) | `components/{core,data,forms,navigation}/` | `.jsx` + `.prompt.md` (contrato) |
| Guidelines | `guidelines/*.html` | Specimens de referencia |

## 7. Plan de fases (resumen — detalle en `PLAN.md` y `TASKS.md`)

0. Extracción del diseño a disco + specs por pantalla/componente.
1. Fundación de tokens (web + mobile) + brand-kit ramp + fuentes.
2. Librería de componentes core (web + mobile).
3. Shell + navegación (desktop shell + mobile chrome + navbar alumno + tab bar).
4. Dashboards (alumno "new dash" + coach).
5. Alumnos + Ficha. 6. Programas + Builder. 7. Nutrición. 8. Módulos (+ mini-menú alumno). 9. Ajustes + Suscripción + Teams. 10. Auth + estados + Rutina + Historial + Aprender + Check-in.
11. Cierre: paridad RN≡web, QA visual, dark, white-label, E2E.

> Cada fase entrega **web + mobile en paralelo** (orquestado con workflows multi-agente). Gate verde por tanda.
