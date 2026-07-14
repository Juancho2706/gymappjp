# EVA Nutrición — benchmark profesional y dirección UX 2026

**Rama:** `Nuevascosasrnopenai`  
**Principio:** sin IA, Chile-first, catálogo local, paridad web responsive/desktop/RN.

## 1. Referentes estudiados

### Nutrium — referente principal del módulo profesional

Fuente oficial: https://nutrium.com/professionals

Patrones relevantes:

- análisis de ingesta con macronutrientes y micronutrientes;
- construcción de planes con base de alimentos, desglose nutricional y orientación de porciones;
- plantillas reutilizables y equivalencias automáticas;
- recetas que pueden incorporarse al plan;
- app del paciente para consultar plan, registrar consumo y comunicarse;
- seguimiento de medidas, hábitos y cambios de peso;
- expediente con historia médica, alimentaria, social y mediciones;
- reportes visuales y materiales educativos.

**Conclusión para EVA:** es el producto más parecido a lo que debe representar Nutrición Pro. EVA ya tiene intercambios, variantes, micronutrientes y composición corporal; el salto pendiente es unir prescripción, consumo real, recetas estructuradas y revisión profesional en un mismo flujo.

### Healthie — referente de expediente y trabajo multidisciplinario

Fuente oficial: https://www.gethealthie.com/

Patrones relevantes:

- intake/onboarding;
- charting y notas clínicas;
- care plans;
- herramientas clínicas;
- soporte multi-profesional;
- journaling;
- portal del paciente;
- reportes, mensajería y seguimiento.

**Conclusión para EVA:** no copiar el EHR completo. Adoptar el principio de una ficha longitudinal: evaluación inicial, objetivos, plan vigente, consumo real, notas del profesional y evolución, con permisos claros para EVA Teams.

### Practice Better + That Clean Life — referente de protocolos y educación

Fuente oficial: https://practicebetter.io/

Patrones relevantes:

- protocolos que agrupan tratamiento, recomendaciones y material para el cliente;
- recetas y planes personalizados;
- preferencias alimentarias;
- diario y accountability entre consultas;
- recomendaciones, objetivos de nutrientes e hidratación;
- meal plans reutilizables dentro de programas/protocolos.

**Conclusión para EVA:** el plan no debe ser solo una lista de gramos. Debe poder incluir indicaciones, hábitos, hidratación, restricciones, recursos y seguimiento, manteniendo el núcleo nutricional cuantificable.

### Fitia — referente de fricción baja para el alumno

Fuente oficial: https://fitia.app/

Patrones relevantes:

- resumen diario visible de inmediato;
- registro rápido con búsqueda, recientes, favoritos y barcode;
- claridad entre consumido, restante y objetivo;
- recetas y planificación semanal;
- navegación orientada a la acción cotidiana.

**Conclusión para EVA:** tomar velocidad y jerarquía, no copiar identidad visual. EVA debe superar a Fitia al mostrar además qué prescribió el profesional y por qué.

## 2. Diferenciación Base vs Nutrición Pro

### Nutrición Base

Valor: hacer que el alumno cumpla y registre sin abandonar EVA.

- plan alimentario del coach;
- resumen diario kcal/P/C/G;
- comidas y alternativas autorizadas;
- consumo real;
- búsqueda local, recientes, favoritos y barcode;
- porciones en g/ml/un y medidas caseras;
- recetas compartidas;
- lista de compras;
- comentarios y recap semanal;
- historial básico.

### Nutrición Pro

Valor: permitir que un nutricionista evalúe, prescriba, ajuste y documente profesionalmente.

- modo por intercambios y equivalencias chilenas;
- objetivos variables por día y comida;
- variantes entrenamiento/descanso;
- análisis macro y micronutriente;
- objetivos basados en composición corporal;
- recetas estructuradas con ingredientes, porciones y macros;
- análisis prescrito vs consumido;
- adherencia por comida, horario y grupo alimentario;
- restricciones, alergias, preferencias y antecedentes;
- notas privadas y evolución longitudinal;
- plantillas, protocolos y reportes;
- revisión compartida y auditada dentro de EVA Teams.

El registro básico no debe bloquearse detrás de Pro. Pro monetiza la capacidad profesional, no el simple hecho de buscar comida.

## 3. Arquitectura de información recomendada

### Alumno — pantalla diaria

Orden estable en las tres superficies:

1. fecha y estado del día;
2. consumido vs objetivo;
3. CTA principal `Registrar alimento`;
4. próxima comida;
5. comidas del día;
6. consumo real adicional;
7. recomendación/nota del profesional;
8. accesos secundarios: recetas, compras, recap e historial.

### Profesional — workspace de nutrición

1. **Hoy / seguimiento:** alumnos con riesgo o pendientes;
2. **Planes:** activos, plantillas y asignación;
3. **Alimentos:** catálogo, validación y productos faltantes;
4. **Recetas:** ideas Base y recetas estructuradas Pro;
5. **Pro:** intercambios, micronutrientes, evaluaciones y reportes.

No mezclar todas las herramientas en una pantalla vertical. Usar master-detail en desktop y navegación por tabs/sheets en móvil.

## 4. Principios UI/UX

- una acción primaria por pantalla;
- fecha y objetivo siempre visibles en el diario;
- mismos nombres, estados y orden de acciones en web/RN;
- Ember identifica Nutrición; Sport queda para marca/acciones globales;
- números en mono solo para métricas, cantidades y códigos;
- tarjetas con menos cajas anidadas y más jerarquía tipográfica;
- `consumo real`, no lenguaje culpabilizante como `fuera de plan`;
- mostrar siempre la base del dato: `por 100 g`, `por 100 ml`, `1 un ≈ X g` o `por porción`;
- no usar color como única señal;
- targets táctiles mínimos de 44 px;
- skeleton, vacío, error, offline y sin permisos diseñados explícitamente;
- acciones frecuentes al alcance del pulgar;
- listas grandes paginadas, con debounce y resultados recientes primero;
- no cargar imágenes grandes en listas.

## 5. Reglas de exactitud de datos

1. `foods.calories/protein_g/carbs_g/fats_g` representan valores por 100 g/ml.
2. `g` y `ml`: factor = cantidad / 100.
3. `un`: factor = cantidad × `serving_size` / 100.
4. La UI nunca debe presentar `serving_size` junto a kcal por 100 g como si fueran la misma porción.
5. Cada registro histórico debe conservar snapshots de nombre, marca, porción y nutrientes.
6. Una receta estructurada calcula totales desde ingredientes y divide entre `servings`.
7. Si el profesional modifica un alimento después, el consumo histórico no cambia.
8. Alimentos y recetas deben mostrar procedencia y estado de verificación cuando sea relevante para el profesional.

## 6. Roadmap recomendado

### P0 — exactitud y base local

- corregir unidades y etiquetas de referencia;
- activar catálogo local/barcode;
- importar lote piloto Chile;
- capturar códigos no encontrados;
- snapshots de consumo.

### P1 — diario de alumno

- shell consumido vs objetivo;
- registro rápido;
- favoritos;
- comidas por franja;
- historial editable del día;
- offline y sincronización.

### P2 — recetas profesionales

- evolucionar `nutrition_recipes`, no revivir tablas legacy;
- ingredientes estructurados ligados a `foods`;
- porciones, tiempo, categoría y macros por porción;
- receta insertable en plan;
- lista de compras derivada.

### P3 — cockpit profesional

- prescrito vs consumido;
- alertas configurables;
- tendencias de adherencia;
- micronutrientes y grupos alimentarios;
- revisión semanal y notas privadas.

### P4 — protocolos y reportes

- objetivos, hábitos, hidratación y recomendaciones;
- plantillas reutilizables;
- PDF/reporte longitudinal;
- permisos y auditoría para Teams.

## 7. Qué no implementar

- IA generativa o reconocimiento de platos;
- llamadas externas por cada búsqueda/escaneo;
- score opaco sin explicar el cálculo;
- recomendaciones médicas automáticas;
- copiar visualmente marcas, textos o interfaces propietarias;
- otro sistema paralelo de recetas;
- migraciones destructivas sobre producción.
