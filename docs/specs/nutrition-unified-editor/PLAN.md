# PLAN — Editor unico de nutricion (T3.1 → T3.3)

Deriva de [SPEC.md](SPEC.md). Orden del programa padre: **UI converge primero, reducers
testeados se unifican al final**. Sin kill-switch (D3): cada corte es directo, rollback = revert;
el par viejo no se borra hasta 2 semanas estable Y plantillas migradas (D2).

## Ruta y cortes

- Superficie nueva: `apps/web/src/app/coach/nutrition-v2/[clientId]/editor` (ruta propuesta;
  definitiva al abrir W1). El par viejo no se mueve de sus rutas durante toda la ola.
- Corte 1 (fin de W4): la CTA "Editar plan" de la ficha y la puerta `?from=` apuntan al editor
  unico; wizard y quick-edit quedan accesibles solo desde el menu "..." como camino secundario.
- Corte 2 (T3.2b): plantillas migran; el wizard pierde su ultimo rol exclusivo.
- Retiro: tarea del programa padre, tras 2 semanas estable post-corte 2 (verificar importadores).

## Tandas

| Tanda | Contenido | Notas |
|-------|-----------|-------|
| W1 | Esqueleto del editor: ruta nueva, cabecera (nombre/estrategia/permiso/vigencia/metas/notas), canvas dias→franjas→items leyendo el read model, hidratacion `?from=` (vacio/plantilla/copia) y publish por `quickEditPublishAction` con CAS+idempotencia. Sin paleta todavia: alta de items con el `FoodPicker` actual | El reducer base es el del quick-edit web extendido con `SET_PLAN_NAME`/`SET_STRATEGY`/`SET_PERMISSION`/`SET_EFFECTIVE_FROM`. Editor accesible solo por URL directa (sin CTA): se QA en prod sin cortar nada |
| W2 | Capacidades wizard-only: variantes avanzadas (`ADD_VARIANTS` multiple, `DUPLICATE_VARIANT_AS`, targets por variante y modo), sustituciones por item, `APPLY_FOOD_OVERRIDE` (cierra el cruce incoherente: quick-edit web es el unico sin override) | La matriz de TASKS gobierna: cada accion o migra o muere con motivo |
| W3 | Layout final: paleta lateral desktop / sheet responsive, drag reorden (fallback menu), totales+Publicar fijos abajo, capsula unica dia/variante, copiar dia/semana con quick-select T2.6/F2 y porcion pegajosa T2.6/F4 | Pieza de UI mayor; harness local + Playwright ANTES de preview (regla owner) |
| W4 | **Corte 1**: CTA de ficha y puerta `?from=` al editor; wizard/quick-edit a camino secundario; `MOBILE_PARITY.md` declara el gap RN en el mismo commit | Preview con OK del owner antes del swap de CTA; 2 semanas de observacion arrancan aca |
| T3.2b | Plantillas: `nutrition-plans/new` y `[templateId]/edit` sobre el editor unico (modo plantilla = mismo lienzo sin alumno ni vigencia) | D2: tanda propia; desbloquea el retiro del wizard |
| R1 | Extraccion: gramatica superset a `packages/nutrition-v2` (modulo puro), tests golden de paridad contra los 4 reducers vivos, web consume el paquete | Obligatoria (riesgo 5 de la SPEC): sin R1 la ola no cierra |
| T3.3 | Editor RN Android sobre los reducers compartidos de R1; OTA android al cierre | iOS via OTA `--platform ios` solo post-aprobacion Apple |

## Dependencias y paralelismo

- W1→W2→W3→W4 es secuencial (cada tanda publica sobre la anterior).
- T3.2b y R1 pueden correr en paralelo tras W4; T3.3 exige R1 terminada.
- El retiro del par exige: corte 2 hecho + 2 semanas estable + verificacion de importadores.

## Gates por tanda

`pnpm lint` + `typecheck` + `test` + `build` + `check:tokens` + `check:nutrition-v2-boundaries`;
`pnpm --filter @eva/mobile exec tsc --noEmit` cuando se toque `apps/mobile` o `packages/*`;
`docs:check` cuando se toquen docs. Harness local verde antes de preview. Nada se declara verde
sin ejecucion real.
