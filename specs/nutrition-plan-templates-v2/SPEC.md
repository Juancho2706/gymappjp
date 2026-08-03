# SPEC — Plantillas de plan V2 y rescate de las V1 (F3)

Fecha: 2026-08-03 · Origen: plan maestro de Nutricion F2-F5 (decisiones CEO del 2026-08-03).

## Problema

1. **No se puede empezar un plan sin alumno.** El `+` del Centro V2 (`NewPlanPickerButton`) SIEMPRE
   exige elegir un alumno antes de abrir el builder, y `nutrition_plans_v2.client_id` es `NOT NULL`.
   Un coach que todavia no tiene alumnos ve un callejon sin salida; uno que si los tiene arma cada
   plan desde cero o abre un alumno cualquiera para "usarlo de borrador".
2. **No se puede reutilizar.** Solo se copia entre dias del MISMO plan. No hay forma de decir
   "este plan de definicion me sirvio, hazme otro igual para este otro alumno".
3. **Se perdieron 33 plantillas reales.** V1 (`/coach/nutrition-plans`) SI tenia `TemplateLibrary`,
   pero `nutrition-v2-swap.ts:9` redirige a V2 a todo coach standalone y team (solo Enterprise
   conserva V1). Verificado en LIVE el 2026-08-03: **33 plantillas / 142 comidas de 4 coaches**
   quedaron inaccesibles — jotap-coach 17, **joaquinamr7 10 (coach real, ultima el 08-jul)**,
   josefit 5 (QA), mindgym 1 (sin comidas).

## Alcance

### AD-2 (decidida) — la plantilla NO es un plan fantasma

`nutrition_plans_v2.client_id` sigue `NOT NULL`. La plantilla vive en su propia tabla y guarda el
**draft serializado** que el builder ya sabe producir (`draft-builder.ts`) y rehidratar
(`rehydrate.ts`), con `schema_version`.

- **DESCARTADO**: relajar `client_id` a nullable. Media docena de RPC y read-models asumen que un
  plan tiene alumno; un plan sin dueno se colaria en snapshots, adherencia y gates.
- La plantilla guarda el draft **sin identidad**: sin `planId`, sin `versionId`, sin `clientId` y
  **sin los ids** de variantes, franjas, items y targets. Si los conservara, el builder intentaria
  actualizar filas de OTRO plan al persistir.
- `effectiveFrom` tampoco viaja: una plantilla no tiene fecha de entrada en vigor.

### AD-3 (decidida) — una sola puerta al builder

`/coach/nutrition-v2/[clientId]/builder?from=template:<id>` o `?from=plan:<id>`.
El modal del `+` gana dos pestañas (**Desde cero** / **Reutilizar**) y ambas terminan en esa URL.
Sin esta unificacion habria dos caminos de creacion que divergen en cada cambio del builder.

### Superficies

1. **Guardar como plantilla** desde el builder (borrador en pantalla) y desde un plan publicado.
2. **Modal de dos pestañas** en el `+` del Centro V2.
3. **Biblioteca** en el Centro V2: nombre, macros de referencia, cuantos planes salieron de ella,
   favorita, y las acciones renombrar / eliminar.
4. **Importador one-shot de las 33 V1**, con dry-run y reporte por coach. **NO borra las V1.**

### Fuera de alcance

Plantillas compartidas entre coaches distintos o marketplace · plantillas SMAE/INTA precargadas ·
versionado de plantillas · paridad RN (es F4) · retiro de las tablas V1 (es F5).

## Gating

Sin gate comercial nuevo: hereda el permiso de nutricion (decision CEO).

## Estructura V1 y por que no traduce 1:1

`nutrition_plan_templates` (macros objetivo + instrucciones) + `template_meals` +
`template_meal_groups`. El modelo V2 es franjas (`mealSlots`) con items normalizados y targets por
franja. El importador reusa el mapeo ya escrito y probado de `scripts/nutrition-v2-conversion`
(el mismo que convirtio los planes V1 en julio), no inventa uno nuevo.

Reglas del importador:
- **Idempotente** por `legacy_template_id`: correrlo dos veces no duplica.
- Plantilla V1 **sin comidas** (mindgym) se importa igual, con su dia base vacio y una nota: el
  coach le puso nombre y macros, y esa intencion es suya.
- **Dry-run obligatorio** antes de escribir, con reporte por coach.
- Avisar a **joaquinamr7** cuando esten rescatadas.

## Seguridad

- Owner de la plantilla: `coach_id` (F3 escribe siempre coach-scoped, igual que F1/F2). Las
  columnas `team_id` / `org_id` existen para que el pool y la org las usen sin migrar de nuevo.
- RLS: lectura de lo propio + del team activo + de la org donde el actor es miembro activo.
  Escritura solo sobre lo propio. El alumno NO tiene ninguna policy: una plantilla es material
  interno del coach.
- El `draft` es JSON **client-controlled**: se valida con Zod en el boundary servidor ANTES de
  guardar y OTRA VEZ al rehidratar. Nunca se confia en lo que se guardo.
- Rehidratar exige que el actor sea coach del alumno destino: el `clientId` sale de la URL y se
  valida con el mismo `authorizeCoach` del builder.

## Criterio de aceptacion

- Un coach guarda su plan de definicion como plantilla, abre el `+`, pestaña "Reutilizar", elige la
  plantilla, elige el alumno y el builder abre con todo cargado y sin ids del plan original.
- Publicar ese plan no toca el plan del que salio la plantilla.
- joaquinamr7 entra a la biblioteca y ve sus 10 plantillas con sus comidas.
- Correr el importador dos veces deja 33 plantillas, no 66.
- Gates verdes + tests de contrato, servicio, actions e importador.
