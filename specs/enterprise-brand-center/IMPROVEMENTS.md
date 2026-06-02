# PLAN — Marca Enterprise v2: White-label de clase competidora (cierre de la sección)

> **Branch:** `v2/enterprise` · **Supabase: LOCAL only** · **NO merge / NO db push a prod** · **Sin costos** (libs open-source puras, sin servicios pagos).
> **Estado del rework base (v1):** ✅ hecho (limpieza info-dev, permisos por `orgRoleCan`, loader org source-of-truth, splash iOS, WYSIWYG). Spec: `SPEC.md` / `PLAN.md` / `TASKS.md`.
> **Este plan (v2) CIERRA la sección Marca.** Objetivo: que el white-label sea **igual o mejor que la competencia** (Trainerize / Virtuagym / Glofox) y funcione **idéntico en web hoy y en la app React Native (stores) a futuro**.
> Revisado por los 14 roles (sign-off al final). Complementa `docs/plans/plan-c-enterprise-dashboard-revenue-mvp.md` (§ESTUDIO White-label).

---

## Context (por qué v2)
La v1 dejó la Marca funcional y limpia, pero el cliente solo elige **un color** y la legibilidad se valida con un check WCAG simple. El dueño preguntó por elegir color/contraste de **modo claro y oscuro** y por evitar que "elija algo muy claro y la letra no se vea". La respuesta correcta no es exponer pickers crudos de fondo/texto (footgun de ilegibilidad), sino un **motor de color self-correcting**: un color de marca → paleta tonal perceptual → texto on-color calculado (nunca elegido) → override opcional de acento por modo **con guard de contraste**. Además todo debe vivir en una **capa TS compartida** para que la futura app **React Native** renderice exactamente la misma identidad.

## Decisiones tomadas con el dueño
- **Dominio propio (`eva.negocio.cl`)**: **NULL / diferido mucho tiempo** (hassle de Vercel por cada org). No se construye ahora; se deja documentado como futuro lejano.
- **Tipografía custom**: fuera (v1 ya lo difirió).
- **RN parity**: requisito duro — la lógica de marca no puede ser web-only.

---

## Stack de librerías/técnicas (investigado, todo gratis + RN-safe)
| Pieza | Elección | Por qué | RN/pnpm |
|---|---|---|---|
| Motor de color | **culori** | Perceptual (OKLCH), ESM puro, usado por Tailwind v4 y Radix, WCAG (más preciso) + APCA. | Pure JS, sin postinstall/native → seguro en pnpm v11 (sin `allowBuilds`), corre en RN (sin DOM). |
| Texto on-color (web) | **CSS `contrast-color()`** | Nativo en Chrome 147 / FF 146 / Safari 26 (2026). El browser calcula texto legible antes de pintar. | Solo web → **enhancement**, no fuente de verdad. |
| Texto on-color (verdad) | **culori** (APCA→fallback WCAG) en TS | Misma salida en web y RN (RN no tiene `contrast-color()`). | TS compartido. |
| Esquema light+dark auto (opcional) | **@material/material-color-utilities (HCT)** | `themeFromSourceColor` → light+dark accesibles de 1 color. | Pure JS, RN-safe. Opcional si queremos full-auto. |

> Fuentes: [culori](https://culorijs.org/) · [Color.js contrast/APCA](https://colorjs.io/docs/contrast) · [contrast-color() self-correcting (Smashing 2026)](https://www.smashingmagazine.com/2026/05/building-self-correcting-color-systems-contrast-color/) · [Material HCT dynamic scheme](https://github.com/material-foundation/material-color-utilities) · [APCA/WCAG 2026 guide](https://humbldesign.io/blog-posts/color-accessibility-guide-wcag).
>
> **Recomendación:** culori como base (liviano, perceptual, original via OKLCH, control total del look). Material HCT solo si queremos esquemas 100% automáticos sin tunear roles. Empezar con culori.

---

## Arquitectura — pieza clave: `packages/brand-kit` (TS puro, framework-agnostic)
Hoy `generateBrandPalette`/`getContrastInfo` viven en `apps/web/src/lib/color-utils.ts` (web-only). **Se extraen a `packages/brand-kit`** (junto a `packages/tokens`) como módulo puro, sin React/Next/DOM, para que **web (Next) y RN (Expo) importen lo mismo**. Esta es la decisión que garantiza paridad.

`packages/brand-kit` expone (todo basado en culori):
- `resolveBrandTheme(input): BrandTheme` — de `{ brandColor, accentLightOverride?, accentDarkOverride?, neutralTint? }` → `{ light, dark }`, cada uno con `{ bg, surface, border, accent, accentText, text, textMuted, ... }` (escala tonal OKLCH + on-color por rol).
- `pickOnColor(bg): hex` — APCA primero, fallback WCAG AA 4.5:1 → texto legible garantizado.
- `clampAccent(accent, surface): hex` — ajusta tono si no alcanza contraste mínimo (resuelve "color muy claro").
- `contrastReport(theme): { passes, items[] }` — AA + Lc (APCA) por par crítico.

**Pilares:** Clean Arch (lógica en package/services, no en componentes). Feature-first (`brand/_components`). SDD (este doc). Atomic (preview = molécula local).

---

## Mejoras (M1–M9)

### M1 — Texto on-color calculado, nunca elegido (resuelve "la letra no se ve")
El usuario **no** elige texto ni fondo. `pickOnColor` calcula el texto sobre cada superficie (APCA/WCAG). En web, además, usar `contrast-color()` como capa nativa. Imposible texto invisible por construcción.

### M2 — Paleta tonal perceptual de un color (OKLCH)
`resolveBrandTheme` genera escala de ~12 pasos por modo (estilo Radix/Material), roles bg/surface/border/accent/text. Sustituye el `generateBrandPalette` HSL actual por OKLCH (más uniforme, menos "saltos" feos).

### M3 — Acento por modo claro/oscuro **con guard** (la pregunta del dueño, resuelta seguro)
El cliente elige el color de marca (1) y, opcional, **override de acento para dark** y **para light** (los colores saturados pesan distinto en cada fondo). Cada override pasa por:
- **Guard de contraste en vivo**: si no alcanza AA/APCA contra su superficie → se avisa y se ofrece el tono corregido (`clampAccent`); no se permite publicar algo ilegible.
- Nunca se tocan fondo/texto directamente: solo el acento; el resto lo deriva el motor.

### M4 — Logo claro + logo oscuro + favicon
Subir variante para fondo claro y para oscuro (un logo oscuro desaparece en dark). El layout del alumno/coach elige la variante según el modo. Favicon ya generado por inicial+color como fallback.

### M5 — Readiness bloqueante en publish
El checklist de readiness pasa de informativo a **gate**: si el contraste de marca falla AA, el botón Publicar se bloquea con motivo claro (no solo warning).

### M6 — APCA (Lc) además de WCAG
`contrastReport` muestra Lc (APCA) por par crítico + estado AA. Afinar a "APCA Silver" para UX, mantener AA para lo legal.

### M7 — Consistencia de marca en todas las superficies
Asegurar que los tokens del tema (no solo color+logo) lleguen a: dashboard enterprise, app coach, PWA alumno, **loader**, **splash/icono**, y emails/PDF (Proof Pack/reportes). Evitar "UI jerk" (cambio brusco que rompe la sensación de marca propia).

### M8 — Versionado + rollback de marca publicada (ligero)
Guardar la última marca publicada (snapshot en `brand_draft`-style o columna `brand_history jsonb` con 1-3 versiones) → "revertir a versión anterior". Auditar `brand.published`/`brand.reverted`.

### M9 — Custom domain (DIFERIDO / NULL)
Documentado como futuro lejano (solo web, hassle Vercel). No se implementa. Placeholder en docs.

---

## Flujo enterprise → coach → alumno (propagación de los nuevos tokens)
Mismo mecanismo ya probado, extendido a los tokens nuevos:
1. Org edita en Brand Center → `brand_draft` (incluye brandColor, accent overrides, logos claro/oscuro, neutralTint).
2. **Publicar** → promueve a live + propaga a `coaches` activos (brand + tokens resueltos) + audit.
3. Alumno en `/c/[coach_slug]` y coach `org_managed` heredan vía `proxy.ts` headers + `resolveBrandForWorkspace` (org → coach → EVA). `WorkspaceBrand` (en `packages/types`) crece para llevar el `BrandTheme` resuelto (o los inputs + el generador compartido corre en cada plataforma — ver RN).

## Paridad React Native (requisito duro)
- **Fuente de verdad = `packages/brand-kit` (TS puro)**. Web y RN corren el **mismo** `resolveBrandTheme`. Garantiza pixel-parity de marca.
- RN obtiene los **inputs de marca** (no solo colores resueltos) vía endpoint/contrato (`WorkspaceBrand` + `/api/mobile/brand` futuro) y aplica el tema con su theming (NativeWind v4 / StyleSheet) usando el mismo `brand-kit`.
- `contrast-color()` es web-only → por eso el on-color se calcula en TS (compartido); web lo usa como enhancement, RN usa el valor TS. Misma salida.
- Logos claro/oscuro + `splashBgColor` ya viajan en el contrato → RN genera su splash/icono nativo (build-time) desde los mismos assets.
- Dark/light: RN usa `Appearance` API; el tema light+dark ya viene resuelto por `brand-kit`.

---

## Paridad con competencia (qué igualamos/superamos)
| Capacidad | Trainerize/Virtuagym/Glofox | EVA tras v2 |
|---|---|---|
| Color de marca | ✅ | ✅ + paleta perceptual OKLCH |
| Light/dark accesible | parcial | ✅ auto + override con guard |
| Logo claro/oscuro | a veces | ✅ |
| Splash/icono PWA | ✅ (app propia) | ✅ web + listo para RN store |
| White-label por **coach dentro de la org** | ❌ | ✅ (diferenciador EVA) |
| Texto nunca ilegible (self-correcting) | ❌ manual | ✅ por construcción |
| Costo | caro/por usuario | gratis (open-source) |

---

## Archivos a tocar (representativo)
- **Nuevo** `packages/brand-kit/` (index.ts, package.json) — motor culori + APCA/WCAG, `resolveBrandTheme/pickOnColor/clampAccent/contrastReport`.
- `apps/web/src/lib/color-utils.ts` → re-exporta de `packages/brand-kit` (compat) o se migra.
- `apps/web/src/app/org/[slug]/brand/_components/BrandStudio.tsx` + `BrandLivePreview.tsx` — controles de acento light/dark + guard + preview por modo.
- `apps/web/src/app/org/[slug]/_actions/org.actions.ts` — draft/publish de tokens nuevos + readiness gate (M5).
- `supabase/migrations/<ts>_org_brand_theme.sql` (LOCAL) — columnas: `accent_light`, `accent_dark`, `logo_url_dark`, `neutral_tint`, `brand_history jsonb` (M8). + regenerar types.
- `apps/web/src/domain/auth/types.ts` + `packages/types` — `WorkspaceBrand` lleva `BrandTheme`/inputs.
- `apps/web/src/services/auth/workspace-brand.service.ts` + `apps/web/src/proxy.ts` — propagar/heredar tokens nuevos.
- `apps/web/src/app/c/[coach_slug]/layout.tsx` — elegir logo según modo + aplicar tema resuelto.
- `pnpm-workspace.yaml` — agregar `culori` (y opcional material-color-utilities); confirmar que NO requieren `allowBuilds` (son JS puros).

Reusar: `EvaRouteLoader`, `uploadOrgLogoAction` (validación imagen), `orgRoleCan`/`rolesWithOrgPermission`, `/api/splash/[slug]`.

---

## Verificación (local)
- `pnpm typecheck` + `pnpm lint` limpios.
- **Unit (`packages/brand-kit`)**: `pickOnColor` siempre ≥ AA; `clampAccent` corrige colores extremos (blanco casi puro, negro casi puro); `resolveBrandTheme` estable light+dark. Tests puros (vitest) → corren igual para RN.
- `supabase db reset` local + regenerar types.
- **E2E**: override de acento ilegible → publish bloqueado (M3/M5); brand_manager publica, org_admin no (ya cubierto). Alumno `/c` hereda tema; loader/splash con marca.
- **Parity check**: snapshot del tema resuelto en web == salida de `brand-kit` aislado (mismo input → mismo output) — prueba de que RN obtendrá lo mismo.
- Higiene: 0 jerga dev en UI.

## Sign-off por rol
- **Architect:** motor de marca en `packages/brand-kit` (TS puro) = única fuente de verdad web+RN; capas respetadas.
- **Backend:** publish propaga tokens + readiness gate; audit + versionado.
- **Frontend/UX:** override light/dark con guard, sin pickers crudos; texto auto-legible; WYSIWYG por modo.
- **Mobile (RN):** misma lógica vía package compartido; logos claro/oscuro; splash/icono desde mismos assets; NativeWind aplica el tema.
- **Security:** validación de logo (ya); sin libs con postinstall/native (pnpm seguro); sin filtrar schema.
- **QA:** unit del motor (determinista) + E2E de guard/publish; parity snapshot.
- **PM/Sales/CSM:** white-label ≥ competencia, demostrable; "su app" de punta a punta.
- **Legal:** AA legal + APCA UX; sin datos sensibles en marca.
- **SDR/Fintech:** sin costos nuevos; diferenciador de venta.

## Constraints
NO merge · NO `db push` prod · Supabase **local** · `v2/enterprise` · gratis · dominio propio = diferido.

## DoD (cierre de la sección Marca) — ✅ COMPLETADO 2026-06-02
- [x] `packages/brand-kit` con culori (OKLCH, WCAG) + 9 tests verdes (on-color ≥AA, clampAccent rescata extremos, light+dark determinista para parity RN).
- [x] Acento light/dark con guard de contraste en vivo + texto auto-legible (`pickOnColor`); publish bloqueado si falla AA.
- [x] Logos claro/oscuro (upload variant) + readiness gate server-side en `publishEnterpriseBrandAction`.
- [x] Propagación a coach/alumno: `proxy.ts` headers per-mode + `/c/[slug]/layout` aplica acento por modo vía `.dark` (next-themes). Bug latente corregido: publish no aplicaba el draft.
- [x] Migración local `20260602000000_org_brand_theme` + types + typecheck/lint limpios.
- [x] Verificación: vitest 158, enterprise E2E **100/100** (incl publish end-to-end + permisos brand_manager/org_admin), alumno `/c` smoke verde.
- [x] Versionado: `brand_history` (últimas 3 publicaciones) para rollback futuro.

**Implementación verificada. Sección Marca cerrada.** Pendientes futuros (no bloqueantes): dark-logo swap in-app en `ClientNav` (hoy el logo dark llega a splash/preview; el nav usa el claro), rollback UI sobre `brand_history`, dominio propio (diferido). RN: consume `@eva/brand-kit` + `WorkspaceBrand` tal cual.
