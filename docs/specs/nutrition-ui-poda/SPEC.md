# SPEC — Poda UI + selector de día + wizard 2 pasos · Nutrición V2

Decisiones del owner 2026-07-29 (8 respuestas de opción múltiple + 2 reglas directas). Fuentes:
auditoría `D:\tmp\nutricion-ui-audit-20260729\audit2-*.md`, mockups aprobados "flujos podados"
(estilo = EVA DS actual refinado) y "selector de días". Ejecuta las olas 3-4 del plan de rescate.

## Ola 3 — Poda (sin backend salvo copy)

1. **Permisos → 2 reales.** Quedan `canRegisterFreely` y `canAdjustPrescribedQuantity`. Se retira
   la UI de los decorativos (chips "Puedes sustituir/omitir opcionales" en alumno web+RN; checkbox
   `canSubstitute` del wizard web+RN) y los evaluadores TS muertos de `quantityAdjustmentPercent` /
   `canMoveMealSlot`. Los guards SQL quedan inertes (cero DDL). El contrato NO cambia (rows viejas
   siguen validando); los builders siguen emitiendo defaults.
2. **Fix bug estrategia:** re-tocar la tarjeta de estrategia NO resetea permisos (comparar antes de
   despachar); elegir "flexible" con franjas existentes pide confirmación antes de borrar.
3. **Micros:** quitar "micronutrientes avanzados" del copy del addon (ToolsHub y equivalentes).
4. **Hoy del alumno sin eco** (web+RN): registros bajo su franja + sección "Fuera del plan";
   fuera banner "Comida completa", lista duplicada "Consumido hoy", chip "Ya registraste hoy",
   chips de estrategia/versión/jerga. La nota visible del coach sube al Hoy (card colapsable;
   el plan read ya viaja en ambas superficies). RN además: quitar la doble tira Lu-Do del tab Plan.
5. **Ficha coach en 4 bloques** (web+RN): tira de seguimiento + panel del día + estructura + notas.
   Fuera "Últimos días" y el segundo "kcal restantes" (formula duplicada).
6. **Tab Nutrición del menú de alumnos → card resumen** (web `NutritionTabV2` + RN
   `NutritionV2Summary`): semana en dots + hoy (kcal barra) + racha + CTA "Abrir ficha". Muere el
   clon triple. Gatear las 6 queries V1 desperdiciadas bajo el canary.
7. **Historial por semanas** (web+RN): card por semana (n/7 días · %) con mini-strip tappable que
   abre el día en modo lectura (mecanismo de la ola 1); paginación acumulativa.
8. **Hub coach con dots** de semana por alumno (dato ya viaja). **Dashboard/home del alumno:**
   card nutrición = anillo items + "te faltan X items y N kcal" + deep-link a la franja actual.
9. **Miniatura de alimento SIEMPRE** en toda lista de alimentos (imagen del catálogo o icono por
   categoría; `media` ya viene en el read model). Regla transversal web+RN.

## Ola 4 — Selector de día + wizard 2 pasos

10. **"Tocas el día, no la variante"** (mockup aprobado): strip LU-DO con kcal por celda en
    creador y ficha (web+RN). Día heredado = contenido del base atenuado + CTA "Personalizar"
    (crea la variante copiando el base); día propio = edición directa + menú ⋮ (renombrar,
    objetivos, eliminar). Desaparecen las pastillas de variantes, "+ Agregar día" y la tira
    "Se aplica en" separada. Gate Pro al personalizar el segundo día.
11. **Wizard → 2 pasos:** "El plan" (nombre, metas, permisos reales, vigente-desde; estrategia
    sin hybrid — gate Pro al checkbox de registro libre) y "Los días" (selector nuevo).
    Paso Revisar eliminado; publicar vive en "Los días".
12. Ficha coach: "Estructura prescrita" usa el mismo selector (una card por día, no pila).

## No negociables
- Cero migraciones DB; contratos compatibles hacia atrás; gates completos por ola.
- Tokens runtime white-label, dark premium, tabular-nums, 44pt RN, sin className+style-función.
- Prohibido `get_nutrition_today_v2` con fecha ≠ hoy. Snapshot gana sobre proyección.

## Decisiones owner 2026-07-29 (noche) — cascada V1 restante

1. **Micros V1: matar del todo.** UI restante que los muestre se retira con el retiro V1; tabla `nutrient_targets` queda congelada (cero DDL).
2. **Hilo de comentarios por comida: matar.** "Feedback por comida" queda anotado como candidato V2 futuro (sobre registros/notas visibles).
3. **Restricciones alimentarias: PORTAR a V2** (spec corta futura: alumno declara, coach VE en ficha + aviso en builder al prescribir restringido). `ClientFoodRestrictionsCard` huerfana se CONSERVA como base.
4. **Nota privada del coach: REPONER en la ficha V2** (`CoachPrivateNotesPanel` al mount señalado en `coach/nutrition-v2/[clientId]/page.tsx`).

Ademas (auditoria audit3): señales del perfil (hero/pill/badge/score/PDF) pasan a fuente V2; queries muertas y huerfanos barridos. El retiro completo de superficies V1 del alumno sigue siendo ola propia.
