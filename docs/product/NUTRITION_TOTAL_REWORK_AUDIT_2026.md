# EVA Nutrición — auditoría integral y blueprint del rework total 2026

**Rama:** `Nuevascosasrnopenai`  
**Base:** `rnmobiledenuevo`  
**Supabase productivo:** `constant` (`jikjeokundmaafuytdcx`)  
**Estado:** arquitectura y funcionalidades Base/Pro avanzadas, pero frontend V2 todavía no reemplaza completamente las superficies legacy.

---

## 1. Veredicto ejecutivo

El trabajo realizado hasta ahora es una buena **base funcional y de datos**, pero todavía no es el rework total solicitado.

La rama añadió:

- diario de consumo real;
- barcode/favoritos/recientes;
- recetas estructuradas;
- cockpit profesional;
- metas y protocolos;
- soporte Chile-first y curación de catálogo;
- paridad parcial web/RN.

Sin embargo:

1. la página web del alumno monta bloques nuevos y después conserva `NutritionShell` completo;
2. la página del coach monta un cockpit nuevo encima de `NutritionHub` existente;
3. el `PlanBuilder` central no fue reescrito;
4. la pantalla principal RN continúa siendo el shell anterior;
5. el concepto de consumo mezcla comidas prescritas marcadas con entradas reales;
6. plantillas y planes de alumno usan estructuras internas distintas;
7. no existe todavía un sistema visual efectivo de imágenes/ilustraciones de alimentos;
8. la PWA permite escribir el GTIN, pero no abre cámara;
9. la historia se reparte entre logs de comidas y entradas del diario real.

**Decisión:** detener la suma de tarjetas sobre las vistas antiguas. Construir superficies V2 completas, reutilizando backend y datos seguros, y reemplazar el render legacy cuando V2 cumpla paridad.

---

## 2. Datos reales de producción que condicionan el rework

Estado consultado el 14 de julio de 2026:

- 115 planes de nutrición;
- 33 plantillas;
- 486 comidas prescritas;
- 755 días de historial;
- 2.436 logs de comidas;
- 2 entradas del diario real V2;
- 344 alimentos;
- 0 alimentos Chile (`country_code = CL`);
- 0 alimentos con barcode;
- 0 alimentos verificados;
- 0 imágenes de producto persistidas;
- 109 planes en modo `grams`;
- 6 planes en modo `exchanges`.

No es seguro eliminar o reinterpretar silenciosamente la estructura anterior. El rework debe ser aditivo, versionado y compatible con lectura histórica.

---

## 3. Problema conceptual principal: prescripción no es consumo

### Estado actual

El sistema puede calcular:

- macros del plan marcadas como completadas;
- macros de alimentos añadidos al diario real;
- total = ambos valores sumados.

Eso puede duplicar el consumo cuando el alumno:

1. marca una comida prescrita como completada; y
2. registra los alimentos reales que comió.

### Modelo correcto

- **Prescripción:** lo que el coach espera, autoriza o fija como objetivo.
- **Consumo real:** lo que el alumno declara haber comido.
- **Adherencia:** comparación transparente entre prescripción/objetivo y consumo real.

El consumo diario debe tener **una sola fuente canónica**: `nutrition_intake_entries` o su evolución V2.

Los logs legacy de comidas seguirán leyéndose para historia y compatibilidad, pero las nuevas escrituras deben converger en el diario real.

---

## 4. Estrategias de plan que EVA debe soportar

El coach debe escoger la estrategia al crear o publicar un plan.

### A. Plan estructurado

El coach prescribe comidas y alimentos concretos.

El alumno ve:

- qué comida corresponde;
- alimentos y porciones esperadas;
- sustituciones autorizadas;
- opción de registrar lo realmente consumido;
- diferencia esperado vs real.

Marcar “completado” no debe crear macros paralelos. Debe confirmar o generar entradas reales basadas en la prescripción y permitir ajustar cantidades.

### B. Objetivos flexibles de macros

Es la funcionalidad descrita por el coach del feedback.

El coach define:

- kcal;
- proteína;
- carbohidratos;
- grasas;
- opcionalmente fibra, sodio y distribución por comidas;
- lista de alimentos permitidos, recomendados o restringidos.

El alumno elige alimentos del catálogo y arma su día hasta acercarse a los objetivos.

La pantalla muestra:

- consumido;
- restante;
- porcentaje por macro;
- distribución por franjas;
- alimentos frecuentes/favoritos;
- alertas explícitas, no diagnósticos ni scores opacos.

### C. Plan híbrido

El coach fija “anclas” y deja un remanente flexible.

Ejemplos:

- desayuno y post-entreno prescritos;
- proteína mínima por comida;
- cena libre dentro del remanente;
- alimentos obligatorios o mínimos semanales.

El alumno registra todo en el mismo diario. EVA diferencia:

- anclas cumplidas;
- consumo flexible;
- remanente de macros.

### D. Intercambios

`exchanges` continúa como herramienta profesional para construir equivalencias y porciones. No debería sentirse como un producto separado para el alumno. Puede alimentar planes estructurados o híbridos.

---

## 5. Rework total del coach

## 5.1 Nueva arquitectura de navegación

La entrada de Nutrición del coach debe tener tres niveles claros.

### Nivel 1 — Centro de Nutrición

Secciones:

1. **Resumen**
   - alumnos que requieren atención;
   - cumplimiento de hoy/semana;
   - planes por vencer o pendientes de publicar;
   - registros nuevos;
   - códigos/productos por verificar.
2. **Alumnos**
   - roster con estado nutricional;
   - filtros por estrategia, adherencia, equipo y plan;
   - acceso a ficha individual.
3. **Biblioteca**
   - alimentos;
   - comidas guardadas;
   - recetas;
   - plantillas;
   - intercambios.

No debe existir un cockpit nuevo seguido inmediatamente del hub antiguo.

### Nivel 2 — Ficha nutricional del alumno

Tabs estables:

1. **Resumen**
   - objetivos vigentes;
   - consumo de hoy;
   - adherencia 7/30 días;
   - hábitos;
   - alertas y notas recientes.
2. **Plan**
   - versión activa;
   - estrategia;
   - fecha de vigencia;
   - historial de versiones;
   - CTA editar/publicar nueva versión.
3. **Diario**
   - línea temporal de consumo real;
   - fotos/notas si se habilitan;
   - comparación con prescripción;
   - edición profesional auditada.
4. **Progreso**
   - tendencias de kcal/macros;
   - cumplimiento por franja/ancla;
   - peso, medidas y hábitos relacionados;
   - exportación.
5. **Notas y protocolo**
   - notas privadas;
   - comentarios visibles al alumno;
   - suplementos, recomendaciones y documentos.

### Nivel 3 — Builder V2

El builder no debe ser el monolito actual con un sidebar y múltiples modos implícitos.

Flujo propuesto:

1. **Estrategia**
   - estructurado;
   - macros flexibles;
   - híbrido.
2. **Objetivos**
   - días de entrenamiento/descanso;
   - kcal/P/C/G;
   - micros/hábitos;
   - fechas de vigencia.
3. **Construcción**
   - comidas/anclas;
   - presupuestos de macros por franja;
   - alimentos, recetas o intercambios;
   - restricciones del alumno.
4. **Experiencia del alumno**
   - preview exacto web/RN;
   - qué puede cambiar;
   - qué puede registrar;
   - mensajes e instrucciones.
5. **Revisión**
   - macros prescritos vs suma del contenido;
   - conflictos con alergias/intolerancias;
   - alimentos sin verificar;
   - días incompletos.
6. **Publicación**
   - guardar borrador;
   - publicar versión;
   - fecha de inicio;
   - resumen de cambios;
   - notificar al alumno.

### Layout desktop

- izquierda: estructura/días/comidas;
- centro: canvas del plan;
- derecha: objetivos, auditoría y preview del alumno;
- footer fijo: estado de guardado, borrador y publicar.

### Layout móvil del coach

Stepper por pasos. No intentar comprimir el canvas desktop completo en una pantalla pequeña.

---

## 6. Rework total del alumno

## 6.1 Navegación

La pantalla Nutrición debe tener tres destinos principales:

1. **Hoy**
2. **Plan**
3. **Historial**

Herramientas secundarias —recetas, compras, equivalencias y notas— se abren desde accesos contextuales, no como una larga pila vertical.

## 6.2 Pantalla Hoy

Orden recomendado:

1. fecha y estado de sincronización;
2. macros consumidos/restantes;
3. CTA `Registrar alimento`;
4. timeline por desayuno/colaciones/almuerzo/cena;
5. anclas o comidas prescritas correspondientes;
6. recomendaciones del coach;
7. cierre/resumen del día.

Cada franja reúne en una sola tarjeta:

- prescripción esperada, si existe;
- alimentos realmente registrados;
- macros de la franja;
- añadir, copiar, editar o eliminar;
- estado de cumplimiento.

No deben coexistir por separado:

- resumen nuevo;
- anillos antiguos;
- ledger nuevo;
- comidas antiguas;
- off-plan logger antiguo.

## 6.3 Pantalla Plan

Debe explicar, no solo listar alimentos:

- objetivo;
- estrategia elegida;
- metas de día entrenamiento/descanso;
- reglas flexibles;
- comidas/anclas;
- equivalencias y cambios permitidos;
- protocolo y suplementos;
- versión y fecha de vigencia.

## 6.4 Pantalla Historial

- calendario/semanas;
- días registrados;
- macros objetivos y reales congelados por fecha;
- detalle de alimentos reales;
- plan/version vigente ese día;
- notas y satisfacción;
- cambios realizados por coach/alumno;
- comparación semanal y mensual.

El historial no debe depender de que la comida original siga existiendo.

---

## 7. Modelo de datos V2 aditivo

No se destruyen tablas actuales. Se crea una capa nueva y adaptadores de lectura.

### 7.1 Versionado

Propuesta:

- `nutrition_plan_versions`
  - plan lógico;
  - número de versión;
  - estrategia;
  - estado draft/published/superseded;
  - vigencia;
  - objetivos congelados;
  - autor y resumen de cambios.
- `nutrition_plan_version_meals`
  - comidas/anclas inmutables por versión.
- `nutrition_plan_version_items`
  - alimentos, recetas o grupos prescritos.
- `nutrition_plan_version_rules`
  - restricciones, remanente flexible y permisos del alumno.

Una publicación crea una nueva versión. No se edita destructivamente la versión usada por días históricos.

### 7.2 Consumo canónico

`nutrition_intake_entries` evoluciona como única fuente del consumo real:

- referencia opcional a la prescripción/version/item;
- franja;
- cantidad/unidad;
- snapshots nutricionales;
- origen search/barcode/recent/favorite/copy/prescription;
- actor que registró;
- timestamp y fecha local;
- estado activo/corregido/eliminado;
- vínculo de corrección para auditoría.

### 7.3 Snapshot diario

Cada día debe congelar:

- versión activa;
- objetivos del día;
- estrategia;
- variante entrenamiento/descanso;
- zona horaria;
- totales de adherencia derivados.

### 7.4 Adaptador legacy

- los 755 días y 2.436 meal logs existentes siguen visibles;
- si no existe intake V2, se deriva una vista histórica legacy;
- nuevas escrituras se hacen en V2;
- opcionalmente se migran días antiguos a snapshots, pero nunca se inventan alimentos reales que no fueron registrados.

---

## 8. Impacto en otras áreas de EVA

### Dashboard del alumno

Mostrar solo:

- macros restantes;
- próxima acción nutricional;
- agua/hábito relevante;
- CTA al diario.

No duplicar el tracker completo.

### Dashboard del coach

- alumnos que requieren revisión;
- registros recientes;
- cambios sin publicar;
- alertas de catálogo.

### Check-ins y progreso

Los pesos/medidas alimentan la evaluación, pero no cambian objetivos publicados automáticamente. El coach revisa y publica una versión nueva.

### Notificaciones

Eventos claros:

- plan publicado;
- recordatorio de registro;
- comentario del coach;
- meta diaria próxima/completada;
- producto escaneado pendiente de verificar.

### Teams/Enterprise

- autor y última edición visibles;
- bloqueo optimista/versionado para evitar sobrescrituras;
- permisos por rol;
- audit log de publicación y correcciones.

### PDF/exportación

Siempre exportar una versión publicada y fechada, no el estado mutable del builder.

---

## 9. Sistema visual de alimentos

La tabla ya tiene `product_image_path`, pero ninguna fila lo utiliza y la UI actual no presenta imágenes.

### Estrategia recomendada

#### Capa 1 — ilustraciones EVA

- set propio de ilustraciones bonitas, suaves y consistentes;
- categorías y alimentos frecuentes;
- SVG/WebP pequeños;
- fondos por categoría;
- fallback garantizado.

Ejemplos visuales:

- huevo sonriente/ilustración redondeada;
- pollo, arroz, palta, marraqueta, leche, yogur, frutas;
- estilo limpio, “cuchi”, no infantil ni clínico.

#### Capa 2 — foto de producto

Para alimentos envasados:

- imagen frontal verificada;
- miniatura 48–64 px en listas;
- imagen grande solo en detalle;
- procedencia, licencia y atribución persistidas.

#### Capa 3 — upload del coach/admin

- imagen opcional para alimento custom;
- revisión y compresión;
- no convertir cada alimento duplicado en un archivo nuevo.

### Modelo recomendado

Crear `food_media`:

- `food_id`;
- `kind`: `eva_illustration | product_photo | coach_upload`;
- `storage_path`;
- `source` y `source_url`;
- `license` y `attribution`;
- `verification_status`;
- `is_primary`;
- dimensiones/hash.

Crear bucket específico `food-media`; no mezclarlo con recetas, logos o check-ins.

### Performance

- thumbnails pre-generados;
- lazy loading;
- placeholder inmediato;
- cache larga con paths versionados;
- no descargar fotos grandes en buscadores o builders.

---

## 10. Barcode en PWA

Sí se puede usar la cámara en web responsive/PWA.

Implementación:

1. `navigator.mediaDevices.getUserMedia`;
2. cámara trasera con `facingMode: environment`;
3. `BarcodeDetector` cuando exista;
4. fallback `@zxing/browser` para compatibilidad;
5. detener tracks al cerrar/cambiar cámara;
6. entrada manual siempre disponible;
7. fallback opcional desde foto.

Requisitos:

- HTTPS;
- permiso explícito;
- estados de permiso denegado, sin cámara y lectura fallida;
- prueba real en Safari iOS, Chrome Android y PWA instalada.

La pantalla web actual que dice “solo entrada manual” debe reemplazarse.

---

## 11. De dónde obtener barcodes y productos

### Fuente primaria

El GTIN está impreso en el envase. El alumno lo escanea y EVA:

- busca localmente;
- si existe, abre el alimento;
- si no existe, crea un registro en la cola;
- permite captura manual de nombre, foto frontal y etiqueta nutricional;
- un coach/admin verifica y publica.

### Semilla de catálogo

Open Food Facts puede utilizarse como fuente de importación offline:

- descargar/exportar productos comercializados en Chile;
- guardar procedencia/licencia;
- importar a staging;
- validar GTIN, unidad y nutrientes;
- publicar solo filas aprobadas;
- copiar imágenes respetando licencia/atribución;
- nunca depender de una llamada externa en cada escaneo.

### Fuentes comerciales

- fabricantes y marcas;
- distribuidores;
- acuerdos con catálogos GS1/Verified by GS1;
- archivos entregados por clientes enterprise.

No hacer scraping silencioso de supermercados ni reutilizar fotos sin revisar términos/licencia.

---

## 12. Qué conservar, reemplazar y retirar

### Conservar

- RLS y scopes coach/team/org;
- motor compartido de macros;
- snapshots de intake;
- catálogo y cola de GTIN;
- restricciones/favoritos;
- recetas estructuradas;
- intercambios;
- hábitos, notas y compras como servicios;
- offline queue;
- históricos legacy.

### Reemplazar en frontend

- `NutritionShell` web;
- shell principal RN de nutrición;
- `PlanBuilder` monolítico;
- `NutritionHub` actual;
- combinación cockpit + hub;
- separación visual plan/off-plan;
- navegación vertical interminable del alumno.

### Retirar después de paridad

- componentes legacy que dupliquen Today/Plan/History;
- cálculo de consumo desde meal completion para días V2;
- CTAs redundantes;
- rutas antiguas sin uso, únicamente después de medir y redirigir.

No se borran tablas ni datos productivos durante esta fase.

---

## 13. Plan de implementación seguro

### Fase 0 — contrato del producto

- aprobar las tres estrategias;
- definir qué puede modificar el alumno;
- definir métricas de adherencia;
- cerrar wireframes coach/alumno.

### Fase 1 — dominio y read model V2

- plan/version/strategy;
- diario real canónico;
- adapters legacy;
- pruebas de invariantes e historial;
- feature flag `nutrition_v2`.

### Fase 2 — Alumno V2

- Today/Plan/History web;
- universal add sheet y cámara PWA;
- misma experiencia RN;
- imágenes/ilustraciones;
- offline y correcciones.

### Fase 3 — Coach V2

- nuevo centro de nutrición;
- ficha individual;
- builder wizard/canvas;
- preview del alumno;
- borrador/publicación/versiones.

### Fase 4 — Catálogo visual Chile

- bucket/media;
- set inicial de ilustraciones EVA;
- importación Open Food Facts a staging;
- curation y verificación;
- piloto de productos chilenos.

### Fase 5 — transición

- shadow-read: comparar V1/V2;
- piloto con coach y alumnos reales;
- activar V2 por usuario/team;
- telemetría de errores y conversión;
- retirar render legacy cuando exista paridad y aprobación.

---

## 14. Criterios de aceptación del rework total

El rework no se considera terminado hasta que:

1. no se rendericen simultáneamente bloques V2 y shells legacy;
2. el builder V2 permita estructurado, macros flexibles e híbrido;
3. el alumno tenga Today/Plan/History coherentes en web y RN;
4. cada consumo nuevo tenga una única fuente canónica;
5. el histórico anterior siga visible y no cambie;
6. exista preview del alumno antes de publicar;
7. cada cambio de plan publique una versión fechada;
8. PWA y RN escaneen GTIN con cámara;
9. alimentos tengan ilustración/foto/fallback consistente;
10. catálogo Chile tenga un lote piloto verificado;
11. coach/team/org mantengan aislamiento y auditoría;
12. CI, RLS tests, E2E y smoke tests físicos estén verdes.

---

## 15. Decisión inmediata

El PR #121 debe tratarse como **fundación técnica del rework**, no como cierre definitivo.

El siguiente trabajo no será añadir otra tarjeta al frontend anterior. Será:

1. diseñar contratos y wireframes V2;
2. crear plan versionado/estrategias y read model aditivo;
3. construir la pantalla Today V2 del alumno;
4. construir el Builder V2 del coach;
5. activar ambos detrás de feature flag;
6. retirar el render legacy solo tras validación.
