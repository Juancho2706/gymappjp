# EVA Nutrición V2 — Tanda 0

## Baseline técnico, contratos de calidad y guardrails

**Estado:** completada  
**Fecha:** 14 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**Base:** `rnmobiledenuevo`  
**PR:** #121, draft  
**Supabase:** `constant` (`jikjeokundmaafuytdcx`) — producción

---

## 1. Alcance y resultado

Esta tanda congela la línea base de Nutrición antes de construir las superficies V2. No introduce cambios funcionales, no aplica migraciones, no modifica RLS y no cambia lo que ven los coaches o alumnos.

Entregables cerrados:

- inventario V1/V2;
- línea base de Supabase, Storage y Vercel;
- riesgos de seguridad y rendimiento;
- presupuestos técnicos;
- estrategia de feature flag;
- matriz de compatibilidad de dependencias;
- contrato de loaders, skeletons y estados;
- guardrail automático contra mezclar componentes V1 dentro de V2;
- tablero listo para Tanda 1.

---

## 2. Principios de seguridad de producción

1. Toda evolución de Supabase será aditiva.
2. Ninguna tabla, columna, policy, función o bucket legacy se elimina durante el desarrollo de V2.
3. Las migraciones se escriben primero en Git, se prueban con rollback y se aplican únicamente cuando la tanda correspondiente las requiera.
4. V1 continuará operativa como fallback hasta el canary final.
5. V2 no realizará dual-write silencioso. Cada compatibilidad debe ser explícita, idempotente y testeada.
6. El historial existente no se reinterpretará como alimentos realmente ingeridos cuando esos alimentos nunca fueron registrados.
7. El PR permanece draft; `master` y `rnmobiledenuevo` no reciben cambios.

---

## 3. Línea base de producto y datos

### 3.1 Estado productivo observado

| Entidad | Volumen aproximado |
|---|---:|
| Planes | 115 |
| Plantillas | 33 |
| Comidas prescritas | 486 |
| Días históricos | 755 |
| Registros legacy de comidas | ~2.4k |
| Entradas del diario real V2 | 2 |
| Alimentos | 344 |
| Alimentos `CL` | 0 |
| Alimentos con GTIN/barcode | 0 |
| Alimentos verificados | 0 |
| Alimentos con imagen | 0 |

### 3.2 Consecuencia arquitectónica

- El sistema legacy contiene casi todo el historial real de uso.
- El diario canónico V2 todavía está prácticamente vacío.
- No se puede retirar V1 mediante una migración masiva ciega.
- Debe existir un adaptador de lectura histórica y una transición de escritura gradual.
- Para días V2, el consumo se calculará exclusivamente desde intake real.

---

## 4. Inventario de superficies

## 4.1 Alumno web/PWA — V1 y capas añadidas

Ruta principal:

- `apps/web/src/app/c/[coach_slug]/nutrition/page.tsx`

Superficie legacy central:

- `apps/web/src/app/c/[coach_slug]/nutrition/_components/NutritionShell.tsx`

Capas nuevas relevantes:

- resumen diario;
- objetivos profesionales;
- consumo real;
- búsqueda/barcode manual;
- recetas y catálogo.

Problema confirmado:

- la ruta monta bloques nuevos y luego conserva el shell legacy;
- existen resúmenes y acciones duplicadas;
- prescripción y consumo pueden percibirse como dos diarios distintos.

## 4.2 Alumno React Native

Ruta principal:

- `apps/mobile/app/alumno/(tabs)/nutricion.tsx`

Estado:

- contiene un shell extenso con múltiples secciones legacy;
- las capacidades nuevas se incorporaron dentro de esa composición;
- no existe todavía navegación canónica `Hoy / Plan / Historial`;
- listas y módulos secundarios pueden retrasar el primer contenido útil.

## 4.3 Coach web

Entradas principales:

- `apps/web/src/app/coach/nutrition-plans/page.tsx`
- `apps/web/src/app/coach/nutrition-plans/_components/NutritionHub.tsx`
- `apps/web/src/app/coach/nutrition-plans/_components/PlanBuilder/PlanBuilder.tsx`

Estado:

- el cockpit nuevo y el hub antiguo conviven;
- `PlanBuilder` sigue siendo un monolito;
- templates, planes asignados y modos no comparten todavía un contrato versionado;
- no existe preview canónica de la experiencia del alumno antes de publicar.

## 4.4 Coach React Native

Ruta principal:

- `apps/mobile/app/coach/(tabs)/nutricion.tsx`
- `apps/mobile/app/coach/nutrition-builder.tsx`

Hallazgos:

- el tab principal carga clientes, plantillas, alimentos, recetas y planes activos en paralelo;
- luego carga el board de forma separada;
- se precargan bibliotecas que no siempre son necesarias;
- la pantalla concentra múltiples responsabilidades y estados locales.

## 4.5 Servicios que se conservan

- `@eva/nutrition-engine`;
- RLS y scopes coach/team/org;
- catálogo y GTIN faltantes;
- favoritos y recientes;
- recetas estructuradas;
- intercambios;
- hábitos, notas y lista de compras;
- snapshots existentes;
- colas offline;
- motor white label compartido.

---

## 5. Línea base de Supabase

## 5.1 Tamaño

Las tablas auditadas de Nutrición son pequeñas. Ninguna supera aproximadamente 1 MB.

Ejemplos:

| Tabla | Tamaño aproximado |
|---|---:|
| `nutrition_meal_logs` | 792 kB |
| `daily_nutrition_logs` | 464 kB |
| `food_items` | 400 kB |
| `foods` | 392 kB |
| `nutrition_meals` | 216 kB |
| `nutrition_plans` | 192 kB |
| `daily_habits` | 192 kB |
| `nutrition_intake_entries` | 96 kB |

Conclusión:

- no se necesita particionamiento;
- no se necesita aumentar compute por tamaño;
- no se debe optimizar prematuramente almacenamiento de tablas.

## 5.2 Patrón de consultas

`pg_stat_statements` está habilitado.

Los hotspots observados son consultas PostgREST repetidas y embeds profundos:

- plan activo con relaciones: miles de ejecuciones;
- comidas con `food_items`: miles de ejecuciones;
- fechas/logs diarios: miles de ejecuciones;
- adherencia y board: múltiples variantes repetidas;
- medias individuales de aproximadamente 4–20 ms, que se vuelven costosas por fan-out y frecuencia.

Conclusión:

- el problema principal no es una consulta extremadamente lenta;
- el problema es el número de requests, el solapamiento y el volumen repetido;
- V2 usará read models por pantalla y respuestas compactas.

## 5.3 Índices y advisors

Los porcentajes de index scan son altos en las tablas principales, pero el advisor marcó FKs sin índice, entre ellas:

- `food_catalog_missing_codes.resolved_food_id`;
- `nutrition_audit_log.actor_client_id`;
- `nutrition_audit_log.executed_by`;
- `nutrition_meal_logs.meal_id`;
- `nutrition_plan_notes.created_by`;
- `nutrition_plan_notes.reply_to`;
- `nutrition_plan_templates.parent_template_id`;
- `nutrition_recipe_ingredients.food_id`;
- `nutrition_template_presets.parent_preset_id`;
- `saved_meal_items.food_id`;
- `student_food_favorites.food_id`;
- `foods.coach_id`.

También existen índices reportados como no utilizados.

Guardrail:

- no se crean todos los índices sugeridos automáticamente;
- no se eliminan índices “unused” por una sola ventana estadística;
- cada índice futuro requiere query objetivo, `EXPLAIN (ANALYZE, BUFFERS)`, medición antes/después y costo de escritura estimado.

## 5.4 Conexiones

Una captura mostró 21 conexiones idle del rol PostgREST `authenticator`.

Guardrail:

- no cambiar Supavisor, pool size ni compute por una captura puntual;
- medir peak, saturación y espera real durante canary;
- reducir fan-out antes de tocar infraestructura.

---

## 6. Línea base de Storage y egress

Volumen aproximado:

| Bucket | Uso |
|---|---:|
| `exercise-animations` | 77 MB |
| `checkins` | 68 MB |
| `exercise-media` | 34 MB |
| `logos` | ~7.5 MB |
| `recipe-media` | mínimo |

Decisiones para alimentos:

- bucket separado `food-media` en Tanda 5;
- originales solo para detalle/curación;
- thumbnails 64/128/256 px;
- WebP/AVIF según plataforma;
- cache larga con paths versionados;
- ilustraciones EVA pequeñas como fallback;
- medición de egress por bucket;
- no generar signed URLs por cada render si el asset verificado puede ser público.

No se creó ningún bucket en esta tanda.

---

## 7. Línea base de Vercel

Proyecto:

- framework Next.js;
- runtime Node.js 24;
- branch preview `Nuevascosasrnopenai` en estado READY durante la medición.

Rutas nutricionales observadas en siete días:

| Ruta | Ejecuciones observadas |
|---|---:|
| `/c/[coach_slug]/nutrition` | 112 |
| `/api/cron/weekly-snapshot` | 94 |
| `/coach/nutrition-plans` | 69 |
| `/coach/nutrition-plans/new` | 4 |
| `/coach/nutrition-recipes` | 4 |
| detalle alumno/plan | bajo volumen |

No aparecieron errores agrupados propios de Nutrición en la ventana revisada.

Sí existe un grupo de errores de `/api/training-sessions`; queda fuera de esta tanda y no se mezclará con el rework.

Guardrail de observabilidad:

- eventos de Nutrición usarán nombres versionados;
- no se enviarán alimentos, notas, restricciones ni datos clínicos a PostHog;
- Sentry podrá recibir IDs técnicos y contexto no sensible;
- las nuevas Server Actions/RPC gateways registrarán duración, request ID, resultado y tamaño aproximado, sin payload privado.

---

## 8. Seguridad y RLS

## 8.1 Hallazgos existentes

El advisor de seguridad reporta funciones legacy con `search_path` mutable, incluidas:

- `complete_nutrition_meal`;
- `generate_grocery_list_for_plan`;
- `nutrition_audit_write`;
- `apply_nutrition_template`;
- `save_nutrition_plan_tree`;
- `recommend_nutrition_templates`;
- funciones de remediación de Nutrición.

También existen policies de update que el advisor clasifica como demasiado permisivas o siempre verdaderas en tablas legacy como:

- `food_items`;
- `foods`;
- `nutrition_meals`;
- `nutrition_plan_notes`;
- `nutrition_plans`;
- `shopping_list_items`.

Además, leaked password protection está deshabilitado a nivel Auth.

## 8.2 Tratamiento

No se corrigieron estas advertencias en Tanda 0 porque tocar seguridad productiva requiere una migración específica, pruebas por rol y plan de rollback.

Se convierten en gates para Tanda 3 y Tanda 11:

- toda función V2 tendrá `SET search_path` explícito;
- grants mínimos y `SECURITY DEFINER` solo cuando sea imprescindible;
- policies V2 con `USING` y `WITH CHECK`;
- tests negativos de IDOR/BOLA;
- alumno no puede editar objetivos o versiones;
- coach/team no puede acceder a alumnos fuera de scope;
- correcciones dejan actor y trazabilidad;
- los problemas legacy se corrigen en migraciones aisladas, no “de paso”.

---

## 9. Bloqueador de cámara PWA

`apps/web/next.config.ts` aplica globalmente:

```txt
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Esto bloquea el scanner aunque exista código para abrir cámara.

Decisión:

- conservar bloqueo por defecto;
- en Tanda 5 habilitar `camera=(self)` únicamente para la superficie/ruta de scanner;
- entrada manual siempre disponible;
- fallback por imagen;
- cleanup del MediaStream;
- prueba Safari iOS, Chrome Android y PWA instalada.

---

## 10. Compatibilidad del stack

## 10.1 Web

| Área | Estado | Decisión |
|---|---|---|
| Next.js 16.2.x | instalado | actualización patch aislada, nunca mezclada con una tanda funcional |
| React 19.1 | instalado | revisar alineación React/React DOM/types antes de V2 UI |
| React Compiler | activo | conservar y revisar componentes client grandes |
| Tailwind 4 | activo | tokens, no colores hardcoded |
| Framer Motion 12 | activo | microinteracciones web |
| TanStack Virtual | activo | listas/tablas grandes web |
| Recharts | activo | charts lazy, no bundle inicial |
| Sentry | activo | errores/traces sin datos sensibles |
| Vercel Analytics/Speed Insights | activo | Web Vitals y rutas |
| PostHog | activo | feature rollout y funnel sin PHI |

## 10.2 React Native

`newArchEnabled: true` está activo.

| Área | Estado | Decisión |
|---|---|---|
| Expo SDK 54 | instalado | no saltar SDK dentro del rework |
| RN 0.81.5 | instalado | compatible con stack actual |
| Reanimated 4 | instalado | motor principal de movimiento RN |
| Moti | instalado | animaciones declarativas y skeletons |
| Skia | instalado | progreso y visuales especiales |
| FlashList 2 | instalado | catálogos, roster e historial |
| Expo Image | instalado | cache, placeholders y thumbnails |
| Expo Camera | instalado | barcode RN |
| Haptics | instalado | feedback corto y semántico |
| fast-confetti | instalado | celebraciones limitadas |
| Sentry RN | instalado | crash/performance |

## 10.3 Versiones duplicadas

Se observó divergencia de `@supabase/supabase-js` entre root/web y mobile.

Guardrail:

- inventariar APIs realmente utilizadas;
- alinear versión en un PR técnico aislado;
- no actualizar Supabase JS al mismo tiempo que cambia el dominio de datos;
- pasar typecheck, auth, offline y smoke tests.

---

## 11. Presupuestos aprobados

## 11.1 Alumno — abrir Hoy

- objetivo: 1 read model principal;
- máximo temporal: 2 requests críticos;
- recetas/compras/reportes diferidos;
- contenido útil antes de datasets secundarios;
- ningún refetch completo al cambiar una cantidad.

## 11.2 Registrar alimento

- búsqueda paginada y debounced;
- 1 escritura transaccional/idempotente;
- actualización optimista;
- reconciliación del resumen;
- cero recarga del plan completo.

## 11.3 Alumno — Historial

- cursor pagination;
- detalle bajo demanda;
- agregados semanales server-side;
- charts importados solo al abrir tendencias.

## 11.4 Coach — Centro

- 1 read model de resumen;
- roster paginado al abrir Alumnos;
- no precargar recetas, alimentos y templates;
- filtros server-side y payload compacto.

## 11.5 Builder

- plan/version + estructura mínima al iniciar;
- búsqueda bajo demanda;
- autosave por delta con debounce;
- publicación en una transacción;
- preview derivada del mismo contrato, no de un segundo modelo.

## 11.6 Web Vitals

Objetivos p75 iniciales:

- LCP móvil ≤ 2.5 s;
- INP ≤ 200 ms;
- CLS ≤ 0.1;
- navegación V2 con feedback inmediato;
- imágenes de lista normalmente ≤ 20–35 KB.

## 11.7 React Native

- primera interacción sin esperar módulos secundarios;
- 60 fps en dispositivo medio como baseline;
- listas grandes con FlashList;
- no `ScrollView.map` para catálogos/roster/historial;
- animaciones fuera de pantalla pausadas;
- assets de celebración bajo demanda.

---

## 12. Feature flag `nutrition_v2`

No se reutilizará la preferencia comercial de dominio como selector de arquitectura.

Motivo:

- `@eva/feature-prefs` resuelve habilitación funcional por alumno/coach/org;
- `nutrition_v2` controla rollout técnico y debe poder activar una superficie completa sin alterar la disponibilidad comercial del módulo.

Estados:

```ts
type NutritionV2Rollout =
  | 'off'
  | 'internal'
  | 'coach_allowlist'
  | 'team_allowlist'
  | 'percentage'
  | 'on'
```

Reglas:

- resolución server-side en web;
- configuración equivalente en RN;
- asignación estable, no aleatoria por cada render;
- fallback V1 ante flag off;
- el flag escoge V1 o V2 completos;
- nunca monta ambos shells en la misma pantalla;
- eventos de analytics incluyen `nutrition_ui_version` sin datos sensibles.

Implementación del flag corresponde a Tanda 4. No se añadió almacenamiento ni configuración productiva aquí.

---

## 13. Contrato de loading, skeleton y feedback

### Boot

- loader EVA/white label existente;
- solo auth, bootstrap y resolución inicial de marca;
- reduced motion respetado.

### Ruta web

- `loading.tsx` por segmento;
- Suspense granular;
- layout, header y navegación permanecen interactivos.

### Primera carga RN

- shell inmediato;
- skeleton estructural;
- no pantalla vacía con spinner, salvo boot.

### Refetch

- conservar contenido anterior;
- indicador local discreto;
- no cubrir la pantalla completa.

### Mutación

- estado en el botón/fila afectada;
- feedback optimista donde sea seguro;
- rollback visible;
- toast accesible;
- acción destructiva con undo cuando sea viable.

### Skeleton

- dimensiones finales;
- tokens de superficie;
- claro/oscuro;
- no usar marca como shimmer dominante;
- reduced motion simplificado;
- variantes web y RN equivalentes.

---

## 14. Contrato preliminar de microanimaciones

La petición de producto incluye movimiento pequeño y constante, no solo celebraciones grandes.

Se aprueba esta jerarquía:

### Confirmación

- check dibujado/escala corta;
- borde o superficie pasa a success;
- haptic success RN;
- 180–260 ms.

### Rechazo/error

- desplazamiento horizontal muy corto o pulse de error;
- mensaje textual y foco en el campo;
- haptic warning/error RN;
- no depender solo de rojo;
- 180–320 ms.

### Selección de card

- scale 0.98 al presionar;
- elevación/borde/fill al seleccionar;
- check o radio animado;
- 120–220 ms.

### Añadir alimento

- fila aparece desde el punto de acción;
- macros interpolan al nuevo valor;
- no reanimar toda la pantalla;
- 180–300 ms.

### Eliminar

- colapso de altura/opacidad;
- toast con deshacer;
- sin celebración;
- 180–260 ms.

### Guardado/publicación

- spinner local → check;
- estado `Guardando…` → `Guardado`;
- publicación permite celebración de nivel medio, no loop.

### Offline/sync

- icono cambia de pendiente a sincronizado;
- animación discreta una vez;
- texto siempre visible.

### Scanner

- línea/retícula suave;
- lock visual al detectar;
- haptic breve;
- error de lectura con feedback no agresivo.

Herramientas base:

- web: CSS y Framer Motion;
- RN: Reanimated, Moti y Haptics;
- Skia solo para progreso/visuales que lo justifiquen.

Guardrails:

- no loops permanentes en el contenido diario;
- no bloquear input;
- reduced motion tiene fallback estático;
- animaciones funcionales usan colores semánticos del sistema;
- color white label solo en selección/CTA/detalles autorizados.

El contrato completo queda cerrado en Tanda 1.

---

## 15. Guardrail automático V1/V2

Se añade un script de CI local que inspecciona futuros directorios V2 y falla si importan shells legacy prohibidos.

Prohibiciones iniciales:

- `NutritionShell` V1;
- `NutritionHub` V1;
- `PlanBuilder` V1.

El guard no impide reutilizar servicios, tipos, cálculos o componentes neutrales. Impide montar la arquitectura legacy dentro de las superficies nuevas.

---

## 16. Tablero entregado a Tanda 1

### Producto

- cerrar las tres estrategias;
- definir qué puede cambiar el alumno;
- separar prescripción/consumo/adherencia;
- definir Base vs Pro;
- versionado y publicación.

### Alumno

- IA `Hoy / Plan / Historial`;
- timeline y franjas;
- registro universal;
- scanner;
- historial y legacy;
- estados offline.

### Coach

- IA Centro/Ficha/Builder;
- board y prioridades;
- biblioteca;
- preview del alumno;
- edición/publish;
- Teams y auditabilidad.

### UI/UX

- wireframes mobile/tablet/desktop;
- dark/light/white label;
- tooltips y microcopy;
- skeletons;
- microanimaciones;
- accesibilidad.

---

## 17. Criterios de cierre — resultado

- [x] baseline productivo documentado;
- [x] inventario V1/V2;
- [x] hotspots Supabase identificados;
- [x] advisors de seguridad/rendimiento revisados;
- [x] baseline Vercel revisado;
- [x] budgets definidos;
- [x] estrategia de flag definida;
- [x] compatibilidad web/RN revisada;
- [x] loaders/skeletons contratados;
- [x] microanimaciones incorporadas al alcance;
- [x] guardrail V1/V2 preparado;
- [x] cero migraciones aplicadas;
- [x] cero cambio funcional en producción.

**Tanda 0: completada.**
