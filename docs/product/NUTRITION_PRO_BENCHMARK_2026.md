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

**Conclusión para EVA:** es el producto más parecido a lo que debe representar Nutrición Pro. EVA ya une prescripción, consumo real, recetas estructuradas, intercambios, micronutrientes, composición corporal, hábitos y revisión profesional en un mismo flujo.

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

**Conclusión para EVA:** no copiar el EHR completo. Mantener una ficha longitudinal compuesta por evaluación, objetivos, plan vigente, consumo real, notas, hábitos y evolución, con permisos claros para EVA Teams.

### Practice Better + That Clean Life — referente de protocolos y educación

Fuente oficial: https://practicebetter.io/

Patrones relevantes:

- protocolos que agrupan tratamiento, recomendaciones y material para el cliente;
- recetas y planes personalizados;
- preferencias alimentarias;
- diario y accountability entre consultas;
- recomendaciones, objetivos de nutrientes e hidratación;
- meal plans reutilizables dentro de programas/protocolos.

**Conclusión para EVA:** el plan ya puede incluir indicaciones, objetivos de hábitos/hidratación, suplementos y protocolo, manteniendo el núcleo nutricional cuantificable y sin recomendaciones automáticas.

### Fitia — referente de fricción baja para el alumno

Fuente oficial: https://fitia.app/

Patrones relevantes:

- resumen diario visible de inmediato;
- registro rápido con búsqueda, recientes, favoritos y barcode;
- claridad entre consumido, restante y objetivo;
- recetas y planificación semanal;
- navegación orientada a la acción cotidiana.

**Conclusión para EVA:** tomar velocidad y jerarquía, no copiar identidad visual. EVA supera ese patrón al distinguir lo prescrito por el profesional del consumo real adicional y al incorporar revisión profesional.

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
- adherencia por comida y consumo real;
- restricciones, alergias, preferencias y antecedentes;
- notas privadas y evolución longitudinal;
- metas de agua, pasos, sueño y ayuno;
- indicaciones de suplementos y protocolo escrito;
- plantillas y exportaciones existentes;
- revisión compartida y auditada dentro de EVA Teams.

El registro básico no se bloquea detrás de Pro. Pro monetiza la capacidad profesional, no el simple hecho de buscar comida.

## 3. Arquitectura de información implementada

### Alumno — pantalla diaria

Orden estable:

1. fecha y estado del día;
2. consumido vs objetivo;
3. CTA principal `Registrar alimento`;
4. próxima comida;
5. objetivos/hábitos del profesional;
6. consumo real agrupado por franja;
7. comidas del plan;
8. recomendación/nota del profesional;
9. recetas, compras, recap e historial.

### Profesional — workspace de nutrición

1. **Seguimiento de hoy:** alumnos con riesgo o pendientes;
2. **Planes:** activos, plantillas y asignación;
3. **Alimentos:** catálogo, validación y GTIN faltantes;
4. **Recetas:** ideas Base y recetas estructuradas Pro;
5. **Pro:** intercambios, micronutrientes, objetivos, protocolos y reportes existentes.

Desktop usa tablas/master-detail; móvil usa tarjetas, tabs y sheets.

## 4. Principios UI/UX

- una acción primaria por pantalla;
- fecha y objetivo siempre visibles en el diario;
- mismos nombres, estados y orden de acciones en web/RN;
- Ember identifica Nutrición; Sport queda para marca/acciones globales;
- números en mono solo para métricas, cantidades y códigos;
- tarjetas con menos cajas anidadas y más jerarquía tipográfica;
- `consumo real`, sin lenguaje culpabilizante;
- mostrar siempre la base del dato: `por 100 g`, `por 100 ml`, `1 un ≈ X g` o `por porción`;
- no usar color como única señal;
- targets táctiles mínimos de 44 px;
- skeleton, vacío, error y sin permisos diseñados;
- acciones frecuentes al alcance del pulgar;
- listas paginadas/debounced;
- no cargar imágenes grandes en listas.

## 5. Reglas de exactitud de datos

1. `foods.calories/protein_g/carbs_g/fats_g` representan valores por 100 g/ml.
2. `g` y `ml`: factor = cantidad / 100.
3. `un`: factor = cantidad × `serving_size` / 100.
4. La UI no presenta `serving_size` junto a kcal por 100 g como si fueran la misma porción.
5. Cada registro histórico conserva snapshots de nombre, marca, porción y nutrientes.
6. Una receta estructurada calcula totales desde ingredientes y divide entre `servings`.
7. Si el profesional modifica un alimento después, el consumo histórico no cambia.
8. Alimentos y recetas muestran procedencia/estado de verificación cuando es relevante para el profesional.
9. Metas y protocolos proceden del profesional; EVA no prescribe ni completa automáticamente.

## 6. Estado del roadmap

### Completado

- exactitud de unidades y etiquetas;
- esquema de catálogo local/barcode;
- cola de códigos no encontrados y curación con RLS;
- snapshots de consumo;
- diario consumido vs objetivo;
- búsqueda, barcode, recientes y favoritos;
- franjas de comida;
- historial editable del día;
- recetas profesionales estructuradas;
- cockpit prescrito vs consumido;
- alertas transparentes y tendencias de adherencia existentes;
- metas de hábitos/hidratación;
- indicaciones y protocolos profesionales;
- paridad web/RN del flujo principal.

### Pendiente operativo

- importar y verificar un lote piloto de productos comerciales chilenos;
- QA física Android/iOS de cámara, teclado, gestos y safe areas;
- smoke test completo con cuentas coach/alumno/team;
- promoción manual del PR después de aprobación.

### Evolución posterior al lanzamiento

- reportes longitudinales más ricos y exportables;
- materiales educativos versionados;
- consolidación de lista de compras desde recetas estructuradas;
- analítica agregada de grupos alimentarios y micronutrientes;
- herramientas clínicas adicionales solo cuando exista requerimiento validado.

## 7. Qué no implementar

- IA generativa o reconocimiento de platos;
- llamadas externas por cada búsqueda/escaneo;
- score opaco sin explicar el cálculo;
- recomendaciones médicas automáticas;
- copiar visualmente marcas, textos o interfaces propietarias;
- otro sistema paralelo de recetas, favoritos, hábitos o protocolos;
- migraciones destructivas sobre producción.
