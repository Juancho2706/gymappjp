# Informe: cómo funcionan los módulos, dónde se ejecutan y dónde colocar su "uso"

Fecha: 2026-06-24. Insumo para la decisión de rediseño (Claude Design). Combina auditoría del código + investigación UX jun-2026 (fuentes citadas en `ux-nav.md` y `ux-bulk.md`).

---

## TL;DR (veredicto)

1. **Tu instinto es correcto en el FONDO** (un lugar para "usar" los módulos y elegir alumnos), **pero NO como un 6º tab condicional.** Un 6º tab viola el tope de 5 (iOS HIG + Material 3) y un tab que aparece/desaparece es **anti-patrón** (rompe consistencia y memoria muscular; no ayuda a descubrir ni a vender).
2. **Solución: un hub "Módulos/Herramientas" un nivel ABAJO de los 5 tabs fijos**, con entrada estable + entrada contextual desde la ficha del alumno. Contenedor estable, contenido adaptado a lo que el coach tiene (patrón role-based 2026).
3. **Matiz clave del código:** de los 4 módulos, solo 3 (cardio, movimiento, composición) son herramientas **por-alumno**; el 4º (intercambios/Nutrición Pro) **NO es una herramienta** — es una capa dentro del plan de nutrición. **No va en el launcher.**
4. **Otro matiz clave:** los módulos son **captura de datos por-alumno** (mides/evalúas a una persona), **no operaciones masivas**. Así que el launcher vale sobre todo como **atajo "tool-first"** (elijo módulo → elijo alumno → entro), no como bulk pesado. La multi-selección real solo aplica donde exista una acción batch genuina.

---

## 1. Cómo funcionan los módulos (resumen)

Módulos de pago: `cardio`, `movement_assessment`, `body_composition`, `nutrition_exchanges` (comercial: "Nutrición Pro"). Acceso por capas:

- **Capa entitlement** (la que decide): columna jsonb `enabled_modules` en `coaches` (standalone) o `teams` (pool). `hasModule(db, key, ctx)` resuelve por contexto del recurso; `assertModule` es el **techo de seguridad server-side** (el nav/UI es solo espejo visual).
- **Kill-switch de operador** (`EVA_DISABLED_MODULES`): apaga un módulo para todos por encima del entitlement.
- **Feature-prefs** (preferencia, ortogonal al billing): ej. intercambios además exige la sección `micros_advanced` ON.
- **Compra-only:** Opciones → Módulos es un **catálogo read-only**; el coach NO se auto-activa. La escritura de `enabled_modules` es solo service-role (webhook MercadoPago vía `coach_addons` + trigger, o cortesía del CEO).

> No hay piso de tier ("solo Pro+ compra cardio"); el gate de capability ES el entitlement de módulo. El tier solo se usa como telemetría de intención de compra.

## 2. Dónde se ejecuta cada módulo HOY (y la inconsistencia)

| Módulo | Tipo real | ¿Nav hoy? | Entrada actual | Elige alumno |
|---|---|---|---|---|
| `cardio` | Por-alumno (+ calculadoras transversales) | **SÍ** top-level | `/coach/cardio` (hub) | Selector en el hub |
| `movement_assessment` | Por-alumno | **SÍ** top-level | `/coach/movement` (hub = lista) | Lista del hub |
| `body_composition` | Por-alumno | **NO** | Ficha del alumno → `/bodycomp` | Ya fijado por la ficha |
| `nutrition_exchanges` | **Capa del plan** (no herramienta) | **NO** | Toggle dentro del PlanBuilder (client-plan) | Ya fijado por el plan |

**Inconsistencia:** tres modelos distintos para add-ons del mismo nivel — cardio/movement aparecen/desaparecen del nav; composición entra desde la ficha; intercambios es un toggle dentro del builder. En mobile el render real es **"4 primarios + Más"**: cardio/movement caen escondidos en el sheet "Más" (no en un scroll horizontal como decía el comentario del código — corrección verificada).

**Dato útil:** la ficha del alumno YA tiene `ModuleLinksRow`, que ofrece accesos por-alumno a cardio + movimiento + composición. O sea, el patrón "por-alumno" **ya existe** para los 3; el rediseño solo lo unificaría.

## 3. Qué dice la UX (jun-2026, con evidencia)

**Sobre el 6º tab / tab condicional:**
- iOS HIG y Material 3: **máx. 5 destinos**; el exceso va a "More"/overflow, no a un 6º tab. Material 3 incluso volvió a barras más cortas en 2025 (Expressive).
- Tab que aparece/desaparece = anti-patrón (NN/g): rompe consistencia y memoria de posición; el no-pagador nunca lo ve (no vende) y el recién-comprado puede pasar desapercibido.
- Lo que SÍ es tendencia 2026: **role-based adaptive** = mismo esqueleto de nav, **distinto contenido**. No esconder contenedores; adaptar lo de adentro.

**Patrones válidos (cuándo):** "More"/overflow (secundario infrecuente) · **hub-launcher** (familia de herramientas; permite mostrar activos + bloqueados para upsell) · **entrada contextual** (la feature vive en su flujo). Recomendado: **híbrido hub + contextual**.

**Sobre "elegir alumnos y aplicar" (bulk):** patrón estándar = checkbox-select + barra de acción contextual + contador + undo. **Tool-first** (elijo herramienta → elijo objetivos) es legítimo cuando el verbo es la intención ("hoy evalúo movimiento"), pero rompe el noun-verb por defecto → hay que **compensar** con selección explícita, contador y **preview de impacto**. Elegibilidad: grisar lo no aplicable (ej. composición exige peso del alumno). Ofrecer **ambas puertas** (desde la ficha y desde el launcher).

## 4. Recomendación concreta para tu diseño (5 tabs fijos)

**NO** hagas el 6º tab condicional. En su lugar:

### A. Hub "Módulos" (o "Herramientas") un nivel abajo
- Entrada **estable** desde el tab **Alumnos** (los módulos son por-alumno → es su hogar natural): un acceso "Herramientas / Módulos" arriba del directorio. Estable = siempre está; si no compraste nada, muestra el catálogo en modo **bloqueado + upsell** (lo vuelve superficie de venta, no lo esconde).
- **+ Entrada contextual** que ya existe: desde la ficha del alumno (`ModuleLinksRow`) → "usar módulo X con este alumno". No la quites; es la puerta object-first.
- (Opciones → Módulos sigue siendo el **catálogo/compra**; el hub es para **usar**. Son cosas distintas: comprar ≠ usar.)

### B. Flujo del launcher (tool-first)
Hub → tarjeta de módulo (con **etiqueta de alcance**: "Aplica a un alumno" / "Se configura en el plan") → elegir alumno → entrar a la pantalla del módulo de ese alumno.
- Para cardio/movimiento/composición: selector de alumno (buscador + lista). Multi-selección **solo si hay una acción batch real** (ej. "recordar a estos N", "habilitar vista"); la captura en sí es 1-a-1.
- Si algún día hay bulk: checkbox 44px + contador siempre visible + grisar no-elegibles con motivo + **preview de impacto** ("Evaluar a 3") + undo.

### C. Intercambios (Nutrición Pro) NO va en el launcher
Vive dentro del **PlanBuilder de nutrición** (modo plan-de-alumno). Si lo muestras en el hub por descubribilidad, sepáralo visualmente y al tocarlo salta a **un** alumno → su plan (sin multi-select). Nunca con checkbox-list de cohorte.

### D. Descubribilidad post-compra (obligatorio)
El riesgo de bajar los módulos un nivel es que el coach pague y no los encuentre. Mitiga con: confirmación de compra que **enlaza directo** ("Módulo activado → Abrir"), badge "Nuevo" en el hub, empty-state con CTA primaria única en el primer uso.

## 5. Resumen visual de la decisión

| Opción | Veredicto |
|---|---|
| 6º tab fijo | ❌ viola tope de 5 |
| 6º tab condicional (aparece si compras) | ❌ anti-patrón |
| Hub "Módulos" bajo Alumnos (estable) + contextual en ficha | ✅ recomendado |
| Módulos no comprados visibles+gated en el hub (upsell) | ✅ |
| Launcher tool-first → elegir alumno(s) → usar | ✅ (multi-select solo si hay batch real) |
| Intercambios dentro del launcher multi-target | ❌ va en el plan |
| Descubribilidad post-compra (deeplink/badge/empty-state) | ✅ obligatorio |

---

## Decisión que necesito de ti (antes de los PDFs)

1. **¿Hub bajo "Alumnos"** (mi recomendación) **o un tab "Más"** que agrupe Opciones + Módulos? (Si quieres mantener exactamente 5 tabs y ya están llenos de core, "Más" es la alternativa ortodoxa.)
2. **¿Construyo los PDF de brief?** Propongo dos: (a) **"Sistema de módulos"** (cómo funcionan + dónde se ejecutan, backend — expande la auditoría de este informe), y (b) **"Hub/Launcher de módulos"** (spec de rediseño con el flujo recomendado). Más el pendiente ya flagueado: **`/coach/team` (Brand Studio)**.
