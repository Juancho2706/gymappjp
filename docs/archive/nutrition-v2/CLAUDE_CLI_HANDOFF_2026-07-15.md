# Handoff para Claude CLI — EVA Nutrición V2

**Fecha:** 15 de julio de 2026  
**Repositorio:** `Juancho2706/gymappjp`  
**Rama obligatoria:** `Nuevascosasrnopenai`  
**PR:** #121, draft, base `rnmobiledenuevo`  
**Supabase:** proyecto productivo `constant` (`jikjeokundmaafuytdcx`)

---

## 1. Misión de esta rama

Esta rama convierte la Nutrición antigua de EVA en una experiencia unificada y equivalente entre:

- web desktop;
- web responsive/PWA;
- React Native para iOS y Android.

La visión final es:

### Alumno

```txt
Hoy / Plan / Historial
```

El alumno ve la prescripción vigente, registra lo que realmente comió, entiende cuánto le falta para sus objetivos y conserva un historial honesto.

### Coach

```txt
Centro / Ficha del alumno / Builder
```

El coach prescribe con tres estrategias:

1. plan estructurado;
2. objetivos flexibles de macros;
3. plan híbrido.

### Nutrición Pro

El módulo profesional debe ampliar la capacidad del coach/nutricionista con historial, notas privadas, protocolos, evaluación, versiones, intercambios y seguimiento, sin convertir Base en un producto roto.

### Restricciones de negocio

- No usar IA generativa ni servicios pagados por tokens.
- No consultar APIs de alimentos durante el uso normal.
- Catálogo, códigos e imágenes viven en EVA/Supabase.
- El mercado inicial es Chile.
- EVA Teams usa la misma aplicación y debe respetar el workspace activo.
- Todo debe soportar white label, tema claro y tema oscuro.

---

## 2. Estado resumido

### Cerrado o suficientemente estable

- Tanda 0: baseline y guardrails.
- Tanda 1: contrato de producto y wireframes.
- Tanda 2: contratos compartidos y kit visual web/RN.
- Tanda 3: dominio aditivo, versiones, snapshots, intake, correcciones y RLS.
- Mobile TypeScript volvió a pasar después del cierre de handoff.
- Lint, typecheck web y paridad de tokens pasan en el último CI observado.

### Implementado pero no listo para rollout

- Tanda 4: read models, gates, endpoints, rutas canary, caché RN y cola offline.
- Tanda 5: catálogo local, GTIN, Storage, import staging y scanners PWA/RN.

### No terminado

- Vitest está fallando en el último CI observado.
- Los read models profesionales todavía tienen una inconsistencia de scope en los gateways de aplicación.
- No existe lote piloto chileno.
- No existen imágenes reales o ilustraciones cargadas.
- No se han ejecutado E2E/Playwright de Tandas 4–5.
- No se ha medido payload, p95, Web Vitals, FPS ni egress.
- Las Tandas 6–12 siguen pendientes.

---

## 3. Antes de editar código

Ejecutar:

```bash
git checkout Nuevascosasrnopenai
git pull --ff-only
pnpm install --frozen-lockfile
```

Leer:

```txt
docs/product/nutrition-v2/README.md
docs/product/nutrition-v2/VALIDATION_RISKS_AND_KNOWN_BLOCKERS_2026.md
docs/product/nutrition-v2/CURRENT_IMPLEMENTATION_AND_FILE_MAP_2026.md
docs/product/NUTRITION_V2_MASTER_EXECUTION_PLAN_2026.md
```

Confirmar:

```bash
git status
pnpm lint
pnpm typecheck
pnpm check:tokens
pnpm --filter @eva/mobile exec tsc --noEmit
npx vitest run
```

No avanzar a funcionalidad nueva mientras `npx vitest run` siga rojo.

---

## 4. Primer bloque que Claude debe ejecutar

### Paso 1 — Estabilización de CI

1. Reproducir Vitest localmente.
2. Identificar todos los tests fallidos en una sola corrida.
3. Corregirlos sin desactivar suites ni reducir aserciones.
4. Ejecutar nuevamente:

```bash
pnpm lint
pnpm typecheck
pnpm check:tokens
pnpm --filter @eva/mobile exec tsc --noEmit
npx vitest run
```

5. No lanzar Preview Vercel durante intentos intermedios.

### Paso 2 — Corregir scope profesional

La migración aplicada revocó el RPC profesional sin scope:

```txt
get_nutrition_coach_hub_v2
```

Y creó:

```txt
get_nutrition_coach_hub_scoped_v2
get_nutrition_client_detail_scoped_v2
```

Sin embargo, los gateways actuales todavía llaman los RPC antiguos en algunos puntos:

```txt
apps/web/src/services/nutrition-v2-read.service.ts
apps/web/src/app/api/mobile/nutrition-v2/coach/route.ts
apps/mobile/lib/nutrition-v2.api.ts
```

Corregir el contrato de extremo a extremo para enviar:

```ts
scopeType: 'standalone' | 'team' | 'organization'
teamId: string | null
orgId: string | null
```

Requisitos:

- web obtiene el workspace desde `getPreferredWorkspaceForRender`;
- mobile obtiene el workspace desde `useEntitlements()`/contexto validado;
- la API móvil vuelve a validar el workspace server-side;
- la caché RN incluye workspace en su key;
- no permitir mezclar pools;
- añadir tests negativos de scope.

### Paso 3 — Corregir cancelación RN

En:

```txt
apps/mobile/app/alumno/nutrition-v2/index.tsx
```

`load()` crea un `AbortController`, pero devuelve una función de cleanup desde una función async. Ese retorno no es usado por `useEffect`, por lo que no existe cancelación real al desmontar.

Mover el controller al efecto o a un `useRef`, abortar en cleanup y evitar `setState` después del desmontaje.

### Paso 4 — Cerrar Tanda 4

- pruebas de read models;
- pruebas de gateways web/RN;
- offline replay;
- conflictos/idempotencia;
- métricas de requests y payload;
- documentación final de Tanda 4.

### Paso 5 — Cerrar Tanda 5

- actualizar y probar importador;
- importar lote piloto de 20–50 productos Chile;
- subir imágenes/ilustraciones permitidas;
- validar búsqueda y GTIN;
- E2E scanner PWA/RN;
- medir egress;
- documentar licencias/procedencia.

---

## 5. Reglas de Supabase

Supabase contiene usuarios reales.

### Permitido

- `CREATE TABLE`, `ADD COLUMN`, nuevos índices y nuevas funciones versionadas.
- Policies nuevas y grants explícitos.
- Migraciones idempotentes cuando sea razonable.
- Tests dentro de `BEGIN ... ROLLBACK`.

### Prohibido sin aprobación específica

- borrar o renombrar tablas/columnas legacy;
- reescribir historial antiguo;
- backfill masivo en una sola operación;
- activar V2 para todos;
- modificar datos reales para probar;
- exponer service role en cliente;
- habilitar RPCs `SECURITY DEFINER` para `anon`;
- publicar imágenes sin licencia/procedencia.

### Estado actual de datos V2

Al momento del handoff:

```txt
nutrition_plans_v2:                 0
nutrition_plan_versions_v2:         0
nutrition_day_snapshots_v2:         0
nutrition_v2_audit_log:              0
nutrition_intake_entries V2:         0
foods total:                       344
foods con barcode:                   0
foods country_code=CL:               0
food_media:                           0
food_catalog_import_batches:         0
food_catalog_missing_codes abiertos: 0
```

Esto significa que el esquema existe, pero no hay rollout real ni catálogo piloto.

---

## 6. Política de builds Vercel

Juan paga Vercel Pro y pidió reducir Build CPU Time.

Regla:

- desarrollar y corregir localmente;
- agrupar dos tandas o un bloque completo;
- ejecutar lint/typecheck/tests antes de push;
- un único push final;
- un único Preview Vercel.

Durante este handoff se usó temporalmente:

```json
"ignoreCommand": "exit 0"
```

Antes de continuar, verificar el estado actual de `vercel.json`. No dejar la pausa permanentemente sin documentarlo y no quitarla hasta que el bloque esté listo para una sola build.

---

## 7. Definition of Done mínimo por bloque

Un bloque no está terminado solo porque compile.

Debe incluir:

- lint;
- typecheck web;
- typecheck RN;
- Vitest;
- token parity;
- SQL rollback tests;
- pruebas de RLS/BOLA;
- E2E de flujos tocados;
- claro/oscuro;
- responsive/desktop;
- white label;
- loading/empty/error/offline/permission;
- reduced motion;
- accesibilidad básica;
- medición de requests/payload;
- documentación actualizada;
- un solo Preview Vercel al cierre.

---

## 8. No hacer

- No hacer merge del PR #121.
- No cambiar la base del PR.
- No convertir el PR a ready for review.
- No activar rollout global.
- No reemplazar todavía las rutas V1.
- No borrar componentes V1.
- No crear una segunda fuente de intake.
- No guardar macros históricos inventados.
- No añadir React Query/SWR u otro state manager global sin necesidad demostrada.
- No instalar un SDK comercial de barcode.
- No añadir Open Food Facts como llamada de runtime.
- No declarar Tanda 4 o 5 cerradas mientras existan los bloqueos registrados.

---

## 9. Resultado esperado del siguiente agente

La siguiente entrega correcta debería dejar:

1. CI completamente verde.
2. Gate profesional con workspace correcto en web y RN.
3. Cancelación RN real.
4. Tanda 4 validada y documentada.
5. Lote piloto Chile en staging o importado bajo aprobación.
6. Scanner probado en dispositivo y PWA.
7. Un único Preview Vercel estable.
8. PR #121 aún draft y sin merge.
