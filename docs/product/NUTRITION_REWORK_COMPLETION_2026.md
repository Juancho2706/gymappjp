# EVA Nutrición — cierre funcional del rework 2026

**Rama:** `Nuevascosasrnopenai`  
**Base de revisión:** `rnmobiledenuevo`  
**Supabase:** `constant` (`jikjeokundmaafuytdcx`)  
**Principios:** sin IA, Chile-first, catálogo local, paridad web responsive/PWA/RN.

## Estado funcional

### Alumno

- resumen diario consumido vs objetivo;
- desglose plan prescrito + consumo real adicional;
- próxima comida y avance del día;
- registro por búsqueda, código, recientes y favoritos;
- cámara de barcode en RN y entrada manual en web/PWA;
- franjas desayuno, colaciones, almuerzo, cena y otro;
- cantidades en g/ml/un con referencia explícita por 100 g/ml;
- snapshots históricos de nutrientes y porción;
- historial de consumo real agrupado por franja y eliminación segura;
- ideas Base y recetas Pro calculadas;
- lista de compras, comentarios, recap, micros e intercambios existentes;
- metas profesionales de agua, pasos, sueño y ayuno comparadas con `daily_habits`;
- indicaciones de suplementos y protocolo escritos por el profesional;
- misma semántica y cálculos en web y React Native.

### Coach / nutricionista

- cockpit prescrito vs consumido por alumno;
- calorías del plan, adicionales, total/meta y adherencia;
- alertas transparentes de falta de registro, bajo cumplimiento o desviación;
- objetivos y protocolo editables desde el cockpit;
- recetas estructuradas con ingredientes, porciones, tiempo y macros;
- biblioteca unificada Base/Pro;
- catálogo local, búsqueda, grupos y porciones corregidas;
- cola de GTIN faltantes visible y vinculable con alimentos existentes;
- soporte de scope personal, coach team y pool de alumnos mediante RLS.

## Migraciones aditivas aplicadas

1. `20260714073000_nutrition_catalog_cl_and_intake_v2.sql`
2. `20260714080500_nutrition_structured_recipes_v1.sql`
3. `20260714083000_save_structured_nutrition_recipe_rpc.sql`
4. `20260714151500_food_catalog_missing_codes_curation.sql`
5. `20260714154000_nutrition_plan_guidance_targets.sql`

No eliminan ni renombran objetos productivos.

## Verificación

- RLS habilitada para cola de códigos e ingredientes de recetas;
- RPC de recetas probada bajo identidad real con `ROLLBACK`;
- resolución coach de código faltante probada bajo RLS con `ROLLBACK`;
- actualización de metas del plan probada bajo RLS con `ROLLBACK`;
- cero filas o valores de prueba persistidos;
- lint, typecheck web, tokens, Vitest y typecheck RN ejecutados por CI;
- Vercel Preview del HEAD disponible mediante alias de rama.

## Pendiente operativo, no funcional

### Catálogo comercial chileno

La infraestructura está terminada, pero el proyecto productivo todavía no contiene productos comerciales Chile verificados:

- `country_code = CL`: 0 filas al momento del cierre;
- barcode local: 0 filas;
- productos verificados: 0 filas.

No se cargaron códigos o nutrientes inventados. El lote inicial debe provenir de una fuente con licencia y procedencia comprobables, importarse offline y pasar validación local antes de publicarse. Open Food Facts puede servir como fuente de importación offline bajo sus condiciones de licencia; EVA no debe consultarlo en runtime.

### QA física

El código pasa validación automatizada, pero cámara, gestos, teclado, safe areas y experiencia offline deben probarse en dispositivos Android/iOS reales antes de promover la rama.

## Criterio para promoción

No promover a producción hasta completar:

1. smoke test con cuentas coach, alumno y team;
2. prueba de creación/asignación de receta Pro;
3. registro y eliminación de consumo en web y RN;
4. escaneo real de un GTIN conocido y uno faltante;
5. revisión de objetivos/hábitos en ambos clientes;
6. lote piloto chileno validado o aceptación explícita de lanzar con catálogo genérico;
7. revisión y aprobación manual del PR.
