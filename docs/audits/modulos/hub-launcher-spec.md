# Hub / Launcher de módulos — spec de rediseño

Brief de diseño para construir el lugar donde el coach **usa** sus módulos de pago. Decisión tomada: **hub bajo el tab "Alumnos"** (no un 6º tab). Basado en la auditoría del código y la investigación UX jun-2026 (fuentes en `ux-nav.md` y `ux-bulk.md`). Sin CSS — solo función y estructura.

---

## 1. Qué es y dónde vive

El **Hub de Módulos** es un destino estable, un nivel por debajo de los 5 tabs fijos (Inicio · Alumnos · Programas · Nutrición · Opciones). Es donde el coach **usa** las herramientas avanzadas que compró — distinto de **Opciones → Módulos**, que es el **catálogo de compra** (read-only). Comprar ≠ usar.

**Dos puertas al mismo flujo** (la investigación recomienda ofrecer ambas):
- **Tool-first (el hub):** acceso "Herramientas / Módulos" arriba del directorio en el tab **Alumnos**. El coach piensa "hoy evalúo movimiento" → entra al hub → elige módulo → elige alumno.
- **Object-first (contextual, ya existe):** desde la ficha del alumno (`ModuleLinksRow`) → "usar módulo X con este alumno". No se elimina; es el mapa mental por defecto (noun-verb).

> Por qué bajo "Alumnos": los módulos son **herramientas por-alumno** → su hogar natural es donde están los alumnos. Mantiene los 5 tabs fijos y limpios.

## 2. Principios (no negociables, con respaldo UX)

1. **NO 6º tab, NO tab condicional.** Tope de 5 (iOS HIG / Material 3); un tab que aparece/desaparece rompe consistencia y memoria de posición, y no ayuda ni a vender ni a descubrir.
2. **Contenedor estable, contenido adaptado** (role-based 2026): el hub siempre existe; lo que cambia es qué tarjetas muestra según lo que el coach tiene.
3. **Mostrar lo no comprado, bloqueado + upsell** (patrón ClickUp/Spotify): el hub es también superficie de venta.
4. **Honestidad de alcance:** cada módulo declara su tipo de flujo antes de entrar.

## 3. Estructura del hub

Una grilla de **tarjetas de módulo**. Cada tarjeta:
- Nombre + ícono + una línea de valor (del catálogo `@eva/module-catalog`).
- **Estado**: Activo · De pago (bloqueado) · En mantenimiento (si kill-switch del operador).
- **Etiqueta de alcance** (clave para no confundir): "Se usa con un alumno" (cardio/movimiento/composición) vs "Se configura en el plan" (intercambios).
- **Acción primaria** según estado:
  - Activo → "Usar" (entra al flujo).
  - Bloqueado → "Desbloquear" → `/coach/subscription#addons` (o mailto según contexto/flag).
  - Mantenimiento → deshabilitado con aviso "Temporalmente no disponible".

Estados del hub completo:
- **Sin módulos comprados:** no se esconde — muestra el catálogo en modo bloqueado + upsell (empty-state que vende, con CTA primaria única).
- **Con módulos:** activos arriba, bloqueados abajo (o sección "Descubre más").

## 4. Flujo de "usar" un módulo (tool-first)

```
Hub → tarjeta "Usar" → elegir alumno → pantalla del módulo de ESE alumno
```

> **Matiz crítico (del código):** los módulos son **captura de datos por-alumno** — se mide/evalúa a UNA persona a la vez (no son operaciones masivas). Por eso el valor del launcher es ser un **atajo de navegación tool-first**, no un motor de bulk. El selector de alumno es **single por defecto**. Multi-selección **solo** donde exista una acción batch real (ej. "recordar a estos N que hagan su check-in"); no inventar bulk donde la tarea es 1-a-1.

Por módulo:
- **Cardio** → elegir alumno → perfil cardio (FC reposo, FCmax, ref 5k) → zonas Z1–Z5. (Extra: las **calculadoras transversales** del hub de cardio no necesitan alumno → accesibles sin selección, como sub-vista del flujo cardio.)
- **Movimiento** → elegir alumno → reporte / nueva evaluación (wizard 7 patrones).
- **Composición** → elegir alumno → captura BIA / ISAK. **Elegibilidad:** si el alumno no tiene peso registrado, marcarlo no-elegible con motivo (no fallar en silencio).
- **Intercambios** → **NO aparece como herramienta del launcher.** Vive en Nutrición → plan del alumno. Si se muestra por descubribilidad, va en sección aparte y salta directo a **un** alumno → su plan (sin multi-select).

## 5. Si algún día hay una acción batch real (patrón a seguir)

Las 4 piezas estándar (NN/g, Eleken 2026):
1. **Selección con checkbox** (44px touch), buscador arriba, lista de alumnos.
2. **Barra de acción contextual** fija (mobile: abajo) que aparece al seleccionar y se adapta al conteo.
3. **Contador siempre visible** ("Aplicar a 3 alumnos"); check maestro con estado parcial; distinguir "seleccionar página" vs "seleccionar todo".
4. **Preview de impacto + confirmación + undo**: pantalla resumen (módulo, N alumnos, no-elegibles grisados con motivo, botón con conteo), y tras ejecutar un toast con deshacer. Confirmación solo para lo destructivo/irreversible.

## 6. Descubribilidad post-compra (obligatorio)

El riesgo de bajar los módulos un nivel: el coach paga y no los encuentra. Mitigar con:
- **Confirmación de compra que enlaza directo** ("Módulo activado → Abrir cardio"), no solo "gracias".
- **Badge "Nuevo"** en el hub / la tarjeta recién activada.
- **Empty-state con CTA primaria única** en el primer uso ("Configura tu primer perfil cardio").
- Tooltip/hotspot anclado a la entrada del hub la primera vez.

## 7. Gating (recordatorio de implementación)

El hub es **espejo visual**, igual que el nav hoy. El techo real de acceso es `assertModule` server-side en cada pantalla de módulo. El hub muestra/oculta/bloquea tarjetas leyendo `hasModule` por contexto (standalone = `coaches.enabled_modules`; team = `teams.enabled_modules`, regla LOCKED). En team, miembro no-gestor ve "pídelo al owner".

## 8. Qué NO hacer (anti-patrones)

- ❌ 6º tab (fijo o condicional).
- ❌ Esconder los módulos comprados en un overflow "Más" sin señalización (el problema actual en mobile).
- ❌ Meter intercambios en un launcher de multi-selección (rompe su modelo: vive en el plan).
- ❌ Forzar multi-select donde la tarea es captura 1-a-1.
- ❌ Doble acceso descoordinado (nav + ficha) — consolidar en hub + contextual.

## 9. Resumen de decisiones

| Tema | Decisión |
|---|---|
| Ubicación | Hub bajo tab **Alumnos** + entrada contextual en la ficha |
| 6º tab | No (anti-patrón) |
| Módulos en el hub | Cardio, Movimiento, Composición (por-alumno) |
| Fuera del hub | Intercambios (capa del plan de nutrición) |
| No comprados | Visibles, bloqueados, con upsell |
| Selección de alumno | Single por defecto; multi solo si hay batch real |
| Compra | Sigue en Opciones → Módulos (catálogo) / Suscripción |
| Seguridad | `assertModule` server-side; el hub es espejo |
