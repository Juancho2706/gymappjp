# EVA Nutrición V2 — Plan maestro de ejecución por tandas

**Fecha base:** 14 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**Base de revisión:** `rnmobiledenuevo`  
**Supabase productivo:** `constant` (`jikjeokundmaafuytdcx`)  
**PR:** #121 — debe permanecer draft hasta el cierre de todas las tandas  
**Documento previo obligatorio:** `docs/product/NUTRITION_TOTAL_REWORK_AUDIT_2026.md`

---

## 0. Propósito

Este documento convierte el rework total de Nutrición en un programa ejecutable por tandas, entendible por Juan, por un desarrollador humano y por cualquier agente de programación.

No es una lista de ideas. Cada tanda define:

- objetivo de producto;
- backend y modelo de datos;
- frontend web/PWA;
- React Native;
- UI, UX y contenido;
- white label, claro y oscuro;
- rendimiento y costo de Supabase/Vercel;
- seguridad y RLS;
- loaders, skeletons, estados vacíos y errores;
- animaciones y accesibilidad;
- pruebas y criterios de salida.

La regla principal es que **una tanda no se considera terminada solo porque compile**. Debe pasar sus criterios funcionales, visuales, de rendimiento, seguridad y paridad.

---

# 1. Principios no negociables

## 1.1 Producción y datos

1. Supabase es productivo y lo utilizan coaches y alumnos reales.
2. Todo cambio de base de datos debe ser aditivo, reversible y versionado.
3. No se eliminan ni renombran tablas, columnas, policies, funciones o buckets legacy durante el desarrollo de V2.
4. No se reescribe el historial antiguo para aparentar datos que nunca se registraron.
5. Toda migración se escribe primero en el repositorio, se revisa, se prueba transaccionalmente y luego se aplica.
6. Las nuevas superficies deben vivir detrás de una bandera `nutrition_v2` hasta completar la paridad.
7. V1 continúa como fallback hasta el rollout final.

## 1.2 Producto

1. Prescripción y consumo real son conceptos distintos.
2. El consumo nuevo tendrá una única fuente canónica.
3. Nutrición debe soportar tres estrategias visibles:
   - plan estructurado;
   - objetivos flexibles de macros;
   - plan híbrido.
4. Intercambios es una herramienta profesional dentro de una estrategia, no una aplicación separada.
5. Base no será una versión rota de Pro. Base permite cumplir y registrar; Pro añade capacidad clínica/profesional.
6. Ninguna funcionalidad requiere IA generativa ni pagos por tokens.
7. No se hacen llamadas a APIs externas por cada búsqueda o escaneo.

## 1.3 Plataformas

1. Web desktop, web responsive/PWA y React Native comparten dominio, vocabulario, cálculos y estados.
2. Paridad no significa copiar literalmente un layout desktop en móvil.
3. Cada plataforma puede usar el patrón nativo adecuado, manteniendo idéntico significado y resultado.
4. El flujo principal del alumno tendrá `Hoy`, `Plan` e `Historial` en web y RN.
5. El coach tendrá Centro de Nutrición, ficha nutricional por alumno y Builder V2.

## 1.4 Calidad

1. No se añade una pantalla V2 seguida del shell V1.
2. No se duplica lógica de macros, permisos, temas o validaciones.
3. Todo flujo tiene loading, skeleton, vacío, error, offline y permiso denegado.
4. Toda interacción importante tiene feedback visual, accesible y reversible cuando corresponda.
5. `prefers-reduced-motion` y `AccessibilityInfo.isReduceMotionEnabled()` se respetan.
6. Contraste, teclado, lector de pantalla y targets táctiles forman parte del Definition of Done.

---

# 2. Línea base técnica auditada

## 2.1 Stack web actual

- Next.js `^16.2.9` con App Router.
- React `19.1.0`.
- Tailwind CSS 4.
- Base UI, Radix y componentes propios.
- Framer Motion `^12.38.0`.
- `@lottiefiles/react-lottie-player` `^3.6.0`.
- TanStack Virtual.
- Recharts.
- Sentry Next.js.
- PostHog.
- Vercel Analytics y Speed Insights.
- Vitest y Playwright.
- React Compiler habilitado.
- `optimizePackageImports` ya configurado para paquetes pesados.

### Acción de higiene

Antes de construir V2 se debe ejecutar una tanda de compatibilidad para alinear los patches de Next/React/ESLint/Sentry sin mezclar esa actualización con el rework funcional. La documentación oficial de Next mostraba 16.2.10 como patch actual al momento de esta auditoría; cualquier upgrade debe pasar CI y preview por separado.

## 2.2 Stack React Native actual

- Expo SDK 54.
- React Native 0.81.5.
- Expo Router 6.
- Reanimated 4.1.1.
- Gesture Handler 2.28.
- Moti 0.30.
- React Native Skia 2.2.
- FlashList 2.3.2.
- Expo Image 3.0.11.
- Expo Camera 17.
- Expo Haptics.
- `react-native-fast-confetti`.
- Sentry React Native.
- NativeWind 4.

Este stack ya cubre la mayoría de las necesidades. La prioridad es usarlo bien antes de instalar más dependencias.

## 2.3 White label actual

Existe un motor compartido `@eva/brand-kit` que:

- deriva temas claro/oscuro en OKLCH;
- protege contraste WCAG;
- genera la rampa `sport` y tokens de CTA/foco;
- funciona en web y RN;
- distingue tokens de marca y tokens de sistema.

También existe `pnpm check:tokens`, que compara la paridad web/RN en claro y oscuro.

**Decisión:** Nutrición V2 extiende este contrato. No crea un segundo ThemeProvider, otra tabla de colores ni otro generador de paletas.

## 2.4 Cámara PWA

`apps/web/next.config.ts` aplica actualmente:

```txt
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Esto bloquea la cámara incluso si se implementa el lector.

**Decisión:** mantener cámara bloqueada por defecto y habilitarla únicamente en la ruta/componente de escaneo mediante una política restringida a `self`, conservando entrada manual como fallback.

## 2.5 Supabase actual

### Datos de Nutrición

- 115 planes.
- 33 plantillas.
- 486 comidas.
- 755 días históricos.
- 2.436 meal logs.
- 2 entradas del diario V2.
- 344 alimentos.
- 0 alimentos Chile.
- 0 barcodes.
- 0 alimentos verificados.
- 0 imágenes de alimentos utilizadas.

### Tamaño

Las tablas de nutrición todavía son pequeñas; ninguna de las auditadas supera 1 MB. La prioridad no es aumentar compute ni particionar prematuramente.

### Patrón de uso

`pg_stat_statements` muestra miles de ejecuciones repetidas sobre:

- plan activo;
- comidas con embeds profundos;
- logs diarios;
- adherencia;
- board del coach.

Varias consultas individuales tienen medias razonables, pero el fan-out y la repetición multiplican el costo y la latencia percibida.

### Conexiones

En la muestra había 21 conexiones PostgREST idle. No se cambiará el pool por una captura puntual; primero se medirá el peak real y se crearán presupuestos de consultas.

### Storage

Estado aproximado auditado:

- `exercise-animations`: 77 MB;
- `checkins`: 68 MB;
- `exercise-media`: 34 MB;
- `logos`: ~7,5 MB;
- el resto es menor.

Food media debe tener bucket, transformaciones y presupuesto propios para no disparar almacenamiento ni egress.

---

# 3. Arquitectura objetivo

## 3.1 Capas

```txt
UI web / UI RN
  ↓
View models compartidos y contratos Zod
  ↓
Application services / Server Actions / RPCs
  ↓
Read models compactos + repositories
  ↓
Supabase Postgres + Storage + RLS
```

## 3.2 Escritura

- Server Actions para mutaciones web autenticadas.
- Funciones/RPC transaccionales para publicar planes y operaciones multi-tabla.
- RN escribe mediante una capa de repositorio tipada y colas offline donde aplique.
- Todas las escrituras llevan actor, timestamps, scope y estado de auditoría.
- No se hace dual-write silencioso V1/V2 sin una prueba explícita de idempotencia.

## 3.3 Lectura

Se crean read models específicos, no árboles PostgREST gigantes reutilizados para todo.

Ejemplos:

- `get_student_nutrition_today_v2(client_id, local_date)`;
- `get_student_nutrition_plan_v2(client_id)`;
- `get_student_nutrition_history_v2(client_id, cursor)`;
- `get_coach_nutrition_hub_v2(scope, filters)`;
- `get_coach_client_nutrition_v2(client_id, range)`;
- `search_food_catalog_v2(scope, query, cursor)`.

Cada read model devuelve solo los campos necesarios para esa pantalla.

## 3.4 Caché

### Web

- Request memoization para llamadas repetidas dentro del mismo render.
- Cache/tag únicamente para contenido seguro de compartir:
  - catálogo global;
  - ilustraciones;
  - categorías;
  - presets.
- Datos personales usan caché privada o no compartida.
- Invalidación por etiquetas concretas:
  - plan/version;
  - diario/fecha;
  - biblioteca;
  - alumno/coach.
- Streaming con `loading.tsx` y Suspense granular.

### RN

- cache local del plan publicado y últimos días;
- stale-while-revalidate visual;
- cola offline para intake/correcciones;
- reconciliación idempotente al recuperar conexión;
- no bloquear la pantalla completa por datasets secundarios.

## 3.5 Feature flag

`nutrition_v2` se resuelve server-side y en la configuración móvil.

Niveles:

- off;
- internal;
- coach allowlist;
- team allowlist;
- porcentaje/canary;
- on.

La bandera elige una superficie completa. No debe producir una pantalla híbrida V1+V2.

---

# 4. Presupuestos de rendimiento y recursos

Los presupuestos se validan en dispositivo y preview; no son promesas abstractas.

## 4.1 Web/PWA

Objetivos iniciales:

- LCP p75 móvil ≤ 2,5 s en rutas V2.
- INP p75 ≤ 200 ms.
- CLS ≤ 0,1.
- navegación entre tabs V2 con feedback visual inmediato.
- JavaScript inicial de Nutrición sin cargar builder, charts o animaciones que no se ven.
- imágenes de listas ≤ 20–35 KB por miniatura cuando sea posible.
- ninguna foto grande se descarga en un listado.

Reglas:

- Server Components por defecto.
- `'use client'` al nivel más bajo posible.
- imports dinámicos para scanner, charts, Rive/Lottie y Builder avanzado.
- `next/image` o transformación de Supabase Storage para fotos.
- skeleton con dimensiones finales para evitar CLS.
- no usar un loader full-screen para refetches parciales.

## 4.2 React Native

Objetivos iniciales:

- primera interacción útil sin esperar recetas, compras o analytics.
- scroll estable a 60 fps en dispositivos medios; 120 fps donde el hardware lo permita.
- cero listas grandes con `ScrollView.map`.
- FlashList para alimentos, historial, alumnos y recetas.
- Expo Image con `memory-disk`, placeholder y transición corta.
- animaciones continuas fuera de pantalla se pausan.
- assets celebratorios se cargan bajo demanda.

## 4.3 Supabase

Presupuesto por acción:

### Alumno — abrir Hoy

- meta: 1 read model principal;
- máximo inicial aceptable: 2 requests críticos;
- secundarios diferidos: recetas, compras, notas antiguas.

### Alumno — registrar alimento

- 1 búsqueda paginada/debounced;
- 1 escritura transaccional;
- 0 refetch completo del plan;
- parche optimista y reconciliación del resumen.

### Coach — abrir Centro

- 1 read model del resumen;
- 1 request paginado del roster cuando se abre;
- bibliotecas no se precargan.

### Builder

- carga inicial: plan/version + catálogos mínimos;
- búsqueda de alimentos bajo demanda;
- autosave de borrador con debounce y payload delta;
- publicación en una transacción.

Reglas globales:

- `select` explícito, nunca `*` en nuevas queries de producto.
- paginación por cursor para feeds/historial.
- mínimo 2 caracteres para búsqueda textual.
- debounce 250–350 ms.
- índices compuestos/partial alineados con filtros reales.
- `EXPLAIN (ANALYZE, BUFFERS)` antes y después de cada índice importante.
- evitar sobre-indexar: cada índice debe justificar lecturas frente al costo de escritura.
- revisar `pg_stat_statements` por tanda.
- no habilitar Realtime para Nutrición completa; solo para un caso validado.
- no cambiar Supavisor/pool sin métricas de peak.

## 4.4 Storage y egress

- bucket `food-media` separado.
- paths inmutables/versionados.
- WebP/AVIF donde la plataforma lo soporte.
- thumbnails 64/128/256 px.
- original solo en detalle/admin.
- Cache-Control largo para assets versionados.
- evitar signed URLs regeneradas en cada fila cuando el asset pueda ser público/verificado.
- medición mensual de egress por bucket.
- ilustraciones EVA empaquetadas o servidas por CDN con versionado.

---

# 5. Política visual: sistema, dominio y white label

## 5.1 Tokens white label

Pueden cambiar según coach/team/org:

- logo;
- nombre de marca;
- fuente display aprobada;
- `sport-100..700`;
- CTA primario;
- foco;
- navegación activa;
- links y selección;
- loader/splash permitido;
- detalles de celebración secundarios.

## 5.2 Tokens fijos del sistema

No se recolorean arbitrariamente:

- surfaces y textos semánticos;
- success, warning, danger, info;
- colores de proteína/carbohidratos/grasas;
- `ember` como identidad del dominio Nutrición;
- estados de verificación del catálogo;
- alergia/intolerancia/restricción;
- colores semánticos de gráficos.

Razón: un color de marca rojo no puede convertir “éxito”, “proteína” o “peligro” en el mismo significado visual.

## 5.3 Uso mixto

- CTA principal: marca.
- Badge/heading de dominio: Ember.
- Progreso de macros: colores macro del sistema.
- Borde de selección: marca.
- Estado correcto/error: success/danger.
- Celebración: personaje/asset EVA neutro con partículas que pueden tomar el color de marca.

## 5.4 Claro y oscuro

Cada componente se aprueba en:

- EVA claro;
- EVA oscuro;
- white label claro con color claro;
- white label oscuro con color oscuro/saturado;
- alto contraste de texto, iconos, focus y gráficas.

No se aprueba un componente revisando solo el tema del desarrollador.

## 5.5 Responsive

### Alumno

- móvil: flujo de una columna y bottom sheets;
- tablet: dos columnas selectivas;
- desktop: Today con timeline + panel de resumen, sin estirar tarjetas a todo el ancho.

### Coach

- móvil: stepper y sheets;
- tablet: master-detail;
- desktop: navegación lateral, canvas y panel inspector.

Los breakpoints obedecen contenido, no modelos específicos de teléfono.

---

# 6. Sistema de estados de carga

## 6.1 Regla

El loader debe comunicar qué está ocurriendo sin bloquear más de lo necesario.

## 6.2 Tipos

### Arranque de aplicación

- loader EVA/white label existente;
- solo para boot/auth/theme inicial;
- respeta reduced motion.

### Navegación de ruta web

- `loading.tsx` por segmento;
- skeleton estructural prefetched;
- headers/layout permanecen interactivos.

### Carga inicial de pantalla RN

- shell inmediato;
- skeletons de métricas y cards;
- no pantalla vacía con spinner salvo boot.

### Refetch

- mantener contenido viejo;
- indicador discreto o shimmer local;
- nunca reemplazar toda la pantalla.

### Acción

- estado en el botón/fila afectada;
- optimistic UI cuando sea seguro;
- rollback y toast accesible al fallar.

## 6.3 Skeletons

Cada skeleton debe:

- conservar dimensiones finales;
- usar tokens de superficie;
- verse bien en claro/oscuro;
- no usar el color del coach como shimmer dominante;
- desactivar o simplificar animación con reduced motion;
- tener una variante compacta RN y una web.

---

# 7. Movimiento, feedback y gamificación

## 7.1 Objetivo

Crear una experiencia motivadora tipo Duolingo sin convertir una herramienta de salud en un videojuego invasivo ni castigar al alumno.

## 7.2 Jerarquía de movimiento

### Nivel 1 — microinteracciones

Herramientas existentes:

- web: CSS + Framer Motion;
- RN: Reanimated + Moti + Gesture Handler;
- haptics en RN.

Casos:

- botón presionado;
- alimento añadido;
- cambio de cantidad;
- macro actualizado;
- tab/sheet;
- guardado de borrador;
- publicación confirmada.

Duración orientativa: 120–300 ms.

### Nivel 2 — progreso

Herramientas:

- RN Skia/Reanimated;
- SVG/Framer Motion web.

Casos:

- anillos de macros;
- barras de remanente;
- cierre de franja;
- evolución semanal;
- transición de plan publicado.

### Nivel 3 — celebración

Casos limitados:

- primera comida registrada;
- día completado;
- 7 días de registro;
- primera semana cumpliendo proteína;
- coach publica el primer plan;
- coach revisa todos los pendientes.

No celebrar:

- simplemente abrir una pantalla;
- alcanzar una meta clínica sensible;
- superar calorías;
- acciones repetibles que permitan spam.

## 7.3 Rive vs Lottie

### Reanimated/Moti/Skia

**Elección base.** Ya están instalados y deben cubrir el 80–90% del movimiento funcional.

### Lottie

Candidato estable para celebraciones cerradas y loaders ilustrados. `lottie-react-native` reportaba release 7.3.8 en mayo de 2026. EVA web ya tiene un player Lottie, pero la integración debe unificarse y auditar peso/licencia de cada asset.

### Rive

Candidato para una mascota o estados interactivos. El runtime React Native tiene una nueva implementación basada en Nitro y el repositorio indica que la migración todavía está en progreso; la versión legacy reportaba 9.8.3 en abril de 2026.

**Decisión:** hacer un spike aislado Rive vs Lottie antes de adoptar. Medir:

- peso de app/bundle;
- tiempo de primer frame;
- CPU/GPU;
- memoria;
- comportamiento offline;
- dark mode;
- tint white label;
- reduced motion;
- Android medio e iPhone real.

No instalar ambos en producción sin una decisión posterior al spike.

## 7.4 Reglas de motion

- una animación tiene propósito: orientación, causa/efecto, feedback o celebración;
- no animar todas las cards al hacer scroll;
- no bloquear input esperando una animación;
- no reproducir loop infinito en pantalla principal;
- máximo una celebración dominante por evento;
- fallback estático siempre disponible;
- haptic suave para éxito, advertencia diferenciada y nunca vibración excesiva.

---

# 8. Librerías y repositorios investigados

## 8.1 Conservar y estandarizar

| Necesidad | Elección | Estado en EVA | Uso |
|---|---|---:|---|
| Animación web | Framer Motion | instalado | transiciones, layout, sheets y feedback |
| Animación RN | Reanimated 4 | instalado | interacción de alto rendimiento y layout |
| Abstracción RN | Moti | instalado | entradas/salidas simples y skeletons |
| Canvas RN | Skia | instalado | progreso y visualizaciones especiales |
| Listas RN | FlashList 2 | instalado | catálogos, roster, historial y recetas |
| Imágenes RN | Expo Image | instalado | caché, placeholders y transición |
| Gestos | RNGH | instalado | sheets, swipe y reorder |
| Monitoreo RN | Sentry | instalado | crashes y performance |
| Monitoreo web | Sentry/Vercel/PostHog | instalado | errores, web vitals y funnel |
| Pruebas web | Vitest/Playwright | instalado | unidad, integración y E2E |
| Cálculo | `@eva/nutrition-engine` | instalado | fuente única web/RN |

FlashList v2 está orientado a la nueva arquitectura de RN y su documentación fue actualizada el 8 de julio de 2026. Expo Image ofrece caché de memoria/disco, BlurHash/ThumbHash y transiciones; se utilizará la versión compatible con el SDK actual, no la “latest” de forma ciega.

## 8.2 Añadir con aprobación

### `@zxing/browser`

Uso: fallback del scanner PWA cuando `BarcodeDetector` no esté disponible.

El repositorio soporta webcam/video/imagen y reportaba release 0.2.1 el 6 de julio de 2026.

Condiciones:

- import dinámico solo al abrir el scanner;
- limitar formatos a EAN-8/EAN-13/UPC/ITF relevantes;
- detener cámara y decoder al cerrar;
- no cargar en el bundle inicial de Nutrición.

## 8.3 Spike, no adopción automática

- Rive React Native/web.
- Lottie React Native/dotLottie.

## 8.4 Evitar inicialmente

- otro state manager global para Nutrición;
- React Query/SWR en toda la app sin demostrar necesidad;
- otra librería de charts RN para visuales que Skia/Victory ya cubren;
- una biblioteca completa de gamificación;
- SDK comercial de barcode antes de medir ZXing/BarcodeDetector/Expo Camera;
- APIs de alimentos en runtime;
- imágenes remotas sin licencia/procedencia;
- paquetes que dupliquen design tokens o themes.

---

# 9. Protocolo obligatorio para agentes/desarrolladores

Antes de trabajar una tanda:

1. leer este plan y la auditoría integral;
2. revisar el HEAD y PR #121;
3. identificar archivos V1 y V2 involucrados;
4. escribir un mini-scope de la tanda;
5. verificar esquema productivo real;
6. listar riesgos y rollback;
7. no implementar trabajo de una tanda futura “de paso”.

Durante la tanda:

- commits pequeños y semánticos;
- no escribir el mismo archivo concurrentemente desde varios agentes;
- tipos compartidos antes que `any`;
- una sola función canónica por cálculo;
- no hardcodear colores fuera de tokens aprobados;
- no ejecutar DDL destructivo;
- no aplicar migración sin prueba;
- no hacer merge ni promover a producción.

Al cerrar:

- lint;
- typecheck web y RN;
- tests del motor;
- pruebas RLS;
- token parity;
- Playwright de los flujos tocados;
- preview Vercel;
- captura claro/oscuro y mobile/desktop;
- medición de requests y payload;
- actualizar documentación de la tanda;
- registrar pendientes reales, no declararla terminada prematuramente.

---

# 10. Tandas de ejecución

---

## Tanda 0 — Baseline, contratos de calidad y guardrails

### Objetivo

Congelar una línea base medible y preparar el proyecto para desarrollar V2 sin regresiones invisibles.

### Backend/Supabase

- capturar baseline de `pg_stat_statements` para Nutrición;
- guardar tamaños, índices, conexiones y advisors;
- inventariar RLS de todas las tablas relacionadas;
- crear tests pgTAP o SQL transaccionales para scopes coach/team/alumno;
- definir consultas objetivo y presupuestos de requests.

### Frontend

- inventario de rutas/componentes V1 y V2;
- detectar client components grandes;
- analizar bundle de rutas de Nutrición;
- documentar loaders/skeletons existentes;
- revisar patches de Next/React/Expo en un cambio aislado.

### UI/UX

- capturas baseline de todas las superficies;
- mapa de estados y accesibilidad;
- lista de inconsistencias de vocabulario.

### Seguridad

- confirmar que service role no aparece en clientes;
- revisar funciones security definer y execute grants;
- revisar headers/CSP/Permissions Policy;
- documentar excepción futura de cámara.

### Salida

- reporte baseline versionado;
- budgets aprobados;
- CI con checks V2 vacíos pero preparados;
- cero cambio funcional para usuarios.

---

## Tanda 1 — Contrato de producto, IA y wireframes completos

### Objetivo

Definir exactamente qué construye el coach y qué ve/registra el alumno antes de tocar el modelo V2.

### Entregables

- contrato estructurado;
- contrato macros flexibles;
- contrato híbrido;
- permisos editables del alumno;
- definición de adherencia para cada estrategia;
- mapa Today/Plan/History;
- mapa Centro/Alumno/Builder;
- wireframes móvil, tablet y desktop;
- preview del alumno dentro del builder;
- inventario de tooltips y microcopy.

### UX

Cada control complejo debe responder:

- qué hace;
- a quién afecta;
- cuándo se publica;
- qué cambia en el historial;
- cómo deshacerlo.

Tooltips solo para ayuda secundaria. Las decisiones críticas deben explicarse en la interfaz, no esconderse en un tooltip.

### Salida

- wireframes aprobados;
- glosario único;
- no queda ninguna decisión estructural delegada al desarrollador durante el coding.

---

## Tanda 2 — Design System de Nutrición V2

### Objetivo

Crear componentes y patrones visuales antes de montar pantallas completas.

### Componentes

- NutritionPageShell;
- NutritionHeader/Toolbar;
- StrategyBadge;
- MacroBudget;
- MacroProgress;
- MealTimeline;
- MealSlotCard;
- FoodRow/FoodCard;
- FoodThumbnail/Fallback;
- PlanVersionBadge;
- Sync/OfflineState;
- Empty/Error/PermissionState;
- Skeleton family;
- CoachAttentionCard;
- BuilderStep/Inspector/Preview;
- responsive data table/card adapter.

### White label

- usar contrato de tokens actual;
- extender `check:tokens` si aparecen tokens nuevos;
- documentar marca/sistema/dominio;
- probar cuatro combinaciones de tema.

### Motion

- motion tokens: duration, easing, spring y reduced-motion;
- catálogo de microinteracciones;
- no instalar Rive/Lottie todavía.

### Pruebas

- tests de contraste;
- visual snapshots Playwright;
- keyboard/tab order;
- tamaños táctiles;
- parity screenshots web/RN de componentes equivalentes.

### Salida

- kit V2 reutilizable;
- ningún hardcode visual de pantalla;
- skeletons y estados disponibles antes de construir páginas.

---

## Tanda 3 — Dominio V2, versiones y consumo canónico

### Objetivo

Crear el modelo aditivo que permite publicar planes sin destruir historia y registrar consumo una sola vez.

### Backend

- plan lógico y versiones;
- estrategia y estado draft/published/superseded;
- meals/items/rules versionados;
- objetivos por día/variante;
- snapshot diario;
- evolución de intake con actor, source y correction chain;
- adaptador de lectura legacy;
- RPC transaccional de publicación;
- idempotency keys para acciones móviles/offline;
- audit log.

### Seguridad

- RLS por alumno, coach, team y org;
- `USING` + `WITH CHECK` en updates;
- functions con search_path fijo;
- grants explícitos;
- pruebas negativas BOLA/IDOR;
- coach no puede publicar en alumno fuera de scope;
- alumno no puede cambiar objetivos/versiones.

### Rendimiento

- índices solo para queries diseñadas;
- explain plans;
- no duplicar JSON grande en todas las filas;
- snapshot inmutable y compacto.

### Salida

- migrations en repo y aplicadas de forma aditiva;
- pruebas con rollback;
- V1 intacto;
- read adapter devuelve historia antigua y V2.

---

## Tanda 4 — Read models, caché, offline y observabilidad

### Objetivo

Construir la capa rápida que alimentará las nuevas pantallas.

### Backend

- RPC/read models Today/Plan/History/CoachHub/ClientDetail;
- paginación cursor;
- búsqueda catálogo optimizada;
- respuestas tipadas y versionadas;
- cache tags web;
- logs estructurados con duración/payload/error;
- eventos PostHog sin datos sensibles.

### RN

- repositorios tipados;
- cache local versionada;
- offline queue de intake/corrección;
- conflict strategy;
- background refresh moderado;
- cancelación de requests al desmontar.

### Métricas

- request count por pantalla;
- payload bytes;
- p50/p95 query;
- hit/miss de caché;
- tiempo hasta contenido útil;
- error rate y offline replay.

### Salida

- pantallas dummy consumen read models reales;
- budgets cumplidos antes del trabajo visual completo.

---

## Tanda 5 — Catálogo visual, alimentos e identificación

### Objetivo

Crear una biblioteca rápida, bonita y verificable para coach y alumno.

### Backend

- `food_media` y bucket `food-media`;
- thumbnails/versionado/licencia;
- staging de importación Chile;
- verificación y curation;
- alias de búsqueda;
- GTIN local;
- cola de faltantes;
- deduplicación por catalog key/GTIN.

### Visual

- set inicial de ilustraciones EVA “cuchi” y coherentes;
- fallback por categoría;
- foto real para producto verificado;
- badge de fuente/verificación en vista profesional;
- no saturar la lista con metadatos clínicos.

### PWA scanner

- excepción restringida de Permissions Policy;
- `getUserMedia` con cámara trasera;
- BarcodeDetector si existe;
- `@zxing/browser` importado dinámicamente como fallback;
- linterna cuando sea soportada;
- manual y foto como fallback;
- cleanup de MediaStream.

### RN scanner

- Expo Camera;
- limitar symbologies;
- debounce de detección;
- feedback haptic;
- mismo resultado de catálogo/cola que PWA.

### Rendimiento

- FlashList/virtualización;
- búsqueda paginada;
- Expo Image cache;
- `next/image` y transformaciones;
- miniaturas, no originales.

### Salida

- búsqueda y escaneo equivalentes web/RN;
- imágenes/fallback consistentes;
- lote piloto Chile verificable;
- egress medido.

---

## Tanda 6 — Alumno V2: Hoy

### Objetivo

Entregar la superficie diaria canónica sin renderizar NutritionShell V1.

### Funcional

- objetivos consumidos/restantes;
- timeline por franja;
- prescripción dentro de la franja;
- consumo real dentro de la misma franja;
- añadir/editar/copiar/eliminar;
- confirmar “comí lo indicado” creando intake real;
- flexible e híbrido;
- notas/recomendaciones relevantes;
- cierre del día.

### UI/UX

- CTA principal visible;
- una jerarquía numérica clara;
- no mostrar simultáneamente cinco resúmenes de macros;
- estados optimistas;
- swipe/sheet solo si es descubrible;
- desktop con timeline + resumen lateral;
- móvil con una columna.

### Loading/offline

- shell inmediato;
- skeleton de resumen y franjas;
- cache del último día;
- badge offline;
- replay de operaciones.

### Animación

- macro progress suave;
- alimento entra en la franja;
- haptic;
- celebración limitada al primer registro/cierre.

### Salida

- feature flag muestra Today V2 completo;
- V1 no se monta en esa variante;
- consumo nuevo proviene solo de intake;
- E2E web + pruebas RN.

---

## Tanda 7 — Alumno V2: Plan e Historial

### Objetivo

Completar comprensión del plan y continuidad histórica.

### Plan

- estrategia;
- objetivo;
- versión/vigencia;
- entrenamiento/descanso;
- reglas flexibles;
- comidas/anclas;
- swaps/intercambios;
- protocolo y suplementos;
- recetas/compras contextuales.

### Historial

- calendario y semanas;
- macros reales/objetivo congelados;
- detalle de alimentos;
- plan vigente ese día;
- legacy adapter;
- correcciones y actor;
- tendencias semanales/mensuales.

### Rendimiento

- cursor pagination;
- no precargar detalle de todos los días;
- charts lazy;
- agregados server-side.

### Salida

- Today/Plan/History completos web/RN;
- 755 días legacy siguen visibles sin mutación;
- navegación y deep links estables.

---

## Tanda 8 — Coach V2: Centro y ficha nutricional

### Objetivo

Reemplazar cockpit + NutritionHub por una arquitectura única.

### Centro

- resumen;
- alumnos;
- biblioteca;
- filtros persistentes;
- atención priorizada y explicada;
- drafts/cambios pendientes;
- catálogo por verificar.

### Ficha

- Resumen;
- Plan;
- Diario;
- Progreso;
- Notas y protocolo.

### UI

- desktop master-detail;
- tablet adaptable;
- móvil cards y navegación por tabs;
- tablas virtualizadas/paginadas;
- acciones masivas seguras.

### Seguridad

- scope visible en UI;
- actor/última edición;
- no mostrar datos fuera de team/org;
- acciones sensibles confirmadas y auditadas.

### Salida

- Centro V2 reemplaza las dos capas antiguas bajo flag;
- coach entiende estado de un alumno sin recorrer múltiples rutas;
- budgets de requests cumplidos.

---

## Tanda 9 — Builder V2

### Objetivo

Reemplazar el PlanBuilder monolítico por un flujo publicable, versionado y previsualizable.

### Pasos

1. estrategia;
2. objetivos;
3. construcción;
4. experiencia/permisos del alumno;
5. revisión;
6. publicación.

### Backend

- draft version;
- autosave delta;
- optimistic concurrency/version number;
- publicación transaccional;
- resumen de cambios;
- notificación;
- rollback a versión anterior mediante nueva publicación, no mutación histórica.

### Frontend

- desktop: outline/canvas/inspector/preview;
- móvil: stepper;
- drag/reorder accesible con alternativa por botones;
- command/search drawer;
- recetas, alimentos, grupos e intercambios como bloques coherentes;
- conflict checker.

### UX

- preview exacto del alumno;
- diferencia objetivo vs contenido;
- alergias y restricciones prominentes;
- alimentos no verificados;
- estado guardando/guardado/error;
- salir con cambios sin publicar.

### Salida

- tres estrategias completas;
- publicación crea versión fechada;
- preview web/RN;
- PlanBuilder V1 deja de renderizarse bajo flag.

---

## Tanda 10 — Gamificación y motion avanzado

### Objetivo

Añadir delight después de estabilizar datos y flujos.

### Trabajo

- definir eventos celebrables;
- diseñar assets;
- spike Rive vs Lottie;
- implementar una sola tecnología de asset;
- estado reduced motion;
- white-label tint controlado;
- analytics de completitud, no adicción;
- evitar shame/streak punishment.

### Salida

- motion budget aprobado;
- no regresión de batería, memoria o FPS;
- animaciones útiles y no invasivas.

---

## Tanda 11 — Hardening integral

### Seguridad

- RLS/advisors;
- dependency audit;
- scanner permissions;
- upload validation;
- MIME/size/hash;
- rate limiting;
- idempotency;
- audit logs;
- privacidad analytics;
- export/PDF autorizado.

### Rendimiento

- Web Vitals;
- bundle analysis;
- React profiler;
- RN FPS/memory;
- Sentry traces;
- pg_stat_statements;
- EXPLAIN;
- storage/egress;
- low-end devices/network throttling.

### Accesibilidad

- teclado;
- screen reader;
- contraste;
- reduced motion;
- dynamic text RN;
- orientation/tablet;
- targets táctiles;
- mensajes no dependientes de color.

### Calidad

- unit/integration/E2E;
- visual regression;
- offline/reconnect;
- DST/timezone Santiago;
- concurrent coach/team edits;
- version publishing;
- barcode conocido/desconocido;
- light/dark/white label.

### Salida

- todos los gates verdes;
- runbook de incidentes y rollback;
- no blocker conocido oculto.

---

## Tanda 12 — Canary, transición y retiro V1

### Objetivo

Activar V2 sin arriesgar a todos los usuarios.

### Secuencia

1. equipo interno;
2. cuenta demo;
3. un coach allowlist;
4. alumnos seleccionados;
5. team piloto;
6. porcentaje creciente;
7. default V2 con fallback;
8. retirar render V1;
9. limpiar rutas/componentes solo después de estabilidad.

### Observación

- errores;
- latencia;
- requests;
- registros completados;
- abandonos del flujo;
- tickets/feedback;
- diferencias V1/V2 en shadow-read;
- costo Supabase/Vercel/Storage.

### Salida final

- V2 default;
- V1 no renderiza;
- datos legacy siguen legibles;
- documentación y soporte actualizados;
- PR listo para aprobación manual.

---

# 11. Matriz de Definition of Done por tanda

Cada tanda debe marcar:

- [ ] objetivo funcional completo;
- [ ] modelo y contratos tipados;
- [ ] RLS y pruebas negativas;
- [ ] queries/indexes medidos;
- [ ] presupuesto de requests cumplido;
- [ ] web móvil;
- [ ] web desktop;
- [ ] RN Android;
- [ ] RN iOS;
- [ ] claro;
- [ ] oscuro;
- [ ] EVA;
- [ ] white label;
- [ ] loading/skeleton;
- [ ] vacío;
- [ ] error;
- [ ] offline/reconnect;
- [ ] reduced motion;
- [ ] lector de pantalla/teclado;
- [ ] unit tests;
- [ ] integration/E2E;
- [ ] preview;
- [ ] docs y métricas actualizadas.

Una casilla no aplicable debe justificarse; no se elimina silenciosamente.

---

# 12. Criterios globales de éxito

Nutrición V2 se considerará terminada cuando:

1. alumno y coach ya no vean una mezcla V1/V2;
2. haya una única fuente de consumo nuevo;
3. estructurado, flexible e híbrido funcionen;
4. los planes sean versionados y publicables;
5. Today/Plan/History tengan paridad semántica web/RN;
6. Centro/Ficha/Builder reemplacen el flujo antiguo;
7. PWA y RN escaneen GTIN;
8. alimentos tengan ilustración/foto/fallback;
9. claro/oscuro/white label estén verificados;
10. loaders/skeletons sean estructurales y consistentes;
11. motion respete performance y accesibilidad;
12. historial legacy permanezca intacto;
13. RLS impida cruces de tenant/coach/alumno;
14. budgets de requests, payload y Web Vitals se cumplan;
15. el rollout canary no muestre regresiones materiales.

---

# 13. Referencias técnicas verificadas en julio de 2026

- Next.js loading/streaming: https://nextjs.org/docs/app/api-reference/file-conventions/loading
- Next.js caching: https://nextjs.org/docs/app/getting-started/caching
- Supabase query optimization: https://supabase.com/docs/guides/database/query-optimization
- Supabase connection management: https://supabase.com/docs/guides/database/connection-management
- Supabase pg_stat_statements: https://supabase.com/docs/guides/database/extensions/pg_stat_statements
- Supabase egress: https://supabase.com/docs/guides/platform/manage-your-usage/egress
- React Native Reanimated 4: https://docs.swmansion.com/react-native-reanimated/
- FlashList 2: https://shopify.github.io/flash-list/docs/
- Expo Image: https://docs.expo.dev/versions/latest/sdk/image/
- Expo Camera: https://docs.expo.dev/versions/latest/sdk/camera/
- ZXing Browser: https://github.com/zxing-js/browser
- Lottie React Native: https://github.com/lottie-react-native/lottie-react-native
- Rive React Native: https://github.com/rive-app/rive-react-native

---

# 14. Próximo paso autorizado por este plan

No se debe comenzar el Builder ni aplicar nuevas migraciones todavía.

El siguiente paso es ejecutar **Tanda 0** y producir:

1. baseline técnico versionado;
2. budgets medidos;
3. inventario de rutas/componentes V1/V2;
4. mapa de seguridad/RLS;
5. estrategia de feature flag;
6. checklist de compatibilidad de dependencias;
7. tablero de tareas para Tanda 1.

Después de revisar ese baseline, se inicia el contrato/wireframe de Tanda 1.
