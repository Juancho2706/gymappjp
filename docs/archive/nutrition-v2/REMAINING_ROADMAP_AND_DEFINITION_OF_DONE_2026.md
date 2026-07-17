# EVA Nutrición V2 — roadmap restante y Definition of Done

**Fecha:** 15 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`

Este roadmap comienza en el estado actual: Tandas 0–3 cerradas; Tandas 4–5 implementadas parcialmente y pendientes de estabilización; Tandas 6–12 sin cerrar.

---

# Fase A — Estabilizar el trabajo entregado

## A1. CI y contratos

Objetivo: dejar el HEAD confiable antes de añadir producto.

Trabajo:

- corregir Vitest;
- ejecutar lint/typecheck web/typecheck RN/tokens/audit;
- restaurar E2E y nutrition-smoke;
- revisar contratos Zod contra respuestas SQL reales;
- añadir pruebas de errores y payload inválido.

Definition of Done:

- [ ] todos los workflows verdes;
- [ ] ninguna suite omitida;
- [ ] ningún `.skip` nuevo;
- [ ] documentación registra SHA y resultados.

## A2. Workspace profesional

Objetivo: conectar el Centro/Ficha únicamente al workspace activo.

Trabajo:

- services web usan RPC scoped;
- API móvil usa RPC scoped;
- RN envía scope validado;
- server vuelve a validar scope;
- cache incluye workspace;
- tests standalone/team/org;
- BOLA negativo.

Definition of Done:

- [ ] ningún gateway llama RPC profesional sin scope;
- [ ] no existe mezcla de pools;
- [ ] tests positivos/negativos;
- [ ] UI muestra workspace activo.

## A3. RN lifecycle/offline

Objetivo: hacer robusta la experiencia móvil.

Trabajo:

- cancelación real;
- no setState after unmount;
- tests cache;
- tests queue;
- replay al reconectar;
- errores terminales visibles;
- limpieza logout/cambio cuenta;
- estrategia de conflicto.

Definition of Done:

- [ ] navegación rápida no deja requests huérfanos;
- [ ] replay es idempotente;
- [ ] cola corrupta no rompe app;
- [ ] usuario entiende pendiente/error.

## A4. Cerrar catálogo piloto

Objetivo: convertir scanner de infraestructura a funcionalidad útil.

Trabajo:

- lote 20–50 productos Chile;
- staging/revisión/import;
- imágenes/ilustraciones;
- licencias;
- gateway PWA;
- foto faltante;
- QA cámaras;
- métricas.

Definition of Done:

- [ ] búsqueda devuelve productos CL;
- [ ] GTIN real encontrado;
- [ ] unknown report funciona;
- [ ] imágenes optimizadas;
- [ ] PWA/RN equivalentes;
- [ ] egress medido.

---

# Tanda 6 — Alumno V2: Hoy

## Visión

Hoy es la superficie canónica diaria. Debe unir prescripción y consumo real sin confundirlos.

## Funcional

- kcal/macros consumidos y restantes;
- estrategia vigente;
- timeline por franja;
- items prescritos;
- intake real;
- registrar alimento;
- “comí lo indicado” crea intake real;
- editar mediante correction chain;
- copiar registro;
- retirar/void con auditoría;
- alimento sin franja;
- flexible e híbrido;
- cierre del día;
- offline/queue.

## UX

- un CTA principal;
- jerarquía numérica limpia;
- feedback optimista reversible;
- skeleton con tamaño final;
- mensaje sin plan;
- mensaje sin registros;
- error parcial;
- sync visible pero no intrusiva;
- desktop con resumen lateral;
- móvil una columna.

## Definition of Done

- [ ] no monta V1 bajo flag;
- [ ] web/PWA/RN misma semántica;
- [ ] intake solo fuente canónica;
- [ ] record/correct/void probados;
- [ ] offline replay;
- [ ] E2E;
- [ ] performance budget;
- [ ] 4 combinaciones de tema;
- [ ] accesibilidad.

---

# Tanda 7 — Alumno V2: Plan e Historial

## Plan

- estrategia;
- versión y vigencia;
- objetivos;
- variantes;
- comidas/anclas;
- reglas flexibles;
- permisos;
- swaps/intercambios;
- protocolo visible;
- recetas/compras contextuales.

## Historial

- días/semanas;
- objetivos congelados;
- consumo real;
- detalle lazy;
- versión vigente ese día;
- correction chain;
- actor;
- legacy disclosure;
- tendencias agregadas.

## Definition of Done

- [ ] tabs Today/Plan/History web y RN;
- [ ] cursor pagination;
- [ ] charts lazy;
- [ ] 755 días legacy visibles sin mutación;
- [ ] deep links;
- [ ] E2E;
- [ ] payload y query budget.

---

# Tanda 8 — Coach V2: Centro y ficha

## Centro

- resumen;
- alumnos;
- biblioteca;
- filtros persistentes;
- atención explicada;
- drafts;
- catálogo por verificar;
- scope visible.

## Ficha

- Resumen;
- Plan;
- Diario;
- Progreso;
- Notas privadas;
- Protocolo;
- historial/versiones;
- última edición/actor.

## Definition of Done

- [ ] reemplaza cockpit + Hub bajo flag;
- [ ] master-detail desktop;
- [ ] tabs/cards móvil;
- [ ] paginación/virtualización;
- [ ] no datos fuera de workspace;
- [ ] acciones auditadas;
- [ ] budgets cumplidos;
- [ ] E2E multi-workspace.

---

# Tanda 9 — Builder V2

## Pasos

1. estrategia;
2. objetivos;
3. construcción;
4. permisos/experiencia alumno;
5. revisión;
6. publicación.

## Backend

- crear draft;
- version number;
- autosave delta;
- optimistic concurrency;
- structure CRUD solo draft;
- validaciones;
- conflict checker;
- publicación transaccional;
- scheduled effective date;
- resumen de cambios;
- auditoría;
- nueva versión para rollback.

## UI

Desktop:

```txt
outline / canvas / inspector / student preview
```

Móvil coach:

```txt
stepper
```

## Definition of Done

- [ ] tres estrategias completas;
- [ ] preview exacta alumno;
- [ ] drafts y autosave;
- [ ] conflicto concurrente visible;
- [ ] reorder accesible;
- [ ] publicación crea versión;
- [ ] V1 Builder no se monta bajo flag;
- [ ] E2E publicación/versionado.

---

# Tanda 10 — Motion avanzado y gamificación

Solo después de estabilizar flujos.

## Trabajo

- eventos celebrables;
- assets EVA;
- spike Rive/Lottie;
- elegir una tecnología;
- reduced motion;
- white-label tint;
- analytics de completitud;
- no shame/streak punishment.

## Definition of Done

- [ ] motion budget;
- [ ] assets bajo demanda;
- [ ] no regresión FPS/memoria/batería;
- [ ] accesible;
- [ ] útil, no invasivo.

---

# Tanda 11 — Hardening integral

## Seguridad

- RLS/advisors;
- dependency audit;
- scanner permissions;
- upload MIME/size/hash;
- rate limiting;
- idempotencia;
- audit log;
- privacidad analytics;
- export autorizado.

## Rendimiento

- Web Vitals;
- bundle;
- React profiler;
- RN FPS/memoria;
- Sentry traces;
- pg_stat_statements;
- EXPLAIN;
- storage/egress;
- dispositivos/red lenta.

## Calidad

- unit/integration/E2E;
- visual regression;
- offline/reconnect;
- DST Santiago;
- edición concurrente;
- barcode conocido/desconocido;
- themes/white label.

## Definition of Done

- [ ] todos los gates verdes;
- [ ] no blocker oculto;
- [ ] runbook incidentes;
- [ ] rollback ensayado;
- [ ] métricas baseline/canary.

---

# Tanda 12 — Canary, transición y retiro V1

## Secuencia

1. equipo interno;
2. cuenta demo;
3. coach allowlist;
4. alumnos seleccionados;
5. team canary;
6. porcentaje controlado;
7. rollout general;
8. congelar escritura V1;
9. observar;
10. retirar V1 en PR separado.

## Requisitos

- feature flag reversible;
- soporte V1 mientras canary;
- observabilidad;
- soporte y comunicación;
- migración/backfill explícitos;
- reconciliación;
- rollback de rutas;
- aprobación manual.

## Definition of Done

- [ ] métricas canary sanas;
- [ ] no pérdida de historial;
- [ ] no duplicación de intake;
- [ ] adopción coach/alumno;
- [ ] fallback probado;
- [ ] V1 retirado solo después de estabilidad.

---

# Checklist transversal por cada tanda

## Backend

- [ ] migración aditiva;
- [ ] RLS y grants;
- [ ] rollback test;
- [ ] índices para queries reales;
- [ ] auditoría;
- [ ] idempotencia.

## Web/PWA

- [ ] Server Components por defecto;
- [ ] client boundary mínimo;
- [ ] responsive/desktop;
- [ ] loading/empty/error/offline/permission;
- [ ] keyboard/screen reader;
- [ ] Web Vitals.

## React Native

- [ ] lifecycle/cancelación;
- [ ] cache/offline;
- [ ] FlashList cuando aplique;
- [ ] haptics semánticos;
- [ ] dynamic text;
- [ ] Android/iOS device QA;
- [ ] FPS/memoria.

## Diseño

- [ ] tokens;
- [ ] claro/oscuro;
- [ ] EVA/white label;
- [ ] reduced motion;
- [ ] microcopy/tooltips;
- [ ] no color como único estado.

## Operación

- [ ] docs;
- [ ] métricas;
- [ ] runbook;
- [ ] un único Preview por bloque;
- [ ] PR draft hasta aprobación;
- [ ] no merge automático.
