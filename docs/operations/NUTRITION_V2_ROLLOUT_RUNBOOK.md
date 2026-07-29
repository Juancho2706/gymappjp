---
status: active
owner: engineering
last_verified: "2026-07-28 @ 0fbf850d"
canonical: true
---

# Nutrición V2 — operación y rollback

El último rollout registrado dejó Nutrition V2 en `mode=on`. Antes de operar o declarar su alcance, comprobar el valor vivo de `NUTRITION_V2_ROLLOUT`; este documento ya no es un plan de canary.

El estado general del proyecto se registra en [CURRENT.md](../status/CURRENT.md). Este runbook solo explica cómo comprobar, apagar y recuperar la superficie.

> **Limitación vigente en producción:** `mode=off` controla entrada, configuración y rutas que
> consultan el gate, pero no contiene por sí solo todas las escrituras coach mobile directas.
> El cierre de [NUT-005](../audits/nutricion-v2-coach-alumno-2026-07-28.md) está implementado en
> esta rama (endpoint `/api/mobile/nutrition-v2/coach/mutate` + retiro de las escrituras Supabase
> directas del camino coach RN), pero solo rige cuando (a) la web esté deployada, (b) las
> migraciones nuevas `202607281*` estén aplicadas y (c) la app móvil corra la versión
> actualizada. Hasta entonces, no declarar rollback completo sin probar el rechazo real de una
> mutación con JWT técnico.

## Fuentes de verdad

- Contrato: `packages/nutrition-v2/rollout.ts`.
- Resolución web: `apps/web/src/services/nutrition-v2-rollout.service.ts`.
- Config móvil: `apps/web/src/app/api/mobile/config/route.ts`.
- Defaults móviles: `apps/mobile/lib/flags.ts`.
- Cache móvil: `apps/mobile/lib/entitlements-core.ts`.
- Clave de Vercel Edge Config: `NUTRITION_V2_ROLLOUT`.

Si `EDGE_CONFIG` falta, la lectura falla o el payload no valida, el servidor resuelve V2 como apagado.

## Configuración normal

```json
{
  "mode": "on",
  "clientIds": [],
  "coachIds": [],
  "teamIds": [],
  "orgIds": [],
  "surfaces": {
    "webStudent": true,
    "webCoach": true,
    "mobileStudent": true,
    "mobileCoach": true
  }
}
```

`mode=on` habilita únicamente las superficies marcadas `true`. No usar allowlists como control adicional en este modo.

## Comprobación de salud

Validar con cuentas técnicas, nunca con datos personales copiados a logs:

1. Alumno web abre Hoy, Plan e Historial V2.
2. Coach web abre hub, ficha y editor/publicación.
3. Alumno móvil recibe `nutritionV2Student=true` desde `/api/mobile/config`.
4. Coach móvil recibe `nutritionV2Coach=true` para el workspace activo.
5. Standalone y Teams solo muestran alumnos de su scope activo.
6. Un `clientId` ajeno no habilita ni devuelve datos.
7. Registrar y corregir intake no duplica entradas al reintentar.
8. Scanner conocido/desconocido responde y muestra atribución cuando la fuente lo exige.
9. Sentry y logs de Vercel no muestran un aumento de errores de read models o mutations.

## Rollback inmediato

Usar ante pérdida/duplicación de intake, fuga de scope, errores P0/P1 generalizados o imposibilidad de operar el builder.

1. Guardar hora UTC, SHA desplegado, superficie, workspace técnico y request/error ID.
2. En Edge Config, reemplazar `NUTRITION_V2_ROLLOUT` por:

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

3. Comprobar con una sesión nueva que web vuelve a la superficie legacy/fallback prevista.
4. En móvil, enviar la app a background y abrirla para forzar la revalidación. Logout/login también limpia la configuración local.
5. Considerar que el cache global móvil puede conservar flags de rollout hasta 24 horas si el dispositivo permanece offline. Con red, la app revalida al iniciar, recuperar sesión y volver a foreground.
6. Ejecutar una mutación técnica controlada y verificar rechazo server-side aunque la UI conserve
   el flag. En el corte auditado, algunas escrituras coach directas pueden seguir aceptándose: si
   ocurre, el rollback es **parcial**, el incidente sigue abierto y requiere contención
   server-side revisada antes de declarar éxito.
7. Revisar la cola offline y el riesgo de doble toque antes de volver a encender; una nueva clave
   idempotente representa hoy otra operación y puede duplicar intake.

No hacer durante el rollback:

- borrar intake, planes o versiones;
- revertir migraciones aditivas a mano;
- editar historial de batches;
- cambiar RLS como mitigación rápida;
- desplegar código antes de confirmar que el flag contuvo el incidente.

## Recuperación

1. Reproducir con una cuenta técnica y agregar una prueba de regresión.
2. Corregir en rama y pasar lint, typecheck, Vitest y gates focalizados.
3. Desplegar una sola preview agrupada.
4. Si el riesgo lo justifica, usar temporalmente `mode=canary` con una superficie y IDs técnicos explícitos.
5. Probar rollback nuevamente.
6. Volver a `mode=on` solo sin P0/P1 abiertos.
7. Registrar resultado y decisión en [CURRENT.md](../status/CURRENT.md), no como una bitácora dentro de este runbook.

## Canary excepcional

`mode=canary` sigue soportado para recuperar una superficie de forma acotada:

- habilitar solo la superficie bajo prueba;
- agregar IDs internos explícitos;
- probar separación standalone/team;
- vaciar allowlists al terminar;
- no dejar un canary sin dueño ni fecha de salida.

## Señales mínimas

- tasa de error y latencia de read models;
- éxito, rechazo e idempotencia de mutations;
- cola móvil pending/sent/terminal;
- fallbacks o flags apagados inesperados;
- errores por scope/BOLA;
- sesiones afectadas y duración del incidente.

No registrar contenido nutricional, notas privadas, tokens ni identificadores personales innecesarios.
