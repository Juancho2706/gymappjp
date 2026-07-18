# EVA Nutrición — rework sin IA y catálogo local Chile

**Rama de trabajo:** `Nuevascosasrnopenai`  
**Base:** `rnmobiledenuevo`  
**Estado:** contrato de producto y arquitectura. Ninguna migración de este lote se aplica automáticamente a producción.

## 1. Reglas no negociables

1. EVA Nutrición no depende de modelos de IA ni de APIs de IA.
2. Web desktop, web responsive/PWA y React Native comparten el mismo contrato visual, funcional y de datos.
3. El catálogo se consulta desde Supabase. La app no llama a Open Food Facts, USDA ni otros proveedores durante el uso normal.
4. Toda ampliación de Supabase es aditiva: columnas nullable o con defaults seguros, tablas nuevas, índices nuevos y políticas compatibles. No se renombran ni eliminan columnas/tablas existentes en este rework.
5. Las migraciones de esta rama se entregan para revisión y no se ejecutan contra producción sin aprobación explícita.
6. La experiencia Base sigue funcionando aunque el módulo profesional de Nutrición esté desactivado. El módulo Pro amplía el trabajo del nutricionista; no duplica el diario del alumno.

## 2. Objetivo de producto

EVA debe reemplazar el uso cotidiano de Fitia para los alumnos de los coaches que trabajan dentro de EVA. La ventaja de EVA no es copiar una app de conteo: es unir en un mismo lugar lo que el profesional prescribe y lo que la persona realmente consume.

La pantalla principal debe contestar rápidamente:

- qué estaba planificado;
- qué se consumió realmente;
- cuánto falta para el objetivo diario;
- qué puede registrar ahora;
- qué necesita revisar el coach o nutricionista.

## 3. Alcance Base

Disponible para cualquier alumno con el dominio Nutrición activo:

- resumen diario de calorías y macronutrientes;
- plan prescrito y comidas del día;
- registro de consumo real;
- búsqueda en catálogo local;
- alimentos recientes y favoritos;
- lectura de código de barras en React Native;
- búsqueda manual por EAN/GTIN en web/PWA/desktop;
- cantidades en gramos, mililitros y unidades;
- registro fuera del plan sin lenguaje culpabilizante;
- lista de compras;
- recetas compartidas por el coach;
- notas y conversación del día;
- funcionamiento offline para acciones críticas ya soportadas;
- historial y recap semanal.

## 4. Alcance Nutrición Pro

El módulo Pro se apoya en la misma base y añade herramientas profesionales:

- intercambios y equivalencias;
- objetivos por comida y por día;
- micronutrientes avanzados y umbrales personalizados;
- planificación por días de entrenamiento/descanso;
- variantes semanales de calorías y macros;
- recetas estructuradas con ingredientes del catálogo;
- análisis prescrito vs. consumido;
- alertas de adherencia configurables;
- restricciones, alergias, intolerancias y preferencias;
- notas privadas del profesional;
- panel de revisión por alumno;
- exportaciones y reportes profesionales.

No se bloquean detrás de Pro las funciones necesarias para registrar alimentos básicos. El valor Pro está en la prescripción, el análisis y las herramientas del nutricionista.

## 5. Catálogo chileno local

### 5.1 Fuente de datos

EVA mantendrá una copia local normalizada dentro de `public.foods`. Los productos pueden llegar mediante importaciones administrativas por lote desde fuentes públicas o archivos propios, pero el resultado final se guarda en Supabase.

Fuentes posibles de importación:

- datasets públicos de productos con presencia en Chile;
- archivos CSV revisados por EVA;
- productos creados por coaches o equipos;
- productos propuestos por alumnos y validados por un profesional.

### 5.2 Código de barras

El escáner no contiene información nutricional. Solo lee un identificador GTIN/EAN/UPC. EVA usa ese valor para buscar una fila local de `foods`.

Flujo:

1. RN lee el código con `expo-camera`.
2. Se normaliza y valida el checksum del GTIN.
3. Se busca `foods.barcode` en Supabase.
4. Si existe, se abre el selector de cantidad.
5. Si no existe, se permite búsqueda manual y se registra el código faltante para curación posterior; no se llama a una API externa en caliente.

En web/PWA/desktop se ofrece búsqueda manual por código. El escaneo de cámara en navegador puede agregarse como mejora progresiva, pero nunca es requisito para completar el flujo.

### 5.3 Imágenes

Las imágenes de productos y recetas se almacenan en Supabase Storage en tamaños derivados, no como imágenes originales gigantes. Las listas usan thumbnails; el detalle carga una versión mayor bajo demanda. Las URLs o paths se guardan en la base y se cachean con headers largos para contenido versionado.

## 6. Estrategia de rendimiento

- búsqueda con debounce y mínimo de caracteres;
- límite estricto y paginación/cursores;
- índice trigram sobre `foods.name_search` para búsquedas `%texto%`;
- índice parcial por `barcode`;
- resultados recientes/favoritos antes de búsquedas amplias;
- selección mínima de columnas;
- snapshots nutricionales en cada registro para evitar recalcular historia tras editar un alimento;
- una consulta diaria agregada en vez de una consulta por card;
- imágenes lazy y thumbnails;
- catálogo importado por lotes, nunca sincronizado por cada usuario;
- caché local RN para recientes, favoritos y últimos resultados;
- endpoints de servidor solo cuando agregan autorización, agregación o caché; las lecturas client-scoped simples continúan por PostgREST y RLS.

## 7. Contrato de paridad

Las tres superficies comparten:

- mismos nombres y orden de acciones;
- mismos estados: loading, vacío, error, offline, sin resultado, código desconocido y guardado;
- mismos tokens, radios, tamaños y jerarquía;
- mismo cálculo de macros mediante `@eva/nutrition-engine`;
- mismos View Models y validación de GTIN;
- mismo modelo Base/Pro.

Divergencias admitidas:

- RN usa cámara nativa para el escáner;
- web/PWA/desktop siempre ofrece entrada manual de código;
- sheets y diálogos usan primitivas apropiadas de cada plataforma manteniendo contenido y jerarquía.

## 8. Rollout seguro

1. Añadir utilidades puras y tests.
2. Añadir migración draft, sin aplicarla.
3. Integrar búsqueda/registro existente con nueva UI sin depender aún de columnas nuevas.
4. Revisar y aplicar migración en una ventana controlada.
5. Habilitar lookup por barcode con fallback seguro.
6. Importar un lote piloto chileno.
7. Medir búsquedas sin resultado y códigos desconocidos.
8. Expandir catálogo y activar análisis Pro.

## 9. Criterios de aceptación del primer lote

- Ningún flujo existente de planes, comidas, swaps o intercambios se rompe.
- La búsqueda por nombre existente sigue funcionando aun si la migración draft no se ha aplicado.
- Web y RN usan el mismo validador de GTIN.
- El escáner RN falla de forma recuperable cuando el código no existe.
- No hay llamadas externas por búsqueda ni por escaneo.
- Ningún cambio de producción se ejecuta desde esta rama.
