---
status: done
owner: product-engineering
last_verified: "2026-09-10"
canonical: false
---

# TESTING-QA — Señales honestas para el coach

Ver [SPEC](SPEC.md) · [PLAN](PLAN.md) · [TASKS](TASKS.md). **Ningún checkbox se marca sin gate real o QA del owner.**

Rutas verificadas contra `D:/Proyectos/Antigravity/gymappjp`, rama `rnmobiledenuevo`, HEAD `f93378c3`.

El runner declara cuatro *projects* (`vitest.config.ts`): `web-node` (`apps/web/src/**/*.test.ts`, `tests/**/*.test.ts`, `packages/**/*.test.ts`, excluye `tests/mobile/**`), `web-dom`, `mobile-node` (`tests/mobile/**/*.test.ts`) y `mobile-dom`. **`apps/mobile/**` no está en ningún `include`**: ningún test de este tren se escribe ahí. El aislamiento se hace por ruta (`pnpm exec vitest run <archivo>`) o por project (`--project mobile-node`), nunca con `--filter`.

## Tests automatizados

| # | Ruta | Qué prueba | Ejemplo a copiar | Gate |
|---|---|---|---|---|
| N1 | `apps/web/src/app/coach/clients/_lib/client-status.test.ts` (**ampliar**) | Chip: 7 d exactos ⇒ `key: 'entered'`, `Entró hace 7 d`; 8 d ⇒ `key: 'active'`, `Activo`; 8 d + `forcePasswordChange: true` ⇒ igual `active` (la rama `firstLoginAt` gana antes que el cutover); el caso de 30 d de `:91-98` se parte y pasa a esperar `Activo` | el propio bloque `getClientStatusMeta · con first_login_at` (`:60-117`), mismo `base`/`NOW` | `pnpm exec vitest run apps/web/src/app/coach/clients/_lib/client-status.test.ts` |
| N2 | `tests/mobile/directory-status.test.ts` (**ampliar**) | Espejo exacto de N1 sobre `statusMeta`; el assert de 30 d vive en `:111-114` | el propio archivo (usa `vi.doMock` por path absoluto de `lucide-react-native`, cabecera `:1-13`) | `pnpm exec vitest run --project mobile-node tests/mobile/directory-status.test.ts` |
| N3 | `tests/mobile-coach-client-detail-logic.test.ts` (**ampliar**) | `activePlanNutritionComplianceForDay(..., null) === null` (sin plan) y `=== null` sin comidas aplicables hoy; un 0 REAL (plan activo, comidas aplicables, ninguna completada) sigue `0`; `resolveNutritionSignal` con la matriz de 4 casos (dominio on/off × con/sin plan) | el propio archivo (`:49-61`, `:90-98`), import relativo `../apps/mobile/lib/coach-client-detail-logic` | `pnpm exec vitest run tests/mobile-coach-client-detail-logic.test.ts` |
| N4 | `tests/mobile/coach-dashboard-agenda.test.ts` (**nuevo**) | `mapApiDashboard` conserva `dueAt`/`days`/`severity`/`agendaTotal`; el fallback local (bloque `const agenda: MobileAgendaItem[]` de `coach-dashboard.ts`, hoy `:1115-1130`) produce **los mismos strings** que `buildAgendaLabel` para los tres `kind`, incluida la fecha corta: el fallback formatea con `shortDayMonthEs` del package (R22) y **sin `Intl`/`toLocaleDateString`**, así que «Sin entrenos desde el 2 sept · 8 d» sale idéntico al string que manda el servidor; **`agendaTotal` se cuenta antes de los `slice`** (R17): fallback con 9 riesgos ⇒ `agendaTotal: 9` y 8 filas en la lista (el total nunca se calcula sobre `topRiskClients`, que ya viene cortado en 5) | `tests/mobile/coach-dashboard-deltas.test.ts:13-30` (cabecera con `createRequire` + `vi.doMock` por path absoluto + `import()` dinámico) | `pnpm exec vitest run --project mobile-node tests/mobile/coach-dashboard-agenda.test.ts` |
| N5 | `packages/profile-analytics/agenda-label.test.ts` (**nuevo**) | `agendaSeverity` en los bordes 6/7/13/14 y con `null`; `daysSince(dueYmd, todayYmd)` por día calendario de Santiago (ayer = 1 aunque hayan pasado < 24 h), **incluida la ventana 21:00–00:00 de Chile**: con el proceso en UTC ya es el día siguiente, y aun así `daysSince('2026-09-02', '2026-09-10')` tiene que dar `8` y no `9` (por eso la función recibe YMD y nunca `new Date()` ni `startOfLocalDay`); `buildAgendaLabel` por `kind`, con y sin fecha, y las tres variantes de `programa_vence` (`vence en N d` / `vence hoy` / `venció hace N d`); `programSeverity` en sus tres bordes: `0 ⇒ danger`, `3 ⇒ warning`, `4 ⇒ none`; **`shortDayMonthEs('2026-09-02') === '2 sept'`** (sin punto, sin cero a la izquierda) y la tabla `SHORT_MONTHS_ES` del package es **idéntica entrada por entrada** a la de `apps/web/src/lib/date-utils.ts:163` (12 meses, septiembre = `sept`), de modo que servidor y fallback RN imprimen el mismo string y ninguno usa `Intl` | `packages/profile-analytics/top-alert.test.ts` (tabla de casos de una función pura) | `pnpm exec vitest run packages/profile-analytics/agenda-label.test.ts` |
| N6 | `apps/web/src/app/coach/dashboard/_data/dashboard.queries.test.ts` (**ampliar**) | `buildAgendaFromPulse` (**hoy es privada**: `dashboard.queries.ts:341` la declara sin `export` y el test importa solo `{ getCoachDashboardDataV2, splitRiskClients }` en `:126`; el carril C tiene que exportarla primero — SPEC R5.1 y TASKS C2 — o este gate se cae en el primer run): orden por urgencia `danger → warning → none`, `total` distinto de `items.length` cuando hay más de 8, una sola fila por alumno con ambos flags (`else if`) | el propio archivo: `pulseRow(...)` y el `describe('splitRiskClients …')` (`:128-155`) | `pnpm exec vitest run apps/web/src/app/coach/dashboard/_data/dashboard.queries.test.ts` |
| N7 | `tests/mobile-directory-nutrition-gate.test.ts` (**nuevo**) | `nutritionLowCountFor(rows, nutritionEnabled)` da `0` con el dominio apagado y el conteo por flag con el dominio encendido; la lista de tiles del resumen pierde `Nutri.` con el flag en `false` | `tests/mobile-directory-pulse-parity.test.ts:16-28` (`vi.doMock` + `import()` dinámico porque `clients-directory.ts` arrastra RN) | `pnpm exec vitest run tests/mobile-directory-nutrition-gate.test.ts` |
| N8 | `apps/web/src/services/dashboard-attention-nutrition.test.ts` (**nuevo**) | `calculateAttentionScore` (`dashboard.service.ts:73`) con `nutritionCompliance: null` ⇒ sin `NUTRICION_RIESGO` y sin los 20 puntos; con `0` ⇒ flag y puntos; el helper exportado de A24b, `nutritionComplianceFromAdherence(perDay, summary)` (nombre canónico, R18), devuelve `null` cuando **ningún día del rango tuvo comidas aplicables** (`perDay.some(d => d.applicableMeals > 0) === false`) ⇒ ese `null` entra a `calculateAttentionScore` y el alumno queda **sin `NUTRICION_RIESGO`**; con al menos un día de `applicableMeals > 0` y cero completadas devuelve `0` (flag legítimo). **Nota (R15):** el pulse de nutrición lee SOLO tablas V1 (`daily_nutrition_logs`/`nutrition_meal_logs`), congeladas; el `null` es el que borra el falso positivo de todo alumno que registra en V2 o no tiene plan. Efecto aceptado: un alumno con plan V1 y cero registros en 35 d deja de llevar el flag de nutrición | `apps/web/src/services/feature-prefs.service.test.ts` (test de servicio puro en `web-node`) | `pnpm exec vitest run apps/web/src/services/dashboard-attention-nutrition.test.ts` |

**Regresión que debe seguir verde y no se toca**: `packages/profile-analytics/top-alert.test.ts` (contrato `null` en `:38-53`), `tests/mobile-directory-pulse-parity.test.ts` (el gate del filtro vive en presentación, `filterClients` no se toca), `tests/mobile/domain-guard.test.ts` (fail-OPEN), `tests/mobile/client-tabs.test.ts`, `packages/profile-analytics/client-status.test.ts`.

**Gotcha del reloj**: `packages/profile-analytics/overview.test.ts` usa `toISOString()` (UTC) contra una ventana en hora local; entre las 21:00 y medianoche de Chile se pone rojo por sí solo. No sirve como veredicto de este tren si no se tocó esa lógica.

## Checklist de QA en device del owner

Se corre con la OTA 1.1.2 aplicada (RN) y con el deploy web READY. `[ ]` pendiente · `[x]` verificado con evidencia (fecha + quién). Cualquier ítem rojo vuelve al carril, no se negocia en la sesión.

> **Resultado 2026-09-10 (tarde, hora de Chile): Q1–Q24 VERDES — QA del owner** sobre RN con la OTA 1.1.2 `a95c9e11` (android) / `bd329833` (ios) y web `dpl_EjxDinR2…` (`master` = `27132cb9`). Aprobación explícita del owner en sesión («el último QA que me diste … está aprobado», confirmado como el tren completo Q1–Q24, incluidos Q23–Q24 en web). Ningún ítem volvió al carril. **SDD `done`.** Queda solo E9 (aviso a Movens, lo manda el owner).

### Agenda — home del coach (RN iOS y web desktop)

- [x] **Q1** La sección se llama **Pendientes de hoy** y ninguna fila muestra hora. No aparece «0 de N hechas» en ningún lado.
- [x] **Q2** Un alumno sin entrenos hace días muestra la fecha real: «Sin entrenos desde el 2 sept · 8 d». Cruzar contra la ficha del alumno: la fecha del subtítulo es la del último entreno, no una inventada.
- [x] **Q3** Un alumno que nunca registró entrenos muestra «Todavía no registra entrenos» (sin fecha, sin «· 0 d»).
- [x] **Q4** El contador del header dice «N pendientes» con el total real y coincide con la cantidad de filas cuando hay 8 o menos. Con un solo pendiente dice «1 pendiente». **Cuenta filas, no alumnos únicos** (R14): un alumno que tiene programa por vencer **y** además está sin entrenos aporta **2 pendientes** (dos filas, dos motivos distintos) y eso es lo esperado, no un bug.
- [x] **Q5** Con más de 8 pendientes: se ven 8 filas y una última «y N más en Alumnos»; tocarla abre el directorio. El header sigue mostrando el total, no 8.
- [x] **Q6** Orden por urgencia: el de arriba es el más grave (más días sin entrenar / programa vencido), no el primero de la lista vieja. La tarjeta de prioridad (NBA) manda al **mismo** alumno que encabeza la lista. Cambio de destino esperado respecto de antes del deploy. Su botón dice exactamente **«Ver pendientes»** (web y RN) y en RN la descripción es la canónica de R21: **«Alumnos sin entrenos, sin check-in o con programa por vencer.»** — en la web `PriorityCard` no tiene descripción, ahí solo cambia el CTA.
- [x] **Q7** Punto de color: gris hasta 6 d, ámbar de 7 a 13 d, rojo desde 14 d. Un programa que vence en 2 d es ámbar; uno vencido, rojo.
- [x] **Q8** Programa por vencer: el subtítulo dice `«{nombre del programa}» vence en 2 d` — el nombre entre comillas angulares y sin la palabra «Plan» adelante.
- [x] **Q9** Coach sin pendientes: se ve «Todo al día» con «Sin pendientes hoy.» y la tarjeta de prioridad no ofrece «Ver pendientes».
- [x] **Q10** Modo avión / sin señal (fallback local de RN): la lista sigue mostrando los mismos textos que con red, sin «Adherencia critica - sin ejercicio en 7 dias». La fecha corta se imprime **igual carácter por carácter** que con red («2 sept», sin punto): fallback y servidor usan el mismo `shortDayMonthEs` del package (R22), ninguno usa `Intl`.

### FAB «Nuevo alumno» (solo RN)

- [x] **Q11** iPhone con barra gestual (sin botón Home): en Alumnos, el FAB queda **arriba** de la cápsula flotante, con espacio visible entre ambos, sin solaparse.
- [x] **Q12** Android con navegación de 3 botones (`insets.bottom` chico o 0): el FAB no queda pegado al borde ni flotando demasiado alto.
- [x] **Q13** Al scrollear la lista, la cápsula pasa a modo mini: el FAB se mantiene estable y no se re-superpone. Al llegar al final de la lista, el último alumno sigue siendo legible.

### Chip «Entró hace X d» (directorio, RN y web)

**Cómo se prueba este bloque.** `clients.first_login_at` la sella el login real una sola vez y **D2 prohíbe tocar la columna**, así que no se fabrican alumnos de 6/7/8 d: los bordes 6/7/8 los cubren N1 y N2 con reloj inyectado (son el veredicto de esos números) y el device solo confirma el caso de 8 d o más, que ya existe con datos reales en Movens (**solo lectura**). Ítems 14–16 = observación, nunca escritura.

- [x] **Q14** Alumno con menos de 8 días desde su primer ingreso (si aparece uno vivo en la cuenta de prueba o en Movens): el chip dice «Entró hace N d» con la N correcta. Si no hay ninguno, este ítem se marca **N/A** y queda cubierto por N1/N2.
- [x] **Q15** Alumno con 8 días o más: en la ficha de la lista **no se ve pill de estado**, ni en RN ni en la web — los dos `DirRowCard` gatean igual con `st.key !== 'active'` (web `apps/web/src/app/coach/clients/DirRowCard.tsx:191`, SPEC R2.6). No se busca un «Activo» en la tarjeta: ahí no lo hay.
- [x] **Q16** Tabla densa de **RN** (vista compacta de Alumnos, `apps/mobile/app/coach/(tabs)/clientes.tsx:258-261`): la columna de estado del alumno de 8 d dice «Activo». Aceptado y esperado: ahí siempre se pinta texto, sin gate por key.
- [x] **Q16b** Tabla densa de la **web** (`apps/web/src/app/coach/clients/DirTableMobile.tsx:200-207`, ancho angosto del directorio): misma píldora «Activo» para ese alumno. Es el único lugar de la web donde el label se ve, porque tampoco gatea por key.
- [x] **Q17** Alumno con `first_login_at` **vacío** (nunca entró) y `force_password_change` en true: sigue mostrando «Todavía no entró» / «Todavía no cambió su clave» — el chip nuevo no se comió ese estado. La condición de `first_login_at IS NULL` es indispensable: si la columna tiene fecha, la rama `firstLoginAt` gana antes que el cutover (`apps/web/src/app/coach/clients/_lib/client-status.ts:109-117` vs `:118-131`; espejo RN en `apps/mobile/components/coach/directory/directory-shared.ts:110-111` vs `:113-119`) y el ítem no prueba nada. Archivado y Pausado tampoco cambian.

### Nutrición (RN, matriz 4 casos × 3 superficies)

- [x] **Q18** **Dominio ON · con plan activo** — Ficha: anillo «Nutrición» con % real y delta; el banner superior aparece solo si el cumplimiento de hoy es < 60 %; píldora «Nutrición en riesgo / en track» presente; chip «Comidas hoy N/M · X % plan» en el hero; pestaña Nutrición visible. Home: el detalle por alumno tiene los dos tabs (Adherencia y Nutrición). Directorio: pill de nutrición en la fila, tile «Nutri.» con su conteo y filtro «Nutrición baja (<60%)» disponible.
- [x] **Q19** **Dominio ON · sin plan activo** — Ficha: el anillo **está** pero en gris con «—» y el texto **Sin plan vigente**, sin delta; **no** hay banner «Solo completó el 0 % de sus comidas»; **no** hay píldora de riesgo; el chip «Comidas hoy» no dice «0 % plan». Home: el alumno no aparece en el tab Nutrición. Directorio: sin pill y no suma al contador «Nutri.».
- [x] **Q20** **Dominio OFF** (Funciones → apagar Nutrición) **· con y sin plan** — Ficha: el anillo **desaparece** y quedan solo Entreno y Check-in; cero rastro de nutrición en Resumen y hero; la pestaña Nutrición ya no está. Home: el detalle por alumno queda con un solo tab (Adherencia) y sin el switcher. Directorio: sin pill, sin tile «Nutri.» (grilla de 3), y en la **tabla densa RN** (`DenseDirectoryTable`, `apps/mobile/app/coach/(tabs)/clientes.tsx:177`) no se ve el ícono `Apple` de nutrición en ninguna fila (`:269`), porque la tabla recibe la prop `nutritionEnabled` desde el screen (R16).
- [x] **Q21** **Filtro con el dominio apagado**: activar «Nutrición baja (<60%)» con Nutrición encendida, ir a Funciones, apagar el dominio y volver al directorio ⇒ la opción ya no está en el sheet de filtros y la lista volvió a «Todos» (no queda un filtro fantasma con 0 resultados).
- [x] **Q22** **Foco del home con el dominio apagado**: ningún alumno de la lista de prioridad muestra «Nutricion en riesgo» como motivo. Con el dominio encendido y alumnos sin plan tampoco (el flag dejó de nacer en el servidor).
- [x] **Q23** **Web, ficha del alumno con el dominio apagado**: el anillo de Nutrición no se pinta (quedan dos) y, con el dominio encendido pero sin plan vigente, el texto bajo el anillo dice **Sin plan vigente** con mayúscula inicial.

### Web — hidratación

- [x] **Q24** Abrir `/coach/dashboard` en **Safari iOS** y en Chrome desktop con la sesión de un coach de prueba: la agenda pinta las fechas cortas **igual en ambos** («2 sept», sin punto — la tabla `SHORT_MONTHS_ES` de `apps/web/src/lib/date-utils.ts:163` copiada al `shortDayMonthEs` del package, R22) y la consola no muestra el error de hidratación de React (#418/#423). Es el gotcha `EVA-NEXTJS-18`: `AgendaCard` no usa `Intl`, la fecha llega formateada del servidor con ese mismo helper.

## Cuentas y datos para probar

- **Movens (`movens`) es solo lectura.** Su ficha, su directorio y su home se miran para confirmar los cuatro arreglos con datos reales (9 alumnos activos, ninguno con plan de nutrición, `coach_feature_prefs` con nutrition apagada), pero **no se escribe nada** en su cuenta: ni crear alumnos, ni registrar entrenos, ni tocar sus Funciones. Los nombres de sus alumnos no se copian a ningún documento ni a ningún ticket.
- **Para escribir**, usar las cuentas de prueba del owner y los fixtures permanentes de `docs/testing/E2E_PERSONAS.md` (aliases `soloCoach` / `soloAlumno` para el flujo standalone, `teamCoach` para pool). Ese documento omite deliberadamente correos, UUIDs y contraseñas: los aliases vivos son la matriz del propio `E2E_PERSONAS.md:24-30` y el seed `scripts/seed-e2e-personas.mjs` (que **apunta a producción** con doble gate, `:5-13`); los secretos llegan por variables de entorno (`E2E_PERSONAS_PASSWORD`, `E2E_PERSONAS.md:44`), nunca por este archivo. Ojo: `E2E_PERSONAS.md:15` sigue apuntando a `tests/separation/personas.ts`, **archivo que no existe en el repo** (`git ls-files tests/separation` vacío) — trazabilidad rota heredada, no se usa como puntero acá.
- **Datos que hay que fabricar** en la cuenta de prueba, porque Movens no los tiene: un alumno con plan de nutrición activo (para Q18) y un coach con más de 8 pendientes simultáneos (para Q5). **No** se fabrica `first_login_at`: ver la nota del bloque del chip (D2 prohíbe tocar la columna; Q14–Q16 se observan sobre datos que ya existen y los bordes los cubren N1/N2).
- **Apagar y prender el dominio** se hace en Funciones del coach de prueba (`/coach/settings/funciones` en RN): el guardado refresca los entitlements en el acto, así que el efecto se ve al volver a la pantalla, sin reinstalar.

## Aviso a coaches

Sale después del deploy y la OTA. Destinatario: Movens, que reportó los cuatro puntos el 10-09. Canal: el que el owner elija; **lo manda el owner, nunca la sesión**. Texto canónico (artifact de diagnóstico, §06):

> «Gracias por el detalle, nos sirve mucho. Tres cosas: (1) La agenda no es algo que marcaste: es una lista automática de alumnos que llevan una semana sin registrar entrenos. Las horas eran de relleno, las estamos sacando. (2) El «Entró hace 8 d» es el día en que cada alumno entró por primera vez a la app, no la última vez. La actividad real es el «Hoy» que aparece al lado, y ese sí calza con lo que registraron. Vamos a dejar ese chip solo la primera semana. (3) Lo de nutrición es un error nuestro: apagaste el módulo y la ficha lo sigue mostrando con 0 %. Ya está identificado y sale en la próxima actualización. Te aviso cuando esté.»

Cuando el aviso se mande con el tren ya en producción, cambiar «sale en la próxima actualización» por «ya está en la app» y sumar el cuarto punto (el botón de «Nuevo alumno» que quedaba tapado en iPhone). Registro del envío (fecha, canal, destinatario) se anota acá al cerrar E9.

**Texto final listo para enviar (tren en producción y QA del owner verde el 10-09):**

> «Gracias por el detalle, nos sirve mucho. Cuatro cosas: (1) La agenda no es algo que marcaste: es una lista automática de alumnos que llevan una semana sin registrar entrenos. Las horas eran de relleno, ya las sacamos. (2) El «Entró hace 8 d» es el día en que cada alumno entró por primera vez a la app, no la última vez. La actividad real es el «Hoy» que aparece al lado, y ese sí calza con lo que registraron. Ese chip ahora se ve solo la primera semana. (3) Lo de nutrición era un error nuestro: apagaste el módulo y la ficha lo seguía mostrando con 0 %. Ya está corregido. (4) El botón de «Nuevo alumno» que quedaba tapado por la barra en iPhone ya quedó arriba de ella. Todo esto ya está en la app: si no lo ves, ciérrala del todo y vuelve a abrirla para que tome la actualización.»

Envío: **hecho el 2026-09-10 por el owner** (destinatario: Movens; canal: el del owner, no informado a la sesión). E9 cerrado.

