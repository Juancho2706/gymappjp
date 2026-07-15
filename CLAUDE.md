# Claude CLI — instrucciones para EVA

## Contexto de trabajo

- Repositorio: `Juancho2706/gymappjp`
- Rama obligatoria para este rework: `Nuevascosasrnopenai`
- PR: #121, debe permanecer draft
- Base del PR: `rnmobiledenuevo`
- Supabase productivo: proyecto `constant`

No trabajar en `master` ni hacer merge a `rnmobiledenuevo` desde este handoff.

## Lectura obligatoria

Antes de editar código, leer:

1. `docs/product/nutrition-v2/CLAUDE_CLI_HANDOFF_2026-07-15.md`
2. `docs/product/nutrition-v2/VALIDATION_RISKS_AND_KNOWN_BLOCKERS_2026.md`
3. `docs/product/nutrition-v2/CURRENT_IMPLEMENTATION_AND_FILE_MAP_2026.md`
4. `docs/product/nutrition-v2/REMAINING_ROADMAP_AND_DEFINITION_OF_DONE_2026.md`
5. `docs/product/NUTRITION_V2_MASTER_EXECUTION_PLAN_2026.md`

Índice completo:

- `docs/product/nutrition-v2/README.md`

## Primer objetivo

No comenzar una nueva tanda hasta estabilizar el estado actual:

1. reproducir y corregir Vitest;
2. conectar los gateways profesionales a los RPC scoped;
3. corregir cancelación real de requests en React Native;
4. ejecutar todos los gates;
5. cerrar documentalmente Tandas 4 y 5.

## Comandos de validación

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm check:tokens
pnpm --filter @eva/mobile exec tsc --noEmit
npx vitest run
```

Después de estabilizar el bloque, ejecutar las pruebas SQL transaccionales y E2E indicadas en los documentos de handoff.

## Reglas no negociables

- Supabase es producción y tiene usuarios reales.
- Todo DDL debe ser aditivo, versionado y probado con rollback.
- No borrar ni renombrar objetos legacy durante el desarrollo V2.
- No activar `nutrition_v2` globalmente.
- No reescribir historial ni inventar consumo/macros antiguos.
- No exponer service role en web, PWA o React Native.
- No mezclar shells/componentes V1 dentro de rutas V2.
- No introducir APIs externas de alimentos en runtime.
- No añadir IA generativa ni costos por tokens.
- Respetar standalone, EVA Teams y organización mediante workspace explícito.
- Mantener paridad funcional web responsive/PWA/RN.
- Mantener light/dark/white label y accesibilidad.

## Vercel

Juan pidió reducir Build CPU Time.

- No hacer push por cada corrección.
- Corregir localmente y agrupar un bloque completo.
- Ejecutar todos los gates antes del push final.
- Generar un solo Preview al finalizar dos tandas o un bloque acordado.
- Verificar `vercel.json`: durante el handoff las builds quedaron pausadas con `ignoreCommand` para evitar consumo innecesario.

No quitar la pausa mientras CI esté rojo.

## Estado resumido

- Tandas 0–3: cerradas/documentadas.
- Tandas 4–5: infraestructura y vertical slices implementados, pero no están listas para rollout.
- Mobile TypeScript: verde en la última corrida observada.
- Lint, typecheck web y tokens: verdes.
- Vitest: rojo en la última corrida observada.
- V2 productiva: esquema aplicado, 0 planes/intakes/snapshots reales.
- Catálogo: 344 alimentos existentes, 0 barcode, 0 productos Chile, 0 imágenes.

No declarar Tanda 4 o 5 completada hasta cumplir sus Definition of Done.
