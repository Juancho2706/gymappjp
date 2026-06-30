# Coach Settings / "Mi Marca" Restructure - SPEC

**Status:** DRAFT
**Owner:** TBD
**Last updated:** 2026-06-22
**Related plan:** `specs/coach-settings-restructure/PLAN.md`
**Origin:** UX/IA audit del hub "Opciones" + sección de marca del coach (multi-agente, 14 hallazgos confirmados contra código, respaldo best-practices 2026). Quick wins de copy/visual ya aplicados; este spec cubre los *bigger bets* (reestructura de IA + flujo de compra↔visibilidad + preview único).

---

## Problem

El hub de configuración del coach (`/coach/settings`, etiqueta de nav "Opciones") mezcla patrones y entierra superficies importantes:

1. **Anidación de más.** El camino a `Módulos` (la superficie donde el coach COMPRA add-ons = ingresos) es de 3-4 niveles: nav → hub → card-contenedor "Opciones Coach" → subpágina. "Opciones Coach" es un wrapper inerte (no clickeable) dentro de una página ya titulada "Opciones" (tautología), y rinde a `Módulos` como la fila visualmente más apagada de la pantalla.
2. **Módulos vs Funciones no se reconcilian.** Son dos páginas del modelo interno `visible = ENTITLED (compra) AND ENABLED (toggle)`. El producto necesita un párrafo (`FeaturePrefsPanel.tsx`) para explicar la diferencia — síntoma de que el split no es intuitivo. Failure mode real: compro Nutrición Pro (Módulos = "Activo") pero no aparece porque una Función está OFF → "pagué y no aparece". El coach rebota Módulos↔Funciones↔Suscripción.
3. **"Áreas del builder" en el bucket equivocado.** Es taxonomía del builder de fuerza (`@/services/workout`), no entitlement ni visibilidad; está agrupada con Módulos/Funciones solo por conveniencia de layout.
4. **Preview de marca no fiable + triplicado.** El botón "Vista previa" abre `/coach/settings/preview` que muestra lo **guardado** en DB, no lo que el coach edita (estado dirty); es navegación dura que descarta el form al volver. Conviven 3 representaciones de "cómo se ve" (inline sticky live, página /preview stale, mini-preview de contraste de BrandAdvanced).

## Users

- **Primary:** coach standalone (con branding) — gestiona su marca, su suscripción y sus módulos.
- **Secondary:** owner/co-gestor de team — ve el hub de pool (sin marca personal).
- **Internal/operator:** CEO (override de módulos vía `coach_addons` / `/admin`); no toca este hub.

## Goals

- Aplanar la IA del hub a **≤2 niveles** y ~**5 categorías** plain-language (NN/g progressive disclosure).
- **Superficiar** `Módulos` (ingresos) en vez de enterrarla; co-locar con `Suscripción` como zona "lo que pago".
- Que un coach **nunca** quede en el estado "compré y no aparece": la visibilidad se enciende sola al comprar, y donde un estado oculto sea legítimo, el empty-state se autoexplica con acción directa.
- **Un solo preview de marca** canónico y fiel (refleja lo que editás, sin guardar).
- Preservar intactos los 4 pilares y el modelo de billing: `Módulos` sigue **compra-only/read-only** (writes service-role), `Funciones` sigue siendo la única capa con toggles (authenticated).

## Non-Goals

- **NO** fusionar Módulos+Funciones en un único control de compra+toggle. Rompe la separación service-role (compra) vs authenticated (toggle) y el requisito SERNAC de "qué compraste" read-only. Se resuelve con cross-link, no con merge.
- **NO** introducir autosave para campos de marca (alto impacto, customer-visible → save explícito, NN/g + GitLab Pajamas).
- **NO** tocar enterprise (`org_managed` redirige hoy; sin zona de Funciones en v1).
- **NO** publicar precios de módulos en este spec si el negocio aún no los expone (catálogo sin price field; ver Open Questions).
- **NO** rediseñar el editor de marca en sí (logo/color/loader) más allá de unificar el preview y el modelo de guardado del logo.

## User Stories

- Como **coach**, quiero llegar a Módulos y a mi Suscripción en un toque desde "Opciones", para no cavar entre secciones para gestionar lo que pago.
- Como **coach**, quiero que al comprar un módulo aparezca y funcione de inmediato, sin descubrir que hay un segundo interruptor en otra página.
- Como **coach**, cuando entro a un módulo que tengo activo pero está oculto, quiero un cartel que me diga "lo tenés, está oculto — Mostrar", en vez de una pantalla en blanco.
- Como **coach**, quiero que el botón "Vista previa" me muestre exactamente los cambios que estoy haciendo, para confiar en cómo verán mi marca mis alumnos.
- Como **owner de team**, quiero el mismo hub aplanado en contexto de pool (sin marca personal), coherente con el standalone.

## Acceptance Criteria

- [ ] **IA:** el hub standalone muestra ~5 cards de primer nivel con un único patrón visual (sin wrapper "Opciones Coach"); ninguna setting queda a >2 niveles del hub.
- [ ] **Revenue surface:** `Módulos` se presenta como card de peso visual igual o mayor a las demás, co-locada con `Suscripción`.
- [ ] **Áreas:** `Áreas del builder` ya no vive en el bucket de entitlements/visibilidad (movida a contexto de entrenamiento). Aplica a ambos contextos donde aparece (standalone + team).
- [ ] **Cross-link Módulos↔Funciones:** Módulos muestra por módulo activo su estado de visibilidad ("Activo · Visible" / "Activo · Oculto → Mostrar"); Funciones muestra los toggles de módulos no comprados como deshabilitados con "Comprar en Módulos →" (sin permitir prender algo no entitled).
- [ ] **Auto-ON visibilidad:** al materializarse una compra de módulo (webhook → `coach_addons` → trigger), la preferencia de visibilidad del dominio correspondiente queda ON (opt-out, no opt-in). Idempotente, service-role.
- [ ] **Empty-state honesto:** una superficie de módulo vacía por toggle OFF muestra "lo tenés activo, está oculto — Mostrar →"; vacía por 0 alumnos muestra su propio empty-state (no crash). (Cierra el bug conocido cardio/movement con 0 alumnos.)
- [ ] **Preview único:** existe un solo preview de marca (inline live). `/coach/settings/preview` queda removido o convertido en toggle "Expandir" del mismo componente; el FAB ya no enlaza a una página stale.
- [ ] **Seguridad/privacidad:** `Módulos` sigue read-only (cero writes authenticated); el gate de dinero sigue server-side; el toggle de Funciones nunca es la frontera de capability.
- [ ] **Mobile/responsive:** hub y subpáginas usan `dvh`, sin saltos de ancho jarring entre pantallas hermanas; targets ≥44px.
- [ ] **A11y:** cards/links con roles correctos; back-links uniformes; dark mode verificado.
- [ ] **Observabilidad:** la telemetría de intención de módulo (`module_interest_cta_clicked`) se preserva tras el reacomodo de CTAs.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Auto-ON visibilidad toca el path de billing (webhook/service-role) | Alto — un bug acá afecta cobros/entitlements | Cambio aditivo e idempotente en el materializador de `coach_addons`; default ON solo para el dominio del módulo comprado; tests de idempotencia; nunca escribir el jsonb directo (respetar trigger D1). |
| Cross-link hace que Módulos lea estado de Funciones (feature-prefs) | Medio — acopla dos capas en el render | Lectura read-only vía service desde `_data` (NO Supabase directo); Módulos sigue sin escribir. |
| Mover Áreas rompe deep-links/bookmarks | Bajo | Mantener `/coach/settings/areas` viva (redirect o acceso desde builder), igual que se hizo con `/coach/exercises`. |
| Remover `/coach/settings/preview` rompe el guard de team (`awareness.spec` "preview DENEGADO en team") | Bajo | Si se borra la ruta, borrar/ajustar el test; si se conserva como redirect, mantener el guard. |
| Flatten cambia labels que asserts E2E usan | Bajo | Sincronizar specs de `tests/separation/*` en la misma tanda. |

## Resolved Decisions (2026-06-22, CEO)

- [x] **Layout desktop del hub:** **cards aplanadas** (sin wrapper "Opciones Coach"; 5 cards de 1er nivel; Suscripción+Módulos agrupadas como "lo que pago"). Left-rail descartado por ahora (cambio chico primero). → F1.
- [x] **/preview:** **convertir en toggle "Expandir"** del preview inline (full-screen del MISMO componente fiel). Borrar la ruta separada `/coach/settings/preview`. → F2.
- [x] **Nombre "Funciones":** **mantener "Funciones"** (catch-all que crecerá a otros dominios). NO renombrar. → elimina la sub-tarea de rename.
- [x] **Áreas:** **acceso desde la pantalla del builder** (sale del bucket de módulos/entitlements). Mantener `/coach/settings/areas` viva (deep-links). → F6.
- [x] **Precio de módulos:** **SÍ mostrar el precio mensual** junto al CTA en `Módulos` (objetivo: el coach no escribe mail para saber cuánto). Requiere cablear un `price` en `@eva/module-catalog` (scope extra). **Pre-requisito:** confirmar el precio firme ($9.990/mód uniforme, ref. estrategia teams-first) + el disclosure SERNAC correspondiente antes de publicar números. → F3 (ampliado).

## Open Questions

- [ ] **Precio — fuente y disclosure:** confirmar valor firme y el texto legal/SERNAC antes de exponerlo en UI (bloquea solo la parte de precio de F3, no el resto).
