# SPEC — Screening de Movimiento de Ingreso (módulo `movement_assessment`)

**Status:** DRAFT (listo para review)
**Owner:** Juan (EVA) — feature del Plan 3 §A de Movida
**Last updated:** 2026-06-11
**Related plan:** `docs/archive/movida/03-PLAN-evaluacion-nutricion.md` §A · Director: `docs/archive/movida/00-DIRECTOR.md`
**Branch:** `feat/movida-platform`

---

## Problema / Por qué

Los kinesiólogos de Movida evalúan a cada alumno de ingreso con un screening de movimiento de 7
patrones que hoy viven en **Excel** (puntaje manual, sin historial consultable, sin semáforo, sin
conexión con el plan de entrenamiento). El screening es **parte del onboarding** de los ~300
alumnos: sin digitalizarlo, EVA no reemplaza el stack actual (FMS-Excel) y pierde el diferenciador
"evaluación de ingreso" del deal (milestone **M2** del Director).

Lo que se necesita:

- **Wizard de captura** (tablet, en sala) de 7 patrones con score 0-3, lados L/R, dolor y pruebas
  de descarte (clearing), con borrador restaurable.
- **Semáforo de prioridad** (compuesto /21 + banderas de dolor/asimetría) y **reporte** imprimible.
- **Evolución temporal** (línea del compuesto + radar de 7 patrones inicial vs último).
- Todo dentro del pool team (cualquier miembro ve/edita), con consentimiento, bitácora de accesos
  y módulo toggleable OFF por defecto.

## Regla dura de marca (legal — NO negociable)

"FMS" / "Functional Movement Screen" / "Functional Movement Systems" **NO aparecen** en ninguna
superficie de usuario: UI, PDF/print, rutas, keys de i18n, nombres de módulo, material comercial.
Nombre canónico: **"Screening de Movimiento de Ingreso"** (key i18n `assessment.title` para poder
renombrarlo sin tocar código). En docs internos solo: "protocolo basado en literatura de tamizaje
(Cook & Burton, IJSPT 2014)". Disclaimer obligatorio en reporte y export (ver AC5).

> ⚠️ Hallazgo del mapeo: `app/coach/settings/modules/_components/ModulesForm.tsx:13` hoy dice
> "(tipo FMS)" en la descripción visible del toggle — **viola la regla** y se corrige en este spec.

## Research 2026 (obligatorio — hallazgos con fuentes)

1. **Legal / licenciamiento FMS.** Los términos de Functional Movement Systems prohíben usar sus
   marcas y propiedad intelectual sin consentimiento escrito; incluso la certificación "no autoriza
   a usar ninguna marca o IP de FMS sin consentimiento expreso" ([FMS Terms](https://www.functionalmovement.com/terms),
   verificado 2026-06-11; [review de certificación 2026](https://www.exercise.com/grow/acsm-functional-movement-screen-fms-certification-review/)).
   **Pero**: el derecho de autor no protege métodos ni sistemas (idea/expresión); el protocolo de 7
   patrones, el scoring ordinal 0-3 y los cut-offs están descritos en literatura científica abierta
   ([Physiopedia](https://www.physio-pedia.com/Functional_Movement_Screen_(FMS)); Cook & Burton,
   IJSPT 2014). **Decisión:** protocolo *clean-room* — nombres propios genéricos de los patrones,
   textos/criterios redactados desde cero, sin reproducir tablas/ilustraciones/nomenclatura
   propietaria, sin el nombre "FMS" en ninguna superficie. Es la misma vía que usan los
   competidores no licenciados.
2. **Validez científica → semántica del producto.** Meta-análisis: el compuesto NO sirve como
   predictor de lesiones — asociación "pequeña" con cut-off ≤14 incluso en la mejor evidencia
   (militares), y recomendación en contra en fútbol ([Moran et al., BJSM 2017](https://pubmed.ncbi.nlm.nih.gov/28360142/);
   [Dorrel et al. 2015](https://pmc.ncbi.nlm.nih.gov/articles/PMC4622382/);
   [revisión 2025, Sports/MDPI](https://www.mdpi.com/2075-4663/13/2/46)). **Decisión:** la UI habla
   de **"prioridad de trabajo correctivo"** (semáforo alta/media/baja), nunca de "riesgo de lesión";
   el disclaimer es obligatorio. La columna interna se llama `risk_band` (nombre fijado por el plan
   03) pero su copy visible es "prioridad".
3. **Mercado 2026 (clínicas y coaches).** [Physitrack](https://www.physitrack.com/) domina
   telehealth/outcomes pero no trae un screening estructurado de ingreso; [TrueCoach](https://truecoach.co/features/)
   solo ofrece métricas custom genéricas ([review 2026](https://www.ptpioneer.com/personal-training/tools/truecoach-review/));
   los especializados son AI-video: [Revenite](https://revenite.ai/) (kiosko AI),
   [Kemtai](https://kemtai.com/) (motion tracking), [SquatScreen/PostureScreen](https://www.postureanalysis.com/squatscreen-functional-movement-assessment-app/)
   (AR foto), [Yogger](https://yogger.io/) (análisis de video). **Hueco:** ninguno integra screening
   + plan de entrenamiento + pool multidisciplinario white-label — exactamente lo que Movida
   necesita y lo que hace revendible el módulo (box/HYROX/clínicas).
4. **Video vs checklist.** La práctica recomendada 2026 es combinar el ojo clínico con captura
   estructurada: checklist con notas de compensaciones y asimetrías L/R como núcleo; el video es
   complemento, no reemplazo ([Output Sports 2026](https://www.outputsports.com/blog/functional-movement-screen-how-coaches-can-go-beyond-the-basics-with-digital-testing)).
   **Decisión v1:** wizard checklist (el kine evalúa presencial en sala); captura de video = fase 2
   condicionada (bucket privado `team-health-docs` ya existe; sumaría consentimiento
   `photo_storage` + costo de storage + revisión de retención).

## Alcance

- Módulo toggleable `movement_assessment` (key YA existe en `MODULE_KEYS`), OFF por defecto,
  gateado server-side con `assertModule` + kill-switch de operador.
- **Wizard coach/kine** de 7 pasos (captura por patrón) + paso final de revisión y firma de
  consentimiento. Borrador en DB restaurable (cross-device).
- **Cálculo puro** en `packages/calc/` (score por ítem, compuesto /21, asimetría, banda) con golden
  tests del plan 03.
- **Reporte** con semáforo, badges (dolor/asimetría), tabla de 7 patrones (lado débil resaltado),
  disclaimer; **evolución** (línea del compuesto + radar inicial vs último, recharts).
- **Export/print** del reporte (página print dedicada, patrón `progress-print`), registrado en
  bitácora (`pdf_generate`).
- **Vista del alumno** (read-only, solo evaluaciones finales) en su app `/c|/t`.
- Entrada por **NAV_MODULES** (hub `/coach/movement`) + card en el perfil del alumno.
- Scoping 3-vías por workspace activo (standalone / team; enterprise DIFERIDO v1).
- Consentimiento bloqueante + `team_access_logs` en contexto team.

## Fuera de alcance (v1)

- Captura de **video** por estación (fase 2 condicionada — preguntar a Ani).
- **Correctivos automáticos** enlazados al patrón más bajo (plan 03 lo menciona como "enlace a
  librería filtrada"; v1 entrega solo el dato del patrón más bajo; el enlace con precarga de áreas
  Movilidad/Activación es follow-up al cierre del builder de áreas).
- Editor de **protocolos custom** (otros tests, otros umbrales). v1: protocolo fijo `v1` con 7
  patrones; el modelo deja `protocol_version` para evolucionar.
- Enterprise (`org_id`): el módulo no se ofrece en contexto enterprise v1 (entitlements no
  resuelven org; mismo criterio que áreas custom v1).
- Recordatorios automáticos de re-test (push/email) — depende de frecuencia que defina Movida.
- Adjuntar histórico en PDF del Excel del kine (fase 2, bucket `team-health-docs` listo).
- Menores de edad: el pool NO se habilita para menores (Director §1) — el screening hereda esa
  restricción; nada específico que construir acá.

## User stories

1. Como **kinesiólogo del pool**, quiero evaluar a un alumno de ingreso con un wizard de 7
   patrones en tablet (L/R, dolor, descartes), para reemplazar mi Excel y no perder datos.
2. Como **kinesiólogo**, quiero que si me interrumpen a mitad de la evaluación quede un borrador
   que pueda retomar desde cualquier dispositivo, para no re-evaluar patrones ya hechos.
3. Como **miembro del pool** (entrenador/nutri), quiero ver el semáforo y el reporte del screening
   de cualquier alumno del pool, para ajustar mi trabajo (pool plano full-access).
4. Como **kinesiólogo**, quiero re-evaluar al alumno a las N semanas y ver la evolución (línea del
   compuesto + radar por patrón), para objetivar el progreso del trabajo correctivo.
5. Como **alumno**, quiero ver mi último reporte y mi evolución en mi app (marca Movida vía `/t`),
   para entender en qué estoy y por qué mi plan trae trabajo correctivo.
6. Como **kinesiólogo**, quiero imprimir/exportar el reporte con la marca del centro, para
   entregarlo o archivarlo (reemplazo real del Excel).
7. Como **owner del team / CEO**, quiero que el módulo esté apagado por defecto y se encienda por
   team (`enabled_modules`), para controlarlo comercialmente; y como **operador EVA**, apagarlo
   globalmente sin migración si algo sale mal (kill-switch).
8. Como **coach standalone** (no Movida), quiero poder usar el mismo módulo si lo tengo habilitado,
   para que sea un producto revendible (no hardcodeado a Movida).

## Criterios de aceptación (AC — medibles)

- **AC1 — Captura.** El wizard guarda los 7 patrones con: segmented 0/1/2/3; captura L/R lado a
  lado en los 5 patrones por-lado; toggle de descarte (clearing) en hombro/tronco/rotatoria; flag
  de dolor por patrón; total parcial /21 visible. Submit final persiste `composite_score`,
  `has_pain`, `has_asymmetry`, `risk_band` calculados en `packages/calc` (server recalcula — nunca
  confía en el valor del cliente).
- **AC2 — Cálculo (golden tests, todos en verde via vitest).**
  `final = (clearing_positive || pain) ? 0 : (is_per_side ? min(L,R) : single)`; `composite = Σ final`;
  `has_asymmetry = ∃ ítem por-lado con |L−R| ≥ 1`; banda: high si `pain || composite ≤ 14`,
  moderate si `15-16 || has_asymmetry`, low si `≥ 17 && !asym && !pain`. Casos del plan 03 §A
  cubiertos 1:1 (8 golden tests mínimo).
- **AC3 — Borrador.** Cerrar el wizard a mitad y reabrirlo (incluso desde otro dispositivo)
  restaura los patrones ya puntuados. Máximo 1 borrador por alumno (índice parcial); dos miembros
  del pool retoman el MISMO borrador (awareness `last_edited_by` visible).
- **AC4 — Evolución.** Con ≥2 evaluaciones finales: línea temporal del compuesto + radar de 7
  patrones (primera vs última) renderizan con recharts; con 1 evaluación se muestra solo el reporte;
  con 0, empty-state con CTA al wizard.
- **AC5 — Marca y disclaimer.** `grep -ri "FMS\|functional movement" apps/web/src packages/calc packages/schemas`
  retorna 0 ocurrencias en strings visibles/i18n/rutas/keys (solo comentarios internos de código si
  fuese imprescindible — ideal 0 total). El reporte, la vista del alumno y la página print incluyen
  el disclaimer: "Tamizaje de priorización de trabajo correctivo; no es diagnóstico ni predice
  lesiones; no sustituye evaluación clínica." La UI dice "prioridad", nunca "riesgo de lesión".
  Se corrige la descripción "(tipo FMS)" en `ModulesForm.tsx`.
- **AC6 — Gating server-side.** Toda action/RSC del módulo llama `assertModule(db,
  'movement_assessment', ctx)` (ctx = teamId del recurso si es alumno de pool; coachId si
  standalone) ANTES de tocar datos; con el módulo OFF la action falla y la ruta hace `notFound()`.
  El nav-item solo aparece con el módulo ON (entitlement en `NAV_MODULES`). Kill-switch de
  operador (`DISABLED_MODULES`) apaga el módulo para TODOS sin migración ni deploy de datos.
- **AC7 — Consentimiento (bloqueante de captura).** En contexto team, finalizar una evaluación sin
  consentimiento `health_data_processing` activo (`client_consents.revoked_at IS NULL`) falla
  server-side con error claro. En standalone, el paso final exige atestación explícita del coach
  (checkbox) que crea/verifica un registro `client_consents` (`granted_via = 'coach_attestation'`).
  **En AMBOS contextos, finalizar estampa `consent_confirmed_at`**: en team es el timestamp de la
  verificación del consentimiento `health_data_processing` activo; en standalone, el de la
  atestación. Razón: el CHECK `movement_assessments_final_complete` exige la columna NOT NULL para
  `status='final'` — si el service la dejara NULL en la vía team, TODA finalización del pool
  fallaría en runtime. Cubierto con unit test del service en F3 (ambas vías). Sin consentimiento →
  no se guarda nada final.
- **AC8 — Aislamiento (suites SQL, corren en el gate autorizado).** Miembro de team A no ve
  evaluaciones de team B; coach standalone solo las de sus clientes propios (org∅+team∅); alumno
  solo SELECT de las suyas con `status='final'`; anon nada. INSERT/UPDATE cross-team rechazados
  por RLS. Helpers set-returning (sin per-row SECURITY DEFINER ni EXISTS correlacionado en la vía
  team), `EXPLAIN ANALYZE` con `loops=1`, `get_advisors` 0 críticos.
- **AC9 — Bitácora.** En contexto team: ver reporte (`view`), crear/editar (`create`/`update`),
  finalizar (`update`), export/print (`pdf_generate`) quedan en `team_access_logs` con
  `resource = 'movement_assessment'`. Best-effort (no rompe el flujo si falla el log).
- **AC10 — Mobile/teclado.** Wizard usable en tablet y teléfono: `h-dvh`/`min-h-dvh` (jamás
  `h-screen` fuera de `md:`), targets táctiles ≥44px en el segmented 0-3, safe-areas en barras
  fijas, dark mode completo, `useReducedMotion` respetado en transiciones.
- **AC11 — i18n.** Todo string visible usa `t()` con namespace `assessment.*`; keys agregadas a
  `es.json` Y `en.json` en el mismo commit; `assessment.title` es la key del nombre del módulo
  (renombrable sin tocar código).
- **AC12 — Calidad por tanda.** `pnpm typecheck` + `pnpm test` (vitest) verdes en cada tanda;
  `pnpm build` verde al cierre. E2E Playwright + suites SQL: SOLO en el gate final con OK explícito
  del usuario (regla 2026-06-10).

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Marca FMS en alguna superficie (incl. la desc actual de ModulesForm) | Legal (C&D de Functional Movement Systems) | Clean-room + AC5 con grep en CI manual + key `assessment.title`; corregir ModulesForm en F1 |
| Usuarios leen el semáforo como "riesgo de lesión" (evidencia no lo respalda) | Reputacional/legal sanitario (Ley 20.584) | Copy "prioridad de trabajo correctivo" + disclaimer obligatorio en TODAS las superficies (AC5) |
| RLS nueva degrada hot path (lección incidente 2026-06-09) | Prod caída | Tablas FRÍAS (≈2-4 filas/alumno/año); vía team con helpers set-returning `IN (SELECT helper())`; validación `EXPLAIN ANALYZE` + advisors en branch efímero ANTES de merge |
| Hoja real del kine difiere del protocolo asumido (patrones/umbrales) | Retrabajo de cálculo/UI | `protocol_version` en el modelo; cálculo puro aislado en `packages/calc` (cambiar umbrales = 1 función + golden tests); bloqueante ya pedido a Ani (§7 Director) |
| Dos evaluadores editan el mismo borrador a la vez | Pisado de datos | Awareness v1 (LOCKED #4): `last_edited_by` + indicador; borrador único por alumno; sin locking duro v1 |
| Datos de salud sin consentimiento (Ley 21.719) | Multa/DPA roto | Gate server-side AC7 + bitácora AC9 + datos solo en tablas RLS (sin Storage en v1) |
| Branch efímero olvidado (cobra USD 0.0134/h) | Costo | Protocolo Director §3: `list_branches` al inicio/fin, `delete_branch` el MISMO día |

## Bloqueantes a pedirle a Ani (extiende §7 del Director — no duplica)

> Ya pedido en §7: hoja real del screening del kine (¿7 patrones? ¿clearing de dolor? frecuencia
> re-test). Se AGREGAN estos, específicos del módulo:

1. **Nombre comercial** del screening para Movida: ¿les sirve "Screening de Movimiento de Ingreso"
   o tienen nombre interno propio? (es solo la key `assessment.title`, cero costo de cambio).
2. **Umbrales del semáforo**: ¿el kine usa los cortes de literatura (≤14 alta prioridad / 15-16
   media / ≥17 baja) o cortes propios? v1 hardcodea literatura; cortes custom serían v2.
3. **¿Quieren captura de video** por estación (clip corto por patrón)? Cambia consentimiento
   (`photo_storage`), storage y retención → decide si se planifica la fase 2.
4. **¿Recordatorio automático de re-test** (push/email al cumplirse N semanas)? Necesita la
   frecuencia oficial de re-test del centro.
5. **¿El screening es universal** (todo alumno de ingreso) **o solo derivados al kine**? Define si
   el hub muestra "alumnos sin screening" como lista de trabajo.
6. **¿Qué entrega física** esperan? (el print v1 reemplaza el Excel: confirmar si necesitan un
   formato A4 específico o basta el reporte branded).

## Open questions (técnicas, se resuelven en review — no bloquean a Ani)

- [ ] ¿Evaluación final inmutable? **Default v1:** final NO editable in-place; corregir = eliminar
  (pool full-access, queda en bitácora `delete`) y re-evaluar, o nueva evaluación. Evita ramas de
  edición sobre datos firmados con consentimiento.
- [ ] ¿El alumno ve TODAS sus evaluaciones finales o solo la última + evolución? Default v1: todas
  (solo lectura, `status='final'`).
- [ ] Enlace a correctivos por patrón más bajo: ¿entra al cierre de `specs/movida-areas` F5 o como
  slice propio? (fuera de alcance v1, decidir al planificar Plan 2 restante).
