# EVA Nutrición V2 — validación, riesgos y bloqueos conocidos

**Fecha:** 15 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**PR:** #121, draft

Este archivo debe actualizarse cada vez que se cierre o descubra un bloqueo. Es la fuente de verdad para no confundir infraestructura creada con producto terminado.

---

## 1. Estado de CI observado

Última corrida revisada después de corregir errores móviles:

| Gate | Estado |
|---|---|
| instalación frozen lockfile | PASS |
| lint | PASS |
| typecheck web | PASS |
| paridad de tokens | PASS |
| typecheck Expo React Native | PASS |
| Vitest | FAIL |
| dependency audit | no ejecutado por fallo previo |
| E2E | omitido por fallo de quality |
| nutrition smoke | omitido por fallo de quality |

No solicitar merge ni quitar el estado draft mientras Vitest esté rojo.

---

## 2. Bloqueadores P0

### P0.1 Vitest falla

Síntoma:

```txt
npx vitest run → failure
```

Lint/typecheck/tokens pasan antes del fallo.

Acción:

1. ejecutar la suite completa localmente;
2. capturar todos los tests fallidos en una sola corrida;
3. diferenciar regresión real, contrato desactualizado o problema de entorno;
4. corregir implementación o expectation;
5. no usar `.skip`, `.only` ni reducir cobertura;
6. ejecutar nuevamente todos los gates.

### P0.2 Gateway profesional desalineado con Supabase

Supabase revocó para authenticated:

```txt
get_nutrition_coach_hub_v2
```

RPC vigentes:

```txt
get_nutrition_coach_hub_scoped_v2
get_nutrition_client_detail_scoped_v2
```

Los gateways actuales todavía llaman RPC sin scope en:

```txt
apps/web/src/services/nutrition-v2-read.service.ts
apps/web/src/app/api/mobile/nutrition-v2/coach/route.ts
apps/mobile/lib/nutrition-v2.api.ts
```

Impacto:

- Hub/ficha del coach pueden fallar aunque el rollout esté abierto;
- el UI afirma respetar el workspace, pero el contrato de aplicación no lo transporta;
- riesgo de regresión de aislamiento si alguien reabre el RPC viejo.

Resolución:

- scope explícito standalone/team/organization;
- teamId/orgId validados server-side;
- tests positivos y negativos;
- cache key con workspace;
- jamás reotorgar el RPC sin scope como atajo.

### P0.3 No generar Preview final con CI rojo

`vercel.json` mantiene pausa temporal:

```json
"ignoreCommand": "exit 0"
```

No retirar hasta:

- Vitest verde;
- scope profesional corregido;
- bloque listo para una única build.

---

## 3. Bloqueadores P1

### P1.1 Cancelación RN incorrecta

Archivo:

```txt
apps/mobile/app/alumno/nutrition-v2/index.tsx
```

Problema:

- `load()` crea AbortController;
- devuelve cleanup desde una función async;
- `useEffect` no recibe ese cleanup;
- request puede seguir después de navegar.

Resolver con controller en efecto/ref y guard de mounted state.

### P1.2 Offline queue sin suite dedicada

Existe implementación de queue, backoff y dead letter, pero faltan tests para:

- deduplicación;
- separación entre usuarios;
- retry 408/429/5xx;
- error terminal 4xx;
- máximo de intentos;
- replay tras reconectar;
- persistencia corrupta;
- logout/account switch.

### P1.3 Cache RN sin pruebas completas

Falta validar:

- key por usuario/alumno/workspace;
- TTL;
- stale permitido/no permitido;
- schema mismatch;
- payload >750 KB;
- limpieza por usuario;
- cambio de workspace;
- datos privados nunca compartidos.

### P1.4 Scanner PWA usa RPC directo

Archivo:

```txt
apps/web/src/components/nutrition-v2/FoodScannerClient.tsx
```

Riesgos:

- observabilidad distinta al endpoint móvil;
- sin rate limiting central;
- error contract diferente;
- más superficie de grants públicos.

Recomendación: usar gateway server-side protegido por sesión/gate.

### P1.5 Sin catálogo real

Infraestructura lista, datos no:

```txt
barcode: 0
productos CL: 0
food_media: 0
```

El scanner no puede considerarse funcional para producción hasta importar un lote piloto.

---

## 4. Riesgos de Supabase

### 4.1 Base productiva única

No existe entorno aislado con copia de datos reales. Mantener:

- migraciones aditivas;
- rollback tests;
- cero pruebas con datos reales;
- scopes explícitos;
- grants mínimos.

### 4.2 Drift de nombres de migración

Los nombres en Git usan timestamps planificados; Supabase registra timestamps de aplicación diferentes. Comparar por nombre, no asumir igualdad exacta de versión temporal.

### 4.3 Functions SECURITY DEFINER

Revisar siempre:

- `search_path = ''`;
- referencias fully-qualified;
- revoke public/anon;
- execute solo para roles requeridos;
- validación de `auth.uid()`;
- scope de alumno/workspace.

### 4.4 Índices sin tráfico

Advisors pueden marcar índices V2 como unused porque tablas están vacías. No borrarlos antes de canary; primero medir queries reales.

### 4.5 Snapshots vacíos

El sistema permite snapshot honesto sin plan. Verificar UX para no confundir “sin plan” con error de carga.

---

## 5. Riesgos de seguridad y privacidad

### Acceso profesional

- team/org/standalone no deben mezclarse;
- private notes solo profesionales;
- alumno no actualiza versión publicada;
- intake V2 solo RPC;
- correcciones conservan original.

### Storage

- `food-media` es público: solo assets curados/licenciados;
- `food-submissions` es privado: ruta por userId;
- falta validar imagen real antes de upload;
- falta proceso de moderación/promoción.

### Analytics

No enviar:

- nombre del alumno;
- texto de notas;
- alimentos personalizados;
- diagnóstico;
- objetivos clínicos;
- imágenes privadas.

Eventos solo con IDs técnicos, duración, resultado y categorías no sensibles.

---

## 6. Riesgos de rendimiento

Aún no medido:

- p50/p95 de RPC;
- payload Today/Plan/History/Hub/Detail;
- request count;
- Web Vitals;
- bundle scanner;
- FPS/memoria RN;
- egress de media;
- hit/miss de cache;
- offline replay.

Budgets rectores:

- Today: 1 read principal, máximo 2 críticos;
- intake: 1 escritura idempotente;
- Hub: resumen paginado;
- History: cursor;
- imágenes de lista: thumbnail, no original.

---

## 7. Riesgos UX/UI

### Vertical slices incompletos

Las rutas canary prueban arquitectura, pero no representan toda la experiencia aprobada.

Faltan:

- Today completo;
- Plan/History RN;
- intake integrado;
- edición/copia/eliminación;
- Builder;
- swaps/intercambios;
- navegación final;
- Pro completo;
- gamificación controlada.

### White label

Probar siempre:

1. EVA claro;
2. EVA oscuro;
3. white label claro;
4. white label oscuro.

No usar color de marca para success/error.

### Accesibilidad

Pendientes de QA:

- tab order;
- screen reader;
- dynamic text RN;
- targets;
- orientación/tablet;
- reduced motion;
- scanner con fallback no visual.

---

## 8. Matriz de validación mínima

| Área | Unit | Integration | E2E/device | Estado |
|---|---:|---:|---:|---|
| contratos Zod | parcial | no | no | pendiente |
| publicación/versiones | sí, SQL rollback | sí | no | parcial |
| intake/correction | sí, SQL rollback | parcial | no | parcial |
| Today read model | parcial | SQL | no | parcial |
| History | parcial | SQL | no | parcial |
| Hub scoped | no suficiente | SQL puntual | no | bloqueado gateway |
| cache RN | no | no | no | pendiente |
| offline queue | no | no | no | pendiente |
| catálogo/GTIN | unit parcial | SQL rollback | no | parcial |
| scanner PWA | no | no | no | pendiente |
| scanner RN | no | no | no | pendiente |
| themes/white label | tokens | no | no | pendiente |

---

## 9. Condiciones antes de merge

- [ ] CI completo verde.
- [ ] RPC scoped conectado.
- [ ] Vercel pause retirada solo al final.
- [ ] Preview final aprobado.
- [ ] SQL rollback tests repetibles.
- [ ] E2E canary.
- [ ] QA RN real.
- [ ] datos piloto controlados.
- [ ] documentación actualizada.
- [ ] plan de rollback.
- [ ] aprobación manual de Juan.

PR #121 debe permanecer draft hasta entonces.
