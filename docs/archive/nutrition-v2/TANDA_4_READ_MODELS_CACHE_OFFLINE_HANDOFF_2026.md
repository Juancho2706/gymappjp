# EVA Nutrición V2 — Tanda 4 handoff

## Read models, rollout, gateways, caché y offline

**Estado:** implementación avanzada, no cerrada  
**Fecha de handoff:** 15 de julio de 2026  
**Rama:** `Nuevascosasrnopenai`  
**Supabase:** migraciones aplicadas de forma aditiva

---

## 1. Objetivo original

Crear una capa rápida y tipada para alimentar las pantallas V2 sin repetir árboles PostgREST profundos ni mezclar alumnos de distintos workspaces.

Read models objetivo:

- Today del alumno;
- Plan del alumno;
- Historial paginado;
- Centro del coach;
- Ficha nutricional del alumno.

Además:

- rollout fail-closed;
- endpoints móviles autenticados;
- caché RN versionada;
- cola offline idempotente;
- rutas canary web/RN;
- observabilidad mínima.

---

## 2. Implementación existente

### Contratos compartidos

```txt
packages/nutrition-v2/read-models.ts
packages/nutrition-v2/read-models.test.ts
packages/nutrition-v2/rollout.ts
packages/nutrition-v2/index.ts
```

Contratos Zod versionados con `schemaVersion: 1`:

- `NutritionTodayReadModelSchema`;
- `NutritionPlanReadModelSchema`;
- `NutritionHistoryPageReadModelSchema`;
- `NutritionCoachHubPageReadModelSchema`;
- `NutritionClientDetailReadModelSchema`.

El contrato separa:

- plan y versión;
- objetivos;
- consumo;
- remaining;
- permisos;
- franjas;
- prescripción;
- intake;
- historial legacy;
- cursor/sync token.

### Migraciones aplicadas

```txt
supabase/migrations/20260714210000_nutrition_v2_today_plan_read_models.sql
supabase/migrations/20260714210500_nutrition_v2_history_coach_read_models.sql
supabase/migrations/20260714211000_nutrition_v2_scoped_coach_reads.sql
```

Supabase registró versiones equivalentes con la hora real de aplicación:

```txt
20260714211904 nutrition_v2_today_plan_read_models
20260714211941 nutrition_v2_history_coach_read_models
20260714220755 nutrition_v2_scoped_coach_reads
```

### RPC de alumno

- `get_nutrition_today_v2`
- `get_nutrition_plan_read_v2`
- `get_nutrition_history_page_v2`

### RPC profesional

Primeros RPC:

- `get_nutrition_coach_hub_v2`
- `get_nutrition_client_detail_v2`

Después se añadieron los contratos correctos con workspace explícito:

- `get_nutrition_coach_hub_scoped_v2`
- `get_nutrition_client_detail_scoped_v2`

El RPC hub sin scope perdió permiso `authenticated` para evitar mezclar pools.

### Rollout

```txt
apps/web/src/services/nutrition-v2-rollout.service.ts
apps/web/src/app/api/mobile/config/route.ts
apps/mobile/lib/flags.ts
```

Configuración esperada en Edge Config:

```json
{
  "mode": "off | canary | on",
  "clientIds": [],
  "coachIds": [],
  "teamIds": [],
  "orgIds": [],
  "surfaces": {
    "webStudent": false,
    "webCoach": false,
    "mobileStudent": false,
    "mobileCoach": false
  }
}
```

Propiedades:

- configuración ausente o inválida resuelve OFF;
- flags móviles locales están en `false`;
- rollout separado de billing/feature preferences;
- canary por alumno, coach, team u organización;
- cada superficie se habilita por separado.

### Endpoints móviles

```txt
apps/web/src/app/api/mobile/nutrition-v2/_shared.ts
apps/web/src/app/api/mobile/nutrition-v2/read/route.ts
apps/web/src/app/api/mobile/nutrition-v2/coach/route.ts
apps/web/src/app/api/mobile/nutrition-v2/intake/route.ts
```

Características implementadas:

- Bearer auth;
- verificación de usuario;
- gate canary;
- validación de inputs;
- parsing Zod de respuestas;
- `Cache-Control: no-store`;
- logs con ruta, duración, status y tamaño aproximado;
- mutaciones mediante RPC idempotentes.

### Web canary

Alumno:

```txt
apps/web/src/app/c/[coach_slug]/nutrition-v2/page.tsx
```

Incluye:

- Hoy;
- Plan;
- Historial;
- fallback a V1 si el flag está apagado;
- read models reales;
- componentes V2.

Coach:

```txt
apps/web/src/app/coach/nutrition-v2/page.tsx
apps/web/src/app/coach/nutrition-v2/[clientId]/page.tsx
```

Incluye:

- Centro;
- métricas de página;
- atención explicada;
- ficha básica;
- gate canary;
- botón de Builder deshabilitado.

### React Native canary

```txt
apps/mobile/app/alumno/nutrition-v2/index.tsx
apps/mobile/app/coach/nutrition-v2/index.tsx
apps/mobile/app/coach/nutrition-v2/[clientId].tsx
apps/mobile/lib/nutrition-v2.api.ts
apps/mobile/lib/nutrition-v2-cache.ts
apps/mobile/lib/nutrition-v2-offline.ts
```

Caché:

- schema version 1;
- separada por usuario, alumno, tipo y scope key;
- TTL por Today/Plan/History/Hub/Client Detail;
- máximo de 750 KB por entrada;
- validación Zod al leer;
- stale permitido para UI offline;
- limpieza por usuario.

Cola offline:

- record/correct;
- máximo 100 pendientes;
- máximo 8 intentos;
- backoff exponencial hasta 30 minutos;
- dead-letter limitado a 25;
- separación por usuario;
- deduplicación por idempotency key;
- replay con NetInfo;
- errores 408/429/5xx reintentables.

---

## 3. Validación realizada durante implementación

Se ejecutaron pruebas SQL transaccionales con rollback para:

- Today;
- Plan;
- dos días de historial;
- paginación;
- Client Detail;
- notas privadas;
- BOLA negativo;
- aislamiento standalone/team.

No se dejaron filas de prueba persistidas.

CI observado al handoff:

```txt
pnpm install --frozen-lockfile: PASS
lint: PASS
typecheck web: PASS
check:tokens: PASS
mobile tsc --noEmit: PASS
Vitest: FAIL
E2E: no ejecutado porque quality falla
nutrition-smoke: no ejecutado porque quality falla
```

---

## 4. Bloqueos concretos

### 4.1 Gateway profesional aún usa RPC revocado

Los archivos actuales todavía llaman en algunos puntos:

```txt
get_nutrition_coach_hub_v2
get_nutrition_client_detail_v2
```

Archivos:

```txt
apps/web/src/services/nutrition-v2-read.service.ts
apps/web/src/app/api/mobile/nutrition-v2/coach/route.ts
apps/mobile/lib/nutrition-v2.api.ts
```

Deben usar:

```txt
get_nutrition_coach_hub_scoped_v2
get_nutrition_client_detail_scoped_v2
```

Con scope explícito y validado:

```ts
scopeType: 'standalone' | 'team' | 'organization'
teamId: string | null
orgId: string | null
```

Este es un bloqueo funcional y de seguridad para el Centro/Ficha del coach.

### 4.2 Cancelación RN no está cerrada

En la pantalla Today RN, `load()` crea un `AbortController` y devuelve una función, pero esa función sale de una promesa y no se usa como cleanup del efecto.

Corregir con:

- controller en el `useEffect` o `useRef`;
- `abort()` en cleanup;
- guard de componente montado;
- prueba de navegación rápida.

### 4.3 Vitest rojo

El último quality job llega hasta Vitest y falla. Reproducir localmente antes de desarrollar más.

No silenciar tests, no usar `.skip` y no retirar suites.

### 4.4 Caché web no implementada como estaba planificada

El servicio web usa `noStore()` para datos privados. Esto es seguro, pero Tanda 4 todavía no implementa:

- request memoization específica;
- cache tags para catálogo público;
- invalidación por plan/fecha;
- métricas de hit/miss.

No añadir caché compartida para datos personales.

### 4.5 Observabilidad incompleta

Existe logging estructurado básico, pero falta:

- Sentry spans específicos;
- métricas p50/p95;
- contador de requests por pantalla;
- payload bytes persistidos;
- offline replay success/failure;
- PostHog sin PII;
- dashboard/runbook.

### 4.6 Rutas canary no equivalen a producto final

Las rutas actuales son vertical slices para validar read models. Faltan:

- navegación integrada;
- tabs Plan/Historial RN;
- intake completo desde Today;
- edición/copia/eliminación;
- Builder;
- cierre del día;
- full responsive QA;
- E2E.

---

## 5. Orden recomendado para cerrar Tanda 4

1. Dejar Vitest verde.
2. Corregir scope profesional extremo a extremo.
3. Corregir AbortController RN.
4. Añadir tests del resolver de workspace y gateways.
5. Añadir tests de cache y offline queue.
6. Probar record/correct offline y replay.
7. Medir requests y payload en Today/Plan/History/Hub/Detail.
8. Añadir Sentry/PostHog sin PII.
9. Ejecutar E2E canary.
10. Actualizar este documento a `Estado: completada` solo después de cumplir salida.

---

## 6. Criterios de salida pendientes

- [ ] Vitest verde.
- [ ] Hub profesional usa RPC scoped.
- [ ] Client Detail profesional usa RPC scoped.
- [ ] Scope web y RN probado.
- [ ] Cache RN probada.
- [ ] Cola offline probada.
- [ ] Cancelación de requests real.
- [ ] Métricas registradas.
- [ ] Budgets de requests/payload verificados.
- [ ] E2E web.
- [ ] QA RN en dispositivo.
- [ ] Claro/oscuro/white label.
- [ ] Preview Vercel único y estable.

**No declarar Tanda 4 completada todavía.**
