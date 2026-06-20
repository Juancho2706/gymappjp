# Plan de ejecución — Menú Opciones + Visibilidad de features (coach) — NO EJECUTADO

> **Estado: PLAN. No construir hasta OK del founder.** Diseño/research detrás: [nutrition-feature-visibility-design-2026-06.md](./nutrition-feature-visibility-design-2026-06.md).

## Contexto

Al sumar features de nutrición, el coach y el alumno se llenan de cosas que no usan (no todos los coaches trabajan nutrición a fondo). Necesitamos que el coach **habilite/deshabilite** secciones, con lo avanzado **OFF por default**. Esto se generaliza: **el mismo sistema servirá para el resto de módulos de EVA** (entrenamiento, etc.) — por ahora arrancamos con Nutrición.

## Decisiones cerradas (founder)

1. **3 presets:** Básico / Intermedio / Profesional.
2. **Micros base (sodio/fibra) = gratis pero OFF por default** (avanzados azúcar/grasas = Pro).
3. **Por-coach Y por-alumno** (ambas capas desde el inicio; el override por-alumno entra ya).
4. **Pro sin pagar = mostrar bloqueado con upsell** (no ocultar).

## Lo nuevo de navegación: menú "Opciones" (3 botones grandes)

Un hub "Opciones" del coach con 3 botones que llevan a menús (2 ya existen):
- **🎨 Mi Marca** → la config de branding existente.
- **💳 Suscripción** → la página de suscripción existente.
- **⚙️ Opciones Coach** → **NUEVO**. Varias zonas; la **primera zona = "Funciones" (habilitar/deshabilitar)**, diseñada para alojar más dominios después (hoy: Nutrición).

## Modelo (resumen — detalle en el design doc)

`visible = ENTITLED (puede, server-side billing) AND NOT killed (operador) AND ENABLED (quiere, toggle coach)`. La preference **solo achica**, nunca amplía. Al pagar Pro → toggles arrancan ON. Apagar = ocultar, **nunca borrar** (gotcha CASCADE de `nutrition_meal_logs`).

## Storage GENÉRICO (para todos los módulos, no solo nutrición)

Tablas por **dominio** (`'nutrition'` hoy, `'training'`… después) — draft listo en `supabase/migrations/20260618200000_feature_prefs.sql`:
- `coach_feature_prefs (coach_id, domain, preset, sections jsonb, PK(coach_id,domain))`
- `client_feature_prefs (client_id, domain, sections jsonb, PK(client_id,domain))`
- RLS: coach gestiona lo suyo; alumno lee (para renderizar su vista); team pool. Tablas side → sin el grant-gotcha de `coaches`/`clients`.

> ⚠️ **Estado prod actual:** ya existen 2 tablas vacías `coach_nutrition_prefs`/`client_nutrition_prefs` (aplicadas por error antes del "plan primero"). La migración `feature_prefs` las dropea (DROP IF EXISTS, vacías) y crea las genéricas. Se reconcilia al ejecutar; no requiere acción manual.

## Config de secciones (código, fuente de verdad)

Paquete puro `packages/feature-sections/` (o `nutrition-sections/`), espejo de `MODULE_CATALOG`:
```ts
interface FeatureSection {
  key; label; tooltip; core: boolean; defaultOn: boolean;
  requiresModule: ModuleKey | null;       // 'nutrition_exchanges' = Pro
  presets: { basico; intermedio; profesional }: boolean
}
```
Tabla de secciones de **nutrición** (core siempre ON; avanzado OFF):

| Sección | Core | Default | Pro | Básico | Intermedio | Profesional |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Plan + comidas + macros + adherencia | ✅ core | ON | — | ON | ON | ON |
| Recetas (ideas) | | OFF | No | OFF | ON | ON |
| Lista de compras | | OFF | No | OFF | ON | ON |
| Hábitos | | OFF | No | OFF | ON | ON |
| Registro fuera de plan | | OFF | No | OFF | ON | ON |
| Notas / feedback | | OFF | No | OFF | ON | ON |
| Método del plato | | OFF | No | OFF | ON | ON |
| Micros base (sodio/fibra) | | OFF | No | OFF | ON | ON |
| Micros avanzados (azúcar/grasas) | | OFF | **Sí** | OFF | OFF | ON* |
| Objetivos por composición corporal | | OFF | **Sí** | OFF | OFF | ON* |

\* Las filas Pro: el preset las marca ON, pero solo se ven si el coach tiene el módulo (si no → bloqueado con upsell).

## Fases de build (cuando se apruebe)

- **F0 — Cimiento:** migración genérica `feature_prefs` (reemplaza las vacías) + paquete `FeatureSections` (config nutrición) + `resolveFeaturePrefs(coachId, clientId?, domain)` server-side (generaliza el `proEnabled` actual de `sections.queries.ts`) + tests (AND-compose, core ON, preference no amplía). Regen types.
- **F1 — Menú Opciones + Opciones Coach:** hub "Opciones" (3 botones: Marca/Suscripción/Opciones Coach) + página Opciones Coach con la zona "Funciones" (preset selector + toggles Base/Pro + tooltips + filas Pro bloqueadas con upsell) + pregunta de onboarding ("¿qué tan a fondo trabajas la nutrición?").
- **F2 — Wiring + override por-alumno:** cablear ambos shells (ficha coach `NutritionTabB5` + alumno `NutritionShell`) para leer el resolver y renderizar condicional; UI de override por-alumno en la ficha (estrechar/ampliar dentro de lo del coach).
- **Gobernanza continua:** toda sección nueva de nutrición (o de otro módulo) nace con su fila en `FeatureSections`. PR sin eso, se rechaza.

## Pendiente del founder antes de ejecutar
- OK al plan.
- Confirmar nombres/ubicación del menú "Opciones" (¿en la nav del coach? ¿en settings?).
- (Opcional) ¿generalizamos ya `training` u otros dominios, o solo dejamos el storage listo y construimos solo nutrición?

## NO se ejecuta nada hasta el OK.
