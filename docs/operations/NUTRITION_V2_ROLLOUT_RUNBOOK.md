# Runbook — rollout de EVA Nutrición V2

**Rama de desarrollo:** `Nuevascosasrnopenai`  
**PR:** #121, draft  
**Supabase:** producción  
**Estado inicial obligatorio:** rollout OFF

Este runbook describe cómo validar y activar Nutrición V2 sin sustituir V1 prematuramente.

---

## 1. Fuentes de verdad

- `packages/nutrition-v2/rollout.ts`
- `apps/web/src/services/nutrition-v2-rollout.service.ts`
- `apps/web/src/app/api/mobile/config/route.ts`
- `apps/mobile/lib/flags.ts`
- `docs/product/nutrition-v2/VALIDATION_RISKS_AND_KNOWN_BLOCKERS_2026.md`

Clave de configuración esperada:

```txt
NUTRITION_V2_ROLLOUT
```

La configuración debe validar contra el schema compartido. Cualquier ausencia, error o payload inválido resuelve OFF.

---

## 2. Forma de configuración

```json
{
  "mode": "off",
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

Modos:

- `off`: todas las superficies V2 cerradas.
- `canary`: solo sujetos incluidos en allowlists y superficies habilitadas.
- `on`: superficie habilitada para todos los sujetos válidos; no usar hasta Tanda 12.

---

## 3. Precondiciones antes de un canary

### Calidad

- [ ] lint verde;
- [ ] typecheck web verde;
- [ ] typecheck RN verde;
- [ ] Vitest verde;
- [ ] token parity verde;
- [ ] SQL rollback tests verdes;
- [ ] E2E de la superficie;
- [ ] Preview aprobado.

### Seguridad

- [ ] Hub/Detail usan RPC scoped;
- [ ] prueba BOLA/IDOR;
- [ ] private notes aisladas;
- [ ] grants revisados;
- [ ] no service role en clientes;
- [ ] analytics sin PII.

### Producto

- [ ] V1 continúa accesible;
- [ ] usuario canary identificado;
- [ ] plan de rollback;
- [ ] soporte informado;
- [ ] métricas definidas.

No activar mientras exista un blocker P0.

---

## 4. Secuencia recomendada

### Etapa 0 — OFF

```txt
mode=off
surfaces todas false
allowlists vacías
```

Usar durante desarrollo y migraciones.

### Etapa 1 — interno web

- cuenta interna/demo;
- `mode=canary`;
- añadir clientId/coachId interno;
- habilitar solo webStudent o webCoach;
- observar 24–48 horas de uso controlado.

### Etapa 2 — interno móvil

- development build, no usuario general;
- habilitar una superficie móvil;
- validar cache, offline, cámara, lifecycle;
- mantener web separada para aislar regresiones.

### Etapa 3 — coach piloto

- un coach explícito;
- alumnos seleccionados;
- soporte directo;
- no habilitar team/org todavía;
- revisar intake, errores y feedback.

### Etapa 4 — EVA Teams

- teamId explícito;
- confirmar workspace scoped;
- probar cambio de workspace;
- verificar que caches no mezclan datos;
- pruebas con coach owner/member.

### Etapa 5 — organización/canary ampliado

Solo después de cerrar paridad y hardening.

### Etapa 6 — rollout general

Corresponde a Tanda 12. Requiere aprobación manual y plan de retiro V1 independiente.

---

## 5. Métricas mínimas

Por superficie:

- sesiones V2;
- éxito/error de read model;
- p50/p95;
- payload bytes;
- requests por apertura;
- intake record/correct success;
- duplicate/idempotent hit;
- offline queue pending/sent/terminal;
- cache fresh/stale/miss;
- scanner found/not-found/invalid;
- fallback a V1;
- error rate;
- Sentry issues.

No registrar contenido sensible.

---

## 6. Smoke manual de alumno

### Web/PWA

1. usuario fuera de allowlist abre V1;
2. usuario canary abre V2;
3. Today carga snapshot correcto;
4. Plan muestra versión vigente;
5. Historial pagina;
6. logout no deja datos visibles;
7. light/dark/white label;
8. móvil responsive;
9. scanner manual/cámara cuando aplique.

### React Native

1. config remota llega después del login;
2. flag local permanece false sin server authorization;
3. Today carga cache y revalida;
4. offline muestra cache;
5. queue se reintenta;
6. cambio de cuenta limpia datos;
7. navegación rápida cancela request;
8. Android/iOS.

---

## 7. Smoke manual de coach

1. standalone solo ve sus alumnos standalone;
2. team solo ve alumnos de ese team;
3. organización solo ve alumnos autorizados;
4. cambiar workspace cambia roster y cache;
5. ficha rechaza clientId fuera de scope;
6. private notes no aparecen al alumno;
7. V1 continúa disponible;
8. Builder permanece cerrado hasta Tanda 9.

---

## 8. Rollback inmediato

Ante error:

1. establecer `mode=off` o apagar la superficie afectada;
2. confirmar que web redirige a V1;
3. confirmar que config móvil apaga flags;
4. no borrar datos V2;
5. no revertir migraciones aditivas a ciegas;
6. capturar error, request ID, SHA, usuario técnico y hora;
7. analizar intake pendiente/offline;
8. corregir en rama y repetir gates;
9. reabrir canary solo con aprobación.

La primera respuesta es apagar el flag, no mutar historial ni eliminar tablas.

---

## 9. Vercel y costos

Juan pidió minimizar Build CPU Time.

- no desplegar cada arreglo;
- agrupar un bloque completo;
- ejecutar validaciones localmente/GitHub Actions;
- un solo Preview al cierre;
- no quitar `ignoreCommand` mientras CI esté rojo;
- después del Preview, revisar build logs una sola vez y corregir localmente de forma agrupada si fuese necesario.

---

## 10. Cierre de canary

Un canary puede ampliarse únicamente cuando:

- no hay errores P0/P1 sin mitigación;
- métricas dentro de budget;
- no hay pérdida/duplicación de intake;
- scopes correctos;
- soporte confirma UX comprensible;
- rollback fue probado;
- documentación actualizada;
- Juan aprueba la siguiente etapa.
