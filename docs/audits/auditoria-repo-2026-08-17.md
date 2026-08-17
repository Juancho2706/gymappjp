---
status: complete
owner: product-engineering
last_verified: 2026-08-17
canonical: false
---

# Auditoría de specs, documentación y repositorio — 2026-08-17

Informe point-in-time. No gobierna decisiones: es evidencia fechada. La verdad vigente sigue siendo
el código, las migraciones aplicadas, el estado remoto y los documentos canónicos de `docs/README.md`.

- **Base auditada**: `0355d67d`, rama `rnmobiledenuevo`, idéntica a `origin/master` (0 adelante / 0 atrás).
- **Método**: doce agentes leyeron las 34 specs del árbol, el proyecto en LIVE y el historial de git;
  una segunda pasada adversarial intentó refutar cada cierre declarado.
- **Regla aplicada**: ningún dato de este informe viene de un documento tomado por cierto. Todo salió
  de una lectura de código, una consulta a la base o `git log`.
- **Versión navegable**: artifact `165595be-7bcc-4eb1-a69d-cc6d536b1ac1` («Los 34 Planes»).

---

## Resumen ejecutivo

| Medición | Valor |
|---|---|
| Specs en el árbol activo | 34, repartidas en dos raíces distintas |
| Archivables hoy sin asterisco | 1 (`nutrition-bulk-mark`) |
| Abiertas con pendiente verificado | 19 |
| Rancias (describen un mundo que ya no existe) | 2 |
| Cierres del 17-08 refutados al verificarlos | 11 de 14 |
| Pendientes operativos vigentes | 23 |
| Worktrees retirables sin perder trabajo | 5 |

Tres conclusiones de fondo:

1. **El cierre masivo `db63dba8` fue optimista.** Ninguno de los cierres refutados falló por código
   faltante: fallaron porque daban por hecho un QA que nadie corrió, o porque dejaban un documento
   canónico afirmando lo contrario de lo que hay en el binario. Un OTA entrega bits, no ejecuta QA.
2. **El retiro del par viejo (`0355d67d`) abrió regresiones que nadie inventarió.** Cerrar las puertas
   del wizard cerró también la puerta de capacidades que solo vivían ahí.
3. **La organización documental tiene una anomalía estructural**: existen dos raíces de specs y ningún
   documento del repo nombra la que realmente se usa.

---

## 1. Verificación adversarial de los cierres del 17-08

El commit `db63dba8` estampó el banner «CERRADA — 2026-08-17» sobre diez specs. Se verificó cada cierre
contra código con instrucción explícita de refutarlo. Resultado: **11 de 14 verificaciones tumbaron el
cierre**. Detalle por spec.

### 1.1 `nutrition-food-hub` — REFUTADA

El código resiste: F6.4 verificado en `apps/mobile/app/coach/nutrition-v2/foods.tsx:148,790` con
`ClassifyFoodSheet` montado y `ClassifyFoodSheet.tsx` consumiendo el módulo puro `planFoodClassification`.
Lo que no resiste es el cierre:

- `docs/status/MOBILE_PARITY.md:187-189` sigue declarando que «el tab Alimentos RN no tiene
  crear/clasificar/filtros». Es falso desde `6c4da722`, `949a1eab` y `a0b976e7` (todos del 11-08) y
  ninguna entrada posterior lo cierra. F6.5 pide exactamente esa actualización.
- QA en device físico del tab Alimentos RN: sin acta. El QA del 17-08 cubrió tablist, Porciones y editor.
- **Clasificar un alimento GLOBAL nunca se probó en ninguna superficie.** Es el camino de escritura más
  riesgoso de la spec y está validado solo por 29 tests unitarios.
- Deuda abierta por F6.0 y nunca saldada: `apps/mobile/lib/food-detail.ts` (128 líneas, encabezado
  literal «Port 1:1 de `apps/web/src/lib/food-detail.ts`») duplica lógica pura fuera de `packages/`.
  Viola la regla no negociable de CLAUDE.md.
- `apps/web/src/app/coach/nutrition-v2/_lib/food-catalog-card.ts` sigue web-only pese a que F6.0 declaró
  que el mapper se compartía.

### 1.2 `nutrition-food-overrides` — REFUTADA

La alcanzabilidad reclamada sí resiste: la cadena `EditorClient → QuickEditPlanView → EditableSlotCard →
EditableItemRow → FoodMacrosOverrideDialog` está viva en web, y su espejo en RN. El override **no** murió
con el retiro del par viejo. Lo que no resiste:

- Tres casillas de QA sin marcar, descartadas con el argumento «está en producción y en el binario». Eso
  prueba despliegue, no verificación, y CLAUDE.md prohíbe declarar QA verde sin evidencia.
- El pendiente tiene **doble asiento independiente**: `docs/specs/nutrition-food-overrides/TASKS.md:95` y
  el bloque T2.1 del programa padre. Dos registros sin marcar en dos archivos no es un checkbox olvidado.
- No existe ninguna acta en la spec (comparar con `nutrition-exchange-swap`, que tiene dos completas).
- **Pendiente de criterio nutricional sobre datos EN LIVE, sin resolver**: «Pan hallulla» y «Pan
  marraqueta» declaran 70 kcal / 15 g de carbohidrato con `serving_size = 50 g`, cuando 50 g de
  marraqueta son ~145 kcal. La base quedó bien etiquetada pero los gramos siguen inflados.
- Contexto para la demolición: el override también está montado en el par viejo
  (`builder/_components/ItemRow.tsx` y `builder/[clientId].tsx` de RN).

### 1.3 `nutrition-exchange-swap` — REFUTADA (severidad baja)

La feature está completa y en producción; `packages/nutrition-v2/swipe-hint.ts` está cableado en las dos
superficies. Lo refutado es la exhaustividad del informe:

- **`docs/status/CURRENT.md:21` sigue diciendo «Decisiones abiertas del QA: H1 y D5».** Las dos se
  cerraron en F8 el 11-08 (web `31fa0631` + OTA `723c92d6` + migración `20260811020826`). Archivar la
  spec ahora deja la única fuente de estado desactualizada y sin la spec al lado para corregirla.
- Dos criterios de aceptación figuran como «⚠️ no reproducible hoy» en el propio TASKS y nunca se
  re-QA-earon: el swipe aplica el primer reemplazo y cicla, y el candado sin afordancia.
- La verificación visual del gesto de arrastre pedida al dueño no tiene constancia.
- Observación abierta del acta device: sin `NetInfo.addEventListener`, el chip «En cola» persiste hasta
  el próximo `load()`.
- 1 alimento global de 4.649 con nombre CJK queda con `name_search` vacío (inbuscable por la vía V2).

### 1.4 `nutrition-week-view` — REFUTADA

Implementada y verificada en las cuatro superficies (paquete `week-view.ts`, alumno web y RN, coach web y
RN con el recorte Pro). Pero:

- **Nunca fue QA-eada, ni web ni device.** La spec no tiene ninguna tarea de QA, así que tener todo en
  `[x]` no prueba nada. La fila que T4.3 creó en `CURRENT.md` (commit `aa292bf1`) decía textual
  «Pendiente: merge, QA visual web y QA física RN». Hoy esa fila ya no existe: **el pendiente se perdió
  por reescritura del documento, no por ejecución.**
- `docs/status/MOBILE_PARITY.md:532` sigue diciendo «(rama `worktree-nutricion-ui-rescate`, sin merge)»
  cuando `9bf856b8` y `61ae0f8f` son ancestros de HEAD desde hace semanas.
- El banner de CERRADA se puso encima de una sección que declara «pendiente ratificación CEO» sobre
  cuatro decisiones de diseño que nunca se ratificaron por escrito.
- Riesgo declarado en el PLAN y nunca evaluado: la semana que cruza cambio de versión del plan; la regla
  «snapshot gana» cubre el 90% y la opción B (`get_nutrition_week_v2`) quedó documentada por si el QA la
  exigía. Sin QA, nadie miró el 10% restante.

### 1.5 `nutrition-authoring-speed` (T2.6) — REFUTADA

F4 porción pegajosa RN sí está cerrada por T3.3b y se verificó en código. La otra mitad es falsa:

- **De F2 solo cruzó el nivel DÍA.** El quick-select «próximos 1/2/4» del menú de la FRANJA existe
  únicamente en `builder/_components/CopySlotMenu.tsx`, cuyo único consumidor es `SlotEditor.tsx:265` —
  el wizard, que perdió todas las puertas en `0355d67d`. La hoja de copiar franja del editor único no lo
  tiene ni en web ni en RN.
- `docs/status/MOBILE_PARITY.md:204-205` declara textual «En el menú de la franja RN falta el
  quick-select», sin entrada posterior que lo cierre.
- Ni la SPEC ni el TASKS registran que ese trabajo quedó inalcanzable: el banner de cierre se puso en
  `db63dba8` sin reconciliar contra `0355d67d`, que es posterior.

### 1.6 `nutrition-editor-cabina` (T3.v) — REFUTADA

W0-W3 verificadas en el árbol. La tarea V5.1 tiene dos mitades y solo se cumplió una: «OTA android
acumulado … luego `eas update:insights`», con DoD «insights sin crashes/failed installs». El OTA está
publicado; **la corrida de insights posterior no existe** — la única registrada es del 15-08, anterior a
los OTAs del 17-08. `CURRENT.md:21` lo declara pendiente y el mismo requisito está en `PLAN.md:115`.

### 1.7 `nutrition-onboarding-tour` (Guía Viva) — REFUTADA

Motor y montajes existen y se verificaron, incluido el test de contrato cruzado web↔RN (vive en
`tests/mobile-nutrition-tour-flags.test.ts`, no bajo `apps/mobile`). Pero
`docs/status/MOBILE_PARITY.md:242` sigue diciendo **«QA en device del tour RN pendiente»**, en
contradicción directa con el cierre de QA que declara `CURRENT.md:21`. G4.2 pide justamente los
canónicos al día, así que no está cumplida hasta reconciliar esa línea.

### 1.8 `nutrition-coach-notes` — REFUTADA

El código está completo punta a punta y se verificó en las cuatro superficies. Lo que falta no es código
sino entrega:

- La feature entró en HEAD `0355d67d` (17-08, 14:27), **después** de las tres rondas de QA del dueño.
- `CURRENT.md:21` declara el OTA acumulado final como pendiente ⇒ **el 📝 del coach y la banda 💬 del
  alumno no están en ningún teléfono.**
- El QA en device del par editor-RN / banda-RN no tiene registro en TASKS ni en MOBILE_PARITY.
- El criterio «tests de render del Hoy» está cubierto solo en web; el render RN no tiene test.

### 1.9 `nutrition-bulk-mark` — CONFIRMADA

Único cierre que resistió la refutación. T1-T9 verificadas: helper puro `packages/nutrition-v2/bulk-mark.ts`
con test, consumido en las dos superficies con sus acciones de registrar y anular por lote.
**Es la única spec archivable hoy sin asterisco.**

### 1.10 `nutrition-ui-poda` — REFUTADA

Todo lo demás verificado (panel de notas privadas montado, selector de día en la ficha RN, gate Pro de
días sobreviviendo al retiro). Falla el punto 3 de la Ola 3, marcado `[x]`:

- El claim **«micronutrientes avanzados» sigue vivo en `packages/module-catalog/catalog.ts:86` y `:89`**,
  y se renderiza hoy en producción en `/coach/settings/modules` (`ModulesForm.tsx:111,126`) y en RN
  (`modules.tsx:108,118`). El último cambio de ese copy es `4c240ab7`, del 17-07, anterior a la spec.
- Choca de frente con la decisión 1 del dueño en la propia SPEC («Micros V1: matar del todo»): la app le
  sigue vendiendo al coach una feature declarada muerta.
- Matiz: la CTA «Personalizar el {día}» de la decisión 10 vive solo en el wizard retirado; conviene
  dejarlo escrito en el banner de archivo.

### 1.11 `eva-seal-background` (Sello v2) — REFUTADA

El núcleo es sólido (`packages/brand-kit/seal.ts` con 22 tests golden, `AppSeal` montado, `AppBackground`
v2 con deriva Reanimated, tokens gobernados por el gate, 308 asserts). Pero:

- **La decisión D2 no está implementada en ninguna plataforma.** La SPEC manda que los overlays de
  trabajo denso lleven `surface-app` + solo grano. En web la rama `isBuilder` de `CoachMainWrapper.tsx:33-45`
  retorna un `<main>` sin ninguna capa —su propio comentario lo admite—; en RN el builder monta el fondo
  completo con blobs (`builder.tsx:283,293`), porque `AppBackground` no expone variante solo-grano.
- Consecuencia verificable: **`AppSeal variant="grain"` tiene cero call sites en la app.** Es código
  muerto nacido de la reversa `fd13886a` sin que nadie reasignara el grano a los builders. Hay que
  decidir si se borra la API o si es el montaje que le falta al builder.
- Documentación falsa que se congelaría al archivar: la SPEC sigue pidiendo grano-solo en el editor
  (`SPEC.md:76` y `:96`), y el mismo texto rancio está en `CURRENT.md` y en un comentario de
  `globals.css:1263-1265`.
- Decisión del dueño declarada abierta en `MOBILE_PARITY.md:252-254` sobre si la familia de entrada RN
  («alumno/onboarding», «change-password») debe ganar Horizonte B implícito.
- Criterio de aceptación parcial: la SPEC exige capturas con tres marcas de prueba; el gate define dos.

### 1.12 `pricing-v2` — REFUTADA

Ver sección 4. El motor se verificó línea a línea y resiste; la Wave D (copy) quedó a medias en doce
superficies y el cerco P7 no cubre el scope team.

### 1.13 `nutrition-multiday` — REFUTADA

El grueso existe y es verificable en las dos superficies. Pero:

- El único checkbox sin marcar dice «QA física Android/iOS» y **iOS jamás recibió este código en device**:
  todos los OTAs del 17-08 fueron android-only por regla vigente.
- Ninguna de las rondas de QA documentadas menciona el flujo multi-día (agregar día, cambiar día,
  duplicar como otro día); los hallazgos registrados son de cabina, tour, sello y roster.
- **La herencia viva de metas por día se perdió.** `targetsMode: 'inherit' | 'custom'` solo existe en las
  superficies retiradas (`draft-builder.ts:291`, `BuilderDayStrip.tsx:199`).
  `packages/nutrition-v2/editor-state.ts` no tiene ese concepto: `ADD_VARIANT` **copia** las metas del
  base al crear el día y después nunca re-sincroniza. Cambiar las metas del base deja los días
  específicos congelados, en silencio. Es un cambio de semántica de producto.
- «Revisar agrupa por día y resalta diferencias vs base» (UX1, marcado `[x]`) no existe en ninguna
  superficie viva: el paso Revisar lo eliminó `nutrition-ui-poda`.
- `docs/status/MOBILE_PARITY.md:109` sigue declarando «QA device del editor RN: PENDIENTE».

### 1.14 `nutrition-plan-templates-v2` — REFUTADA

El stack existe y se verificó. Dos omisiones graves:

- **T5.3 sin hacer**: avisar a `joaquinamr7` que sus 10 plantillas fueron rescatadas. `git grep` devuelve
  solo la SPEC, el TASKS y el SQL del importador — cero evidencia de aviso. La SPEC lo eleva a criterio
  de aceptación: «entra a la biblioteca y ve sus 10 plantillas con sus comidas». El rescate no está
  verificado con el coach real.
- **T4.4 quedó sin puerta**: «Guardar como plantilla» sobre el BORRADOR en pantalla solo existe en
  `PlanBuilderClient.tsx` (wizard retirado). En el editor único, `savePlanTemplateAction` se invoca
  únicamente dentro de `runTemplateSave`, que es el guardado del modo plantilla. Sobrevive solo el camino
  desde el plan **publicado**. Congelar el borrador sin publicarlo hoy no se puede.
- Pendiente declarado vivo en la única superficie de plantillas: sin respaldo local del borrador en modo
  plantilla. El wizard sí tenía autosave; el reemplazo no.
- T6.4 solo parcialmente cubierto: el QA del 16-08 fue del editor de plantillas, no de la biblioteca ni
  del modal de dos pestañas del hub.

---

## 2. Pendientes operativos vigentes

Veintitrés pendientes verificados contra código y contra LIVE. Ordenados por urgencia real.

### 2.1 Con fecha, con plata o con un usuario golpeado

#### Job de purga a 30 días — NO EXISTE · vence 2026-09-10

El endpoint `POST /api/mobile/account/delete` solo escribe el marcador `deletion_requested_at` en
`app_metadata` (líneas 211-215, con comentario explícito «es la cola de trabajo del job de purga a 30
días (pendiente T6)»). El único grep de `deletion_requested_at` en todo el repo devuelve esas dos líneas:
**nadie lo lee**. El cron `/api/cron/purge-data` solo purga audit logs, `org_members` soft-deleted y
`coach_client_assignments` — nada de identidades auth.

La app le promete al usuario, y se le prometió a Apple como requisito de la review, que la cuenta queda
«eliminada por completo dentro de 30 días». El primer pedido posible fue el 2026-08-11 con la build 52.

Arrastra dos pendientes de la misma spec: **T8** (al purgar un coach no se corta el acceso de sus
alumnos: hoy solo se avisa en el copy) y **T9** (el ban corta login y refresh, pero un access token ya
emitido vive ~1 h).

> **Siguiente**: handler `/api/cron/purge-account-deletions` que lea
> `auth.users.raw_app_meta_data->>'deletion_requested_at'`, anonimice o borre los datos de los >30 días
> y elimine la identidad auth con cascada a los alumnos del coach. Schedule en `vercel.json`. Evaluar
> `auth.admin.signOut(jwt, 'global')` en el endpoint de baja en el mismo corte.

#### Meta Pixel y CAPI sin env vars en Vercel

El código está completo y correcto (`MetaPixel.tsx`, `MetaTrackEvent.tsx`, `lib/meta/pixel.ts`,
`lib/meta/capi.ts`) y es un **no-op silencioso por diseño** mientras falten `NEXT_PUBLIC_FB_PIXEL_ID` y
`META_CAPI_TOKEN` — los propios archivos lo dicen literal. Sin eso: cero PageView, cero
CompleteRegistration, cero EMQ. El ad set de Leads→Website→CompleteRegistration no tiene señal que
optimizar y la tanda 1 de 200-300k CLP corre a ciegas.

> **Antes del primer peso**: (1) `NEXT_PUBLIC_FB_PIXEL_ID=1586483219694806` en preview y prod, con
> redeploy — es `NEXT_PUBLIC`, exige build fresco; (2) System User en Business Settings y `META_CAPI_TOKEN`
> como variable server-only; (3) Automatic Advanced Matching; (4) verificar con Test Events y Pixel
> Helper que CompleteRegistration llega **una sola vez** deduplicado (browser + server) y que EMQ ≥ 6,0.

#### Catálogo: 676 alimentos marcados como líquidos, 261 sobre 300 kcal

Medido en LIVE en esta sesión sobre `public.foods`: `is_liquid = true` en 676 filas, 301 con ≥200 kcal,
**261 con ≥300 kcal**, 564 con `category = 'bebida'`. El número de ≥300 kcal **subió de 212 a 261** desde
el hallazgo del 11-08: el problema crece con cada importación.

Consecuencia de usuario: el registro libre del alumno ofrece ml y unidad, y nunca gramos, sobre cereales,
granolas y harinas. Solo se arregló a mano el caso reportado (`Avena · Quajer`). Es el único bug de datos
vivo que golpea alumnos reales todos los días.

> **Siguiente**: migración de datos con dry-run — (1) candidatos = `is_liquid AND calories >= 300 AND
> category = 'bebida'` menos una whitelist de líquidos calóricos legítimos (aceites, leches, jugos,
> bebidas deportivas); (2) contar cuántos están en planes publicados y cuántos tienen registros de intake
> (esos exigen aviso al coach); (3) UPDATE en tanda con snapshot previo y conteos antes/después;
> (4) **OK explícito del dueño**: altera las unidades ofrecidas sobre alimentos ya prescritos.

#### TTFB p75 del dashboard del alumno: 5.204 ms, cero trabajo desde la medición

`git log` sobre `apps/web/src/app/c/[coach_slug]/dashboard/` no muestra ningún commit de optimización: el
último toque relevante es `792c40d3` (fix de headers ByteString). El objetivo <1,5 s falla en casi todas
las rutas del área alumno: dashboard 5.204 ms (n=160), `/c/:slug/login` 3.063, `/login` 2.652,
`exercises` 1.900, `workout/:planId` 1.828, `nutrition` 1.766. `/not-found` responde en 198 ms — la
plataforma está sana y el cuello es el fan-out de queries del server render.

Es la primera pantalla que ve todo alumno al abrir la PWA.

> **Siguiente**: SPEC/PLAN/TASKS propios. Instrumentar el server render con spans (Sentry ya está vivo en
> web) para atribuir tiempo por query, y atacar el fan-out de `dashboard/_data` y `client-root.queries.ts`
> — paralelizar, colapsar en RPC única o cachear lo estable. **Priorizarlo explícitamente contra
> T3.4-T3.7.**

#### iOS 1.1.0 (54) en review y 5 grupos de OTA sin replicar

El último registro es el reenvío del 15-08 con la build 54, «Pendiente de revisión», tras el fix solo-copy
de 5.1.1(iv). Desde entonces se publicaron cinco grupos android-only el 17-08. Como el canal `production`
es compartido y `runtimeVersion = appVersion`, esos updates existen solo en la rama android del grupo:
**todo el paquete del 17-08 —Guía Viva, Sello v2, Pricing v2, notas del coach, retiro del par— está
ausente en iOS**. Y las notas del coach no llegaron todavía a ningún teléfono, de ninguna plataforma.

> **Siguiente**: revisar el estado en App Store Connect. Aprobada → republicar los cinco grupos con
> `--platform ios` desde `mobile-ota.yml` sobre el mismo commit y canal, y verificar con
> `eas update:insights`. En revisión → no publicar OTA iOS, no subir build nueva, no cancelar.

#### El E2E que publica un plan está skipeado entero

`tests/nutrition-v2/builder-publish.spec.ts:27` usa `test.describe.skip` con el comentario «canary —
RETIRADO, reescribir contra el editor único». Era el único E2E que cubría publicar un plan de punta a
punta con catálogo. El retiro del par viejo dejó al editor único como **camino único de escritura de
planes para todos los coaches**, y ese camino no tiene E2E. Los jobs `e2e` y `nutrition-smoke` son
`workflow_dispatch`, así que no bloquean PR: hoy nada automático caza una regresión en publicación.

> **Siguiente**: reescribirlo contra `/coach/nutrition-v2/[clientId]/editor` (crear desde plantilla,
> agregar franja y alimento, publicar, verificar el plan vigente en la ficha) y reactivar el `describe`
> antes del próximo release de nutrición. El esqueleto skipeado ya tiene la plomería de personas E2E.

### 2.2 Deuda que todavía no muerde

| Pendiente | Estado verificado |
|---|---|
| **Regen de `database.types.ts`** | Último commit `c7f4e3e1`. Entraron después al menos `20260810161604`, `20260810171529`, `20260811020826`, `20260816224622` y las de branding/pricing. El cast `V2ReadClient` sigue vivo en `api/cron/nutrition-reminder/route.ts:94-105` y `_data/last-quantity.data.ts:45`. Regenerar deja 13 errores en 7 archivos V1. |
| **Corte V1→V2** | Medido en LIVE: 31 planes V1 activos, 4 sin fila en `nutrition_v2_conversion_links`. La matriz RLS con JWTs reales y el preflight nunca se corrieron. Encuadre correcto: **migrar la gente**, no apagar V1 (decisión del dueño del 03-08). |
| **Demolición del par viejo** | ~6.000 LOC muertas. Bloqueante real: `plan-templates-from-plan.actions.ts` sigue importando `rehydrateBuilderState`, `assembleDraft` y `portions-state` del wizard. Hay que **reescribirla** sobre `readModelToEditState` + `applyQuickEditToDraft` con tests antes de borrar nada. Agendada post 2026-08-30. |
| **Botón «Reenviar confirmación»** | `resendCoachSignupConfirmationEmail` tiene cero llamadores de producción: solo la definición y un mock. Un coach que pierde el mail queda bloqueado sin salida self-service — el caso Ivan del 16-08, que exigió intervención manual. Menos de un día de trabajo. |
| **Baja de cuenta del alumno en web** | `ProfileClient.tsx:384` sigue con `mailto:privacidad@eva-app.cl`. El coach web ya tiene el diálogo real; en RN ambos roles lo tienen desde la build 52. La baja del alumno web ni siquiera escribe el marcador de purga. |
| **Deuda 4B-16: `nutrition-pro` duplicado** | Dos copias independientes: `apps/web/.../_lib/nutrition-pro.ts` y `apps/mobile/lib/nutrition-v2-pro.ts`. No hay módulo en `packages/`. Mismo patrón que causó drift en los reducers antes de R1. |
| **MOB-02: smoke device transversal** | Los 5 checkboxes siguen abiertos y MOBILE_PARITY mantiene «QA en dispositivo: Pendiente» en 7 filas. El QA cerrado del 15/16/17-08 cubrió nutrición y el editor, no la matriz transversal. La experiencia de entrada cambió el config plugin del splash ⇒ **no es certificable por OTA**: exige binario nuevo. |
| **STORE-02: formulario Play Health** | Cuatro checkboxes abiertos. Cardio Conectado F2 agregó cuatro permisos sobre los dos ya declarados. Sin la declaración aprobada, el binario no pasa. Plazo: ~7 días de aprobación + 5-7 hábiles de propagación, y **exige cuenta Play de tipo Organization verificada** — si no lo es, ese trámite va primero. |
| **El runbook de OTA enseña el camino prohibido** | `MOBILE_RELEASES_OTA.md` afirma que «no existe un workflow de publicación OTA» y da el comando manual `eas update --channel production` — **sin `--platform`**, que es exactamente lo que tocaría la build iOS en review. El workflow existe y por ahí salieron los cinco OTAs del 17-08. |
| **Cupones free+active sin probar** | T4.1 dice literal que «nadie lo abrió todavía»; T4.2 que el descuento del primer cobro solo está probado con la siembra SQL de DIEGO25. Con Free convertido en plan de entrada real, ese es justamente el camino que va a usar el tráfico de Meta. T4.3 («los cambios quedan locales») es rancio: están commiteados en `dbd76e50`. |
| **«Desde un alumno» sin endpoint móvil** | Única divergencia funcional real que queda en el hub de nutrición tras T3.3b. Comparte causa con la reescritura de `plan-templates-from-plan.actions.ts`: una vez reescrita, se expone como acción del endpoint de mutación móvil. |
| **Ola 5 de paridad RN sin inventariar** | El builder y los programas de ENTRENAMIENTO del coach en RN siguen sin comparación formal contra la web. La paridad global no está certificada por escrito. |
| **LEGAL-01** | Los templates legales describen al proveedor como persona natural. Se cruza con el estudio de IVA y con la promesa de borrado a 30 días que las tiendas ya leyeron. |
| **DATA-01** | Decisiones humanas del catálogo congeladas: merge de duplicados, cola de baja confianza, borrado de respaldos. **Dato positivo verificado**: el advisor de seguridad de LIVE ya no reporta `_bak_catalina_logs_20260722` con RLS deshabilitada (0 hallazgos ERROR; quedan 12 INFO, 3 WARN y 73 WARN de security definer). Ese gate del runbook de corte está cerrado. |
| **TEST_STATUS desactualizado** | Declara `last_verified 2026-07-26` y cita 3.940 tests cuando la suite real va en 5.933. Sus tres pendientes de fondo siguen reales, incluido «ejecutar E2E antes del siguiente release con cambios de auth/RLS/pagos/nutrición» — **Pricing v2 tocó pagos, entitlements y el cerco de invitaciones el 17-08 sin correr `e2e`**. |
| **Backlog del paraguas** | T3.4 (plantillas auto-escaladas), T3.5 (registro inteligente por texto), T3.6 (presupuesto semanal), T3.7 (offline web): sin SPEC, nunca arrancaron. Aparte, `live-updates-a16` tiene 15 items abiertos bloqueados por **una sola query de PostHog** (% de alumnos Android en 16 QPR1+) que decide go/no-go del frente entero. |
| **CURRENT.md manda a trabajo inexistente** | La fila «App nativa (RN)» sigue declarando tres deudas ya cerradas: paridad RN del tab Alimentos (`a0b976e7`, `949a1eab`, `6c4da722`), T2.6 F4 (cerrada por T3.3b W3, `a95f1811`) y T2.6 F2 (superada: RN despacha `COPY_VARIANT_TO_DAYS` con modo `append`). |

---

## 3. Regresiones abiertas por el retiro del par viejo

Ninguna estaba inventariada. `0355d67d` cerró las puertas de usuario al wizard y al quick-edit clásico;
también cerró la puerta de capacidades que solo vivían ahí. El código existe, el usuario ya no llega.

1. **Administrar grupos de porciones propios en web.** `createExchangeGroupAction` quedó huérfana:
   ninguna superficie web alcanzable la llama. En RN el coach sí puede crear, editar, eliminar y
   «Duplicar y ajustar» (`portions.tsx` + `DuplicateGroupSheet.tsx`). **Paridad invertida**, contra la
   regla de que la web es el jefe.
2. **«Guardar como plantilla» sobre el borrador en pantalla.** Solo existía en `PlanBuilderClient`.
   Hoy hay que publicar el plan primero y entrar por «Desde un alumno» — que además no tiene endpoint
   móvil.
3. **Herencia viva de metas por día.** `targetsMode: 'inherit' | 'custom'` murió con el wizard. El editor
   único copia las metas del base al crear el día y nunca re-sincroniza: cambiar las metas del base deja
   los días específicos congelados, **en silencio**.
4. **Quick-select «próximos 1/2/4» del menú de la franja** (decisión A del dueño en T2.6): inalcanzable,
   y nunca cruzó a RN.
5. **Vista de lista por grupo con excluir/restaurar y «Duplicar y ajustar» con reescalado**: sin puerta
   web, solo en RN.
6. **Sello v2 D2**: los builders debían llevar fondo plano + solo grano. No se implementó en ninguna
   plataforma, y `AppSeal variant="grain"` quedó como código muerto sin un solo consumidor.

---

## 4. Pricing v2 — el motor quedó bien, el copy quedó mintiendo

Se verificó línea a línea y **el motor resiste**: `SALE_TIERS = ['free','pro','elite']`,
`PRICING_V2_CUTOVER`, `tierMaxClientsFor` con fail-safe generoso, escritores migrados (activate-free,
trial-expiry, confirm-subscription, confirm-upgrade, create-preference, confirm-enrollment), lectores
migrados, cero hits reales de `?? 'starter'` y `return 'starter'`, `hasPaidModuleAccess` sin el
`!= 'free'`, camino de compra **y** de baja de add-ons respondiendo 403 `MODULES_INCLUDED` de forma
permanente, y el funnel de PostHog cableado.

La Wave D dejó el límite viejo en al menos doce superficies de venta y onboarding, web y RN:

| Superficie | Qué dice hoy |
|---|---|
| `landing-v2/FaqSection.tsx:58` **y** `PreciosSection.tsx:271` | «hasta 3 alumnos» vs «Hasta 2 alumnos, para siempre» — **la misma página se contradice**; las monta `page.tsx:151,153` |
| `(auth)/verify-email/page.tsx:17` y su espejo RN | «3 alumnos sin costo» — la pantalla que ve exactamente el coach nuevo |
| `FreeWelcomeModal.tsx:60,89` | «Hasta 3 alumnos en el plan Free» |
| `CompleteOnboardingForm.tsx:258` | «3 alumnos activos» |
| `CoachDashboardSections.tsx:517,528,933` (RN) | espejo de los dos anteriores |
| `coach/support/_components/HelpCenter.tsx:144` | «incluye hasta 3 alumnos» — en un archivo que la propia Wave D tocó dos veces |
| `coach/nutrition-plans/page.tsx:124` | «Hasta 30 alumnos activos (3× más que Free)» — Pro son 25 y la aritmética también murió |
| `coach/settings/_components/BrandUpsell.tsx:107` | «Hasta 30 alumnos activos» |
| `DashboardShell.tsx:307` y `CoachDashboardSections.tsx:294` | «¿Más de 100 alumnos…?» — el techo Elite nuevo es 60 |
| `legal/page.tsx:137` | «Los planes de 1-5, 6-10 y 11-30 alumnos» — tramos pre-v2, incluye starter |

**Cerco P7 incompleto**: `join/[invite_code]/_lib/join-capacity.ts:49-52` devuelve
`{ok: true, used: null, limit: null}` para el scope team ⇒ el alta por invite en un pool team sigue sin
tope. El TASKS pedía gatear por el tope del coach si team no tiene cuota propia; se documentó en vez de
gatear. **Necesita decisión del dueño** (DDL de cuota team, o aplicar el tope del coach).

Además, F2 (QA del dueño sobre landing, `/pricing`, register y reactivate) no tiene evidencia de
ejecución: lo declarado en `CURRENT.md` es el QA de nutrición y sello.

---

## 5. Estado plan por plan

### 5.1 Raíz `docs/specs/` — 22 features

| Spec | Estado real | Qué queda |
|---|---|---|
| `nutrition-flows-redesign` | Abierta | Paraguas. T3.4-T3.7 sin arrancar, regen de tipos, demolición del par, checklist de preservación nunca corrida completa |
| `nutrition-unified-editor` | Abierta | Reescribir `plan-templates-from-plan`, demolición post-30-08, E2E canary, OTA iOS |
| `nutrition-substitutions` | Abierta | El tab **Plan** del alumno no renderiza los reemplazos estructurados, ni en web (`PlanVariantCard.tsx:156`) ni en RN (`index.tsx:3257`). SPEC y PLAN siguen diciendo que el editor coach RN es «follow-up diferido» cuando ya existe |
| `nutrition-substitution-intake` | Abierta | Los dos casos degradados en RN siguen con `Alert.alert` sin stepper (`index.tsx:1225`); la web sí tiene el confirm |
| `nutrition-food-hub` | Abierta | Clasificar alimento GLOBAL nunca probado; `food-detail` duplicado fuera de `packages/`; MOBILE_PARITY desactualizado |
| `nutrition-food-overrides` | Abierta | Cero QA ejecutada, sin acta; gramaje de hallulla y marraqueta sin decidir en LIVE |
| `nutrition-exchange-swap` | Abierta | Código completo; `CURRENT.md` sigue declarando H1 y D5 abiertas; dos criterios sin reproducir |
| `nutrition-week-view` | Abierta | Implementada en 4 superficies, jamás QA-eada; el pendiente se perdió en una reescritura de `CURRENT.md` |
| `nutrition-authoring-speed` | Abierta | F2-franja sin puerta y sin portar a RN |
| `nutrition-student-reskin` | Abierta | Los PDF de exportación siguen fuera de la paleta fija de macros (`nutrition-day-pdf.ts:41-43`, `nutrition-day-export.ts:221-223`) |
| `nutrition-editor-cabina` | Abierta | Falta el `eas update:insights` posterior al OTA acumulado |
| `nutrition-onboarding-tour` | Abierta | MOBILE_PARITY declara QA de device del tour RN pendiente; contradice el cierre |
| `nutrition-coach-notes` | Abierta | Entró después del QA; ningún OTA la lleva al teléfono; sin test de render RN |
| `nutrition-ui-poda` | Abierta | El claim «micronutrientes avanzados» sigue vendiéndose en el catálogo de módulos |
| `nutrition-bulk-mark` | **Cerrada** | Resistió la refutación. Archivable |
| `eva-seal-background` | Abierta | D2 sin implementar; `variant="grain"` sin consumidores; SPEC contradice su propia reversa |
| `pricing-v2` | Abierta | Wave D a medias (12 superficies) y cerco P7 sin cubrir team |
| `whitelabel-color-consolidation` | Abierta | Ejecutada (`45d9f438`, `0b91ca17`). Falta W3.3 gate del Team studio, W4.1 registro en `CURRENT.md` + banner, W4.2 QA del dueño |
| `meta-pixel` | Abierta | Env vars; y la Fase 2 (Subscribe, InitiateCheckout, StartTrial existen como tipos, sin emisor) |
| `entrada-dark-v1` | Abierta | F4.1 QA de device; F4.2 reescribir la sección de paridad; F5.1 drift del `imageWidth` del splash (180 vs 150) |
| `live-updates-a16` | Abierta | Backlog real, bloqueado por la query de PostHog de la Fase 0 |
| `workout-day-in-progress` | Abierta | QA física de los 4 escenarios; lo aprobado el 26-07 fue en preview, no en hardware |

### 5.2 Raíz `specs/` — 12 features + `_templates`

| Spec | Estado real | Qué queda |
|---|---|---|
| `account-deletion` | Abierta | Purga a 30 días, alumno web con `mailto`, T8, T9, T10. **T7 del TASKS es falso**: el DangerZone del coach web ya llama `deleteCoachAccountAction` |
| `archive-nutrition-v2-cutover` | Abierta | Matriz RLS con JWTs reales y preflight de los enlaces V1→V2. El objetivo «corte V1» quedó parcialmente rancio |
| `rn-mobile-parity-redesign` | Abierta | Ola 5 sin inventariar, matriz device de 4A/4B, deuda 4B-16, y dos bloques rancios propios (Frente 0 y build gate de julio) |
| `cardio-conectado` | Abierta | QA con correa BLE y reloj real (nunca se corrió) + STORE-02 + cerrar 2 open questions |
| `cardio-ejes-y-fixes` | Abierta | Las analíticas de la ficha del coach siguen ciegas a cardio (`profileTrainingAnalytics.ts`, 283 líneas sin mención); 4 casillas de QA rancias por confirmar |
| `executor-v3` | Abierta | QA en iPhone de Live Activity y Dynamic Island (el bloqueo original de firma está superado); E7.3 movida a `live-updates-a16`; Ola 7B a marcar cancelada por decisión del CEO |
| `coupon-redeem-free` | Abierta | Canje free+active sin abrir en navegador; T4.3 rancio; cruce con Pricing v2 (`starter` fuera de venta) |
| `nutrition-custom-portions` | Abierta | Regresión web de grupos propios; seed de la lista de Dudu |
| `nutrition-plan-templates-v2` | Abierta | Avisar a `joaquinamr7`; T4.4 sin puerta; sin respaldo local del borrador |
| `nutrition-multiday` | Abierta | QA física iOS imposible durante el review; herencia de metas perdida; «Revisar» ya no existe |
| `nutrition-exchange-lists` | **Rancia** | Describe tres pantallas web que fueron borradas; T5.4 apunta a una ruta que hoy es redirect 307; regresión sin puerta web |
| `mobile-entry-experience` | **Rancia** | Su walkthrough de 3 escenas lo mató `entrada-dark-v1`, y `MOBILE_PARITY.md:589` todavía la cita como fuente |

---

## 6. Organización documental

`pnpm docs:check` corre **verde** hoy: «20 canónicos, 295 Markdown activos, sin handoffs ni credenciales
literales». Esa es la línea base; ningún movimiento se cierra sin volver a ella.

**Gotcha del gate**: `scripts/check-docs.mjs:243` excluye `docs/archive/` de la validación de enlaces.
Al mover algo al archivo, sus enlaces **salientes** dejan de validarse y se rompen en silencio; los
**entrantes** desde el árbol activo sí revientan el gate.

### 6.1 La anomalía de las dos raíces

Los cinco documentos que declaran la política SDD nombran únicamente `specs/<feature>/`: `README.md:39` y
`:80`, `AGENTS.md:85-87`, `docs/README.md:56-62`, `docs/architecture/PROJECT_STRUCTURE.md:23` y `:180`.
**`docs/specs/` no aparece en ninguno.**

La realidad está invertida: `docs/specs/` tiene 22 features y 68 archivos, todas tocadas hasta el 17-08;
`specs/` raíz tiene 12 features y 39 archivos, con último commit del 11-08 y la mayoría de julio. No
existe `README.md` en ninguna de las dos raíces, así que nada en el árbol declara cuál manda. Y
`docs/status/CURRENT.md` enlaza a **ambas en la misma tabla** (línea 20 a la raíz, línea 21 a
`docs/specs`), igual que `MOBILE_PARITY.md`.

**Recomendación**: gana `docs/specs/` (es donde vive el trabajo real). Consolidar con `git mv` y reparar
los nueve enlaces exactos que rompe:

1. `docs/status/CURRENT.md:20` → `../../specs/archive-nutrition-v2-cutover/SPEC.md`
2. `docs/status/MOBILE_PARITY.md:11` → `../../specs/rn-mobile-parity-redesign/TASKS.md`
3. `docs/status/MOBILE_PARITY.md:534` → `../../specs/cardio-ejes-y-fixes/TASKS.md`
4. `docs/status/MOBILE_PARITY.md:534` → `../../specs/executor-v3/TASKS.md`
5. `docs/status/MOBILE_PARITY.md:589` → `../../specs/mobile-entry-experience/SPEC.md`
6. `docs/operations/NUTRITION_V2_CUTOVER_RUNBOOK.md:21` → `../../specs/archive-nutrition-v2-cutover/SPEC.md`
7. `docs/rn-port/README.md:15` → `../../specs/rn-mobile-parity-redesign/PLAN.md`
8. `docs/rn-port/README.md:16` → `../../specs/rn-mobile-parity-redesign/TASKS.md`
9. `docs/rn-port/PLAN-OLAS-1A1.md:12` → `../../specs/rn-mobile-parity-redesign/TASKS.md`

En sentido inverso, `specs/rn-mobile-parity-redesign/TASKS.md` líneas 23, 29 y 63 enlazan a
`../../docs/rn-port/...`; al moverse, esos `../../docs/` sobran un nivel.

### 6.2 Movimientos gratis (cero enlaces entrantes, verificado)

- **`docs/audits/executor-v3-qa1/`** — 41 archivos (15 informes numerados + 26 fixes de las rondas
  qa1→qa6), todos de una feature en producción desde `60090f90`. Sin frontmatter, sin índice en
  `docs/audits/README.md`, y `git grep` de enlaces devuelve nada. Mover no puede romper el gate.
- **`docs/research/executor-redesign/`** — 29 archivos, sin frontmatter, sin índice, cero enlaces
  markdown. Único vínculo vivo: dos comentarios de código citan el informe r7 (`apps/mobile/lib/ble-hr.ts:4`
  y `.../v3/web-ble-hr.ts:4`), que hay que reapuntar.

### 6.3 Material marcado activo que ya cumplió su ciclo

- **`docs/rn-port/`** — 37 archivos. Su README tiene `status: active` y declara una «ola activa» que
  `rn-mobile-parity-redesign/TASKS.md` da por terminada (12/12 y 15/15 aplicadas). Los 35 archivos de
  `specs/seccion-4a` y `4b` no tienen frontmatter. Archivar cuesta reparar 5 enlaces salientes y 6
  entrantes.
- **`docs/research/entrada-redesign/`** — 11 archivos, **no mover todavía**: tiene un enlace entrante vivo
  desde `docs/specs/entrada-dark-v1/DESIGN-SPEC.md:16`, y esa spec sigue en `implemented-pending-qa`.
- **`docs/operations/app-review-1.1.0-respuesta-*.md`** — dos reportes point-in-time sin frontmatter en
  una carpeta de runbooks. La del 13-08 ya está superada. Mover cuando 1.1.0 (54) sea aprobada.

### 6.4 Documentos canónicos que contradicen al código

- **`docs/status/CURRENT.md`** — declara tres deudas RN ya cerradas (§2.2) y sigue afirmando que H1 y D5
  de `nutrition-exchange-swap` están abiertas.
- **`docs/status/MOBILE_PARITY.md`** — contradice el binario en al menos tres puntos: línea 187-189
  (tab Alimentos RN), línea 204-205 (quick-select de franja), línea 242 (QA del tour RN), línea 532
  (rama sin merge), línea 109 (QA device del editor RN).
- **`docs/operations/MANUAL_TASKS.md`** — `canonical: true`, `last_verified` de julio; mantiene MOB-02
  pidiendo smoke sobre un build de TestFlight de julio cuando iOS ya va en 1.1.0 (54). Su propia regla
  dice «una acción terminada se elimina».
- **`docs/testing/TEST_STATUS.md`** — `canonical: true`; omite tres gates vigentes:
  `check:nutrition-v2-boundaries`, `check:meal-completions-deprecation` y el gate visual
  `cabina-visual-check.mjs`, que `CURRENT.md` declara bloqueante con 308 asserts.

### 6.5 Otros hallazgos

- **Frontmatter ausente de forma masiva.** La política lo exige para todo documento canónico, pero el
  gate solo lo cobra sobre 20 rutas hardcodeadas. Sin frontmatter: los 68 archivos de `docs/specs/` salvo
  los 4 de `entrada-dark-v1`, los 41 de `executor-v3-qa1`, los 35 de `rn-port/specs`, los 29 de
  `research/executor-redesign`, 5 de los 6 informes de `docs/audits`, los 3 de `docs/research`, los 2 de
  `app-review`, los 51 de `docs/archive` y 36 de los 39 de `specs/`. Además hay valores fuera del
  vocabulario de la política (`canonical: implementation-plan`, `live-backlog`,
  `status: active-static-complete`, `approved-active`, `implemented-pending-qa`). **Hay que decidir el
  alcance real**: o se restringe la regla a los 20 canónicos, o se extiende el gate.
- **Dos referencias colgadas desde código de producción** a rutas de docs que ya no existen, y que el
  gate no ve porque solo valida enlaces markdown: `apps/mobile/lib/coach-nutrition-v2-tab-logic.ts:8`
  cita `docs/rn-port/specs/seccion-3/...` (no existe `seccion-3`), y
  `apps/web/src/services/workout/exercise-substitution.ts:10` cita `docs/audits/fase-l-wl2/...` (el
  material está en `docs/archive/specs/exec-fase-l/`). **Tras cada tanda de `git mv`, barrer comentarios
  con `git grep`.**
- **Índices incompletos**: `docs/audits/README.md` indexa 5 de 47 archivos; `docs/research/README.md`
  indexa 1 de 5 items. Entre los huérfanos hay material **vivo** citado desde producción
  (`cta-pagos-externos-stores-2026-07-31.md`, citado por tres archivos de billing).
- **`docs/archive/specs/` contiene material que su propio README prohíbe**: `whitelabel-v2/` con solo
  PLAN.md más HTML y un PNG; `movida-areas/` con un único `CALLSITES.md`; `movida-screening/` sin TASKS.
  Decidir entre relajar el README o sanear.
- **`specs/_templates/` está huérfano**: cero enlaces desde cualquier `.md`, y ninguno de los tres
  lugares que explican cómo arrancar una feature lo menciona. Un lector desprevenido lo confunde con una
  feature pendiente.
- **475 archivos ignorados bajo `docs/`** (design-source, 18 PDFs de auditoría, menús) distorsionan
  cualquier inventario hecho con `ls` en vez de `git ls-files`. Conviene sacarlos del árbol documental.

---

## 7. Higiene del repositorio

### 7.1 Working tree

| Item | Verificación | Acción |
|---|---|---|
| `skills-lock.json` | El commit tiene **1** entrada; el working tree tiene **187**. El payload de las 186 nuevas no existe en el repo. Commitearlo shippea 1.122 líneas de metadata con hashes que nadie más tiene | `git checkout -- skills-lock.json` |
| `.github/agents/`, `.github/hooks/`, `.github/skills/` | 3,3 MB / 152 archivos: la instalación de la skill `impeccable`, incluido un hook `postToolUse` que dispara en cada edición y se impondría a todo agente que clone el repo. Hoy **no** están ignorados | agregarlos al bloque «AI/editor configuration» del `.gitignore` |
| `.gitignore` (`+.serena/`) | Una sola línea; `.serena` pesa 191 MB | commitear |
| `scripts/seed-appreview-demo.mjs` | 880 líneas, existe por el rechazo de guideline 2.1(a). Mismo patrón de doble gate que su hermano ya trackeado. Auditado: cero credenciales hardcodeadas | commitear |
| `stash@{0}` («w3-verify-baseline») | Base `82b50298`, dos commits detrás de HEAD. Tres archivos existen en HEAD y no en el stash: **aplicarlo revertiría `45d9f438` y `0355d67d`** | `git tag` de respaldo y `git stash drop` |

### 7.2 Worktrees — los cinco retirables

Verificados uno por uno: `git status --porcelain` vacío en los cinco, y `git cherry` = 0 commits únicos
en todos. Los cuatro de `.claude/worktrees/` tienen `node_modules` instalado; el de `D:/tmp/eva-ota-master`
carga 41 MB de `dist2` (por eso `remove` sin `--force` se niega).

- **`ios-review-fixes`** tiene checkeada la rama `master` en `0b468716`, que sí es ancestro de
  `origin/master`. **Mientras exista, nadie puede fast-forwardear `master` y cualquier lectura de
  «master» da una foto de hace 67 commits.** Tras retirarlo: `git branch -f master origin/master`.
- **`adelanto-qa-20260729`** no figura en `--merged` y `git cherry` marca un commit, pero el archivo que
  agrega ya está en `origin/master` con contenido idéntico (`git diff` vacío): entró por otro commit, con
  otro patch-id. No se pierde nada.
- `fix-basepath-client-bundle` y `nutricion-ui-rescate`: en `--merged`, cherry = 0.
- `D:/tmp/eva-ota-master`: detached en `e8dd8b75`, ancestro de `origin/master`.

**Recordatorio**: worktrees solo con `git worktree remove`. Nunca `rm -rf` sobre rutas del proyecto.

### 7.3 Ramas remotas

- **`origin/claude/free-plan-nutrition-cardio-qbyycb`** — un commit (`010d9000`) con **270 líneas que no
  existen en master**: `docs/research/informe-cardio-pro-2026-08-15.md`,
  `docs/research/informe-plan-free-nutricion-alumnos-2026-08-15.md` y el índice. Es el informe F1 del
  frente de pricing que quedó sin decisión. **Se pierde si se poda la rama sin rescatarlo.**
- **`origin/dependabot/npm_and_yarn/security-d1268326a2`** — ref muerta: la rama ya no existe en GitHub y
  el PR propone un **downgrade** (`sharp ^0.35.0` cuando master ya tiene `^0.35.3`). `git remote prune origin`.

### 7.4 Scripts y harnesses

**Trampa detectada antes de proponer nada**: `vitest.config.ts:14` incluye `scripts/**/*.test.{ts,tsx}` y
`tests/` importa directo de `scripts/`. **No mover** `scripts/nutrition-portions/*`,
`scripts/nutrition-v2-conversion/*` ni `scripts/e2e/seed-pool-fixture.mjs`: romperían `pnpm test` aunque
parezcan drivers one-off y aunque sus specs estén archivadas.

Sí son one-off cumplidos, con cero referencias externas: `fetch-chilean-branded-foods.mjs`,
`generate-branded-migration.mjs`, `_verify-josefit-qa.mjs`, `audit-fresh-foods.mjs`, `generate-pdf.js`
(su HTML de entrada no está en el repo), `seed-exercises-movida.mjs` y `qa-seed-team-movida.mjs` (los dos
últimos, de un trato cancelado). Al mover el último, ajustar las rutas de su `.json` de salida en
`.gitignore:83` y `scripts/check-docs.mjs:45`.

**Harnesses**: los tres tienen guard de `NODE_ENV`, ninguno llega a producción.
`dev-harness/nutrition-editor` es el sustrato del gate visual (`cabina-visual-check.mjs:67`) y lo nombran
12 archivos: **no tocar**. `nutrition-tabs` es el repro canónico de la saga T2.7 y el patrón de la regla
«verificar local antes de preview»: conservar. `reduced-motion` (17 líneas) es el único huérfano: su
incidente está resuelto y su única referencia es `CURRENT.md:29`.

### 7.5 Objectstore

`git count-objects -vH`: 44.370 objetos in-pack, 11 packs, 57,6 MB; `.git` total 68 MB. Sin garbage y sin
entradas administrativas muertas — sano, solo fragmentado. `git gc --prune=now` conviene **después** de
retirar worktrees y podar ramas, para que pueda soltar objetos referenciados solo por ellas.

---

## 8. Plan de orden propuesto

El archivado de specs **no** es la primera tanda: hoy casi ninguna se puede archivar sin mentir en el
banner. El orden que minimiza riesgo y maximiza claridad:

### Tanda A — Higiene de git (no toca producto)

```bash
git checkout -- skills-lock.json
# .gitignore += .github/agents/  .github/hooks/  .github/skills/
git add .gitignore scripts/seed-appreview-demo.mjs
git cherry-pick 010d9000          # rescata los 2 informes que solo viven en la rama remota
git remote prune origin
git tag stash-w3-verify-baseline stash@{0} && git stash drop stash@{0}
```

### Tanda B — Retirar los cinco worktrees

```bash
git worktree remove .claude/worktrees/ios-review-fixes
git worktree remove .claude/worktrees/fix-basepath-client-bundle
git worktree remove .claude/worktrees/nutricion-ui-rescate
git worktree remove .claude/worktrees/adelanto-qa-20260729
git worktree remove --force D:/tmp/eva-ota-master
git branch -f master origin/master
git gc --prune=now                # último paso
```

### Tanda C — Documentación, en este orden

1. **Corregir los cuatro canónicos que mienten** (§6.4). Va primero: mover documentos que contradicen al
   código solo congela la contradicción.
2. **Mover la evidencia muerta que no tiene enlaces** (§6.2): `executor-v3-qa1` y `research/executor-redesign`,
   reapuntando las dos citas de código.
3. **Archivar `docs/rn-port/`** reparando sus 11 enlaces.
4. **Consolidar la raíz de specs** en `docs/specs/`, reparando los 9 enlaces de §6.1 y actualizando la
   política en los cinco documentos que la declaran.
5. **Archivar specs, al final y de a bloques.** Hoy solo `nutrition-bulk-mark` pasa sin asterisco. El
   paraguas de nutrición sigue abierto y sus trece hermanas se cross-linkean: o se archivan en un bloque
   atómico, o el gate se pone rojo.

Correr `pnpm docs:check` antes y después de cada tanda de `git mv`. El único resultado aceptable es cero.

---

## Anexo — Artifacts publicados

Cincuenta artifacts publicados a la fecha. Siguen sirviendo como referencia viva:

| Artifact | Por qué sigue vivo |
|---|---|
| `63daf16b` — EVA + IVA | Decisión con el contador, abierta |
| `e1c1f0db` — Precios EVA v2 | Cuatro decisiones del dueño sin cerrar |
| `9fed67d2` — Mi Marca RN Pulido | Gaps de paridad pendientes |
| `6e6567f3` — QA Cabina v2 | Checklist de QA |
| `3ca18043` — Guía Viva EVA | Copys literales aprobados del tour |
| `165595be` — Los 34 Planes | Versión navegable de este informe |

El resto son actas de trabajo ya cerrado: quedan como evidencia, no como referencia.
