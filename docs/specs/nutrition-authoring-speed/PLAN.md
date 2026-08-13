# PLAN — T2.6 Velocidad de autoria del coach

Orden elegido por riesgo: primero lo que no toca la base (F1, F2), despues el DDL (F3) y recien
ahi lo que lo consume (F4). Asi una tanda que se cae no deja la LIVE a medias.

| Fase | Que entrega | Por que en este orden |
|------|-------------|-----------------------|
| F0 | SPEC + PLAN + TASKS + decisiones D1/D2 | Regla del repo: feature nueva no arranca sin los tres documentos |
| F1 | Gramatica destructiva: `RESTORE_SLOT` + undo de franja en el wizard, muere el confirm de quick-edit | Cero DB, cero red. Es la pieza que mas riesgo de perdida de trabajo elimina y sirve de calentamiento del reducer |
| F2 | Copy semana: modulo puro (proximos 1/2/4 + modo reemplazar/anexar + conteo previo) y su UI en los dos menus | Cero DB. El modulo puro se testea solo y las dos superficies lo consumen igual, como ya pasa con `copy-presets.ts` |
| F3 | DDL `coach_food_last_qty` en LIVE | Protocolo de `AGENTS.md`: EXPLAIN + tx-rollback ANTES, advisors DESPUES. Ninguna UI depende todavia de la tabla, asi que un rollback no rompe nada |
| F4 | Porcion pegajosa punta a punta: repository → service → action → precarga en `ADD_ITEM` | Recien con la tabla viva y verificada |
| F5 | Notas visibles en el wizard + fix de "Rehacer" que resetea `visible_notes` | Independiente; va al final porque es la mas chica y cierra deuda de PR #174 |
| F6 | Paridad RN de lo que aplique + QA + `MOBILE_PARITY.md` | Un export verde no sustituye QA en device |

## Decisiones tecnicas

**La precedencia de la porcion pegajosa se resuelve en SQL, no en TypeScript.** Una sola lectura
ordenada por `client_id nulls last` devuelve la fila ganadora; resolverlo en la app obligaria a dos
consultas o a traerse las dos filas para descartar una.

**El modulo de copia devuelve un plan de copia, no ejecuta.** Misma forma que `copy-presets.ts`:
entra (dia origen, destinos, modo) y sale (que destinos quedan iguales, cuantas franjas se suman,
que se pisa). La UI muestra ese objeto y la CTA de siempre lo ejecuta. Testeable sin React.

**`RESTORE_SLOT` copia la firma de `RESTORE_ITEM`** (`_lib/draft-builder.ts:864-869`): idempotente
—si la franja ya existe, no-op— y con indice de reinsercion.

**El write de la porcion pegajosa no bloquea la UI.** Es una sugerencia para la proxima vez: si
falla, se traga en silencio y el coach no se entera de nada. Nunca puede impedir guardar un plan.

## Gates por fase

Los que apliquen al diff, con evidencia real: `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm --filter @eva/mobile exec tsc --noEmit`, `pnpm check:nutrition-v2-boundaries`,
`pnpm check:tokens`, `pnpm docs:check`. F3 suma advisors de Supabase despues de aplicar.

## Riesgo de release

Todo T2.6 es JS puro salvo F3 (DDL). El OTA android sale al cierre, con `--platform android`
obligatorio mientras iOS 1.1.0 siga en App Review.
