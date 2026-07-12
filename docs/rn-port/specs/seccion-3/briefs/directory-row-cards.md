# Unidad: directory-row-cards (key: `directory-row-cards`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = las TARJETAS de alumno del directorio: la fila de lista (`DirRowCard`) y la tarjeta de grid (`ClientCard`).

## Alcance exacto
- Fila de lista: anillo/inicial, nombre, meta (separadores "·"), estado/riesgo, control trailing — `apps/mobile/components/coach/directory/DirRowCard.tsx` (160 L).
- Tarjeta de grid: `apps/mobile/components/coach/ClientCard.tsx` (241 L; export `ClientCard` + `CLIENT_CARD_HEIGHT`).

## webFiles (verdad web, paths verificados)
- `apps/web/src/app/coach/clients/DirRowCard.tsx` (172 L) — fila del directorio (nombre `font-black 15.5px`, inicial `font-black 18px`, control trailing `MoreVertical` → ClientActionsSheet, separadores `border-strong`).
- `apps/web/src/components/coach/ClientCardV2.tsx` + `ClientCardV2Skeleton.tsx` — tarjeta grid web.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/directory/DirRowCard.tsx` (160 L)
- `apps/mobile/components/coach/ClientCard.tsx` (241 L)

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/directory/directory-shared.ts` → owner `directory-screen` (consumir `RISK_LABELS`, tonos, helpers).
- `apps/mobile/components/coach/directory/ClientActionsSheet.tsx` → owner `directory-sheets` (el control trailing debe INVOCARLO; el sheet no se edita aqui).
- `apps/mobile/app/coach/(tabs)/clientes.tsx` → owner `directory-screen` (monta las cards en la FlatList).

## P0 / riesgos conocidos (audit R5 §2.2 `r5-audit-coach-core.md`)
- **§2.2 nombre (PX):** RN `displayBold(800) 15.5` vs web `font-black(900) 15.5 tracking-tight` (DirRowCard.tsx web L123).
- **§2.2 inicial del anillo (PX):** RN `displayBold(800) 18` vs web `font-black(900) 18` (web L109).
- **§2.2 control trailing (EST) — ALTO:** RN usa `ChevronRight` DECORATIVO (sin menu) (RN L93); web usa `IconButton MoreVertical` → abre `ClientActionsSheet` (acciones por fila) (web L159-169). **Reconstruir:** el trailing debe ser un boton de acciones que invoque el sheet (owner del sheet = `directory-sheets`; aqui se cablea el trigger). Si esto cambia el GESTO (chevron→abrir ficha vs boton→menu), verificar que el tap del cuerpo de la fila siga abriendo la ficha; anotar.
- **§2.2 separadores "·" (PX):** RN `theme.border` vs web `border-strong` (web L140).
- **Fabric 45798 (gotcha 6c):** N/A (sin TextInput en las cards).
- Sin sheets @gorhom ni fetch propio en las cards → sin bomba -999 ni congelamiento aqui.

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"DirRowCard"` (1 hit, L~10711). `"ClientCard"` / `"ClientCardV2"` (buscar) para diffs de la tarjeta grid.

## Notas de datos (queries/RPC, claves de dia)
- Las cards son presentacionales: reciben el objeto alumno + derived (riesgo/estado/adherencia) ya computado por `buildStats` (directory-shared.ts). Sin queries propias.
- Estado/riesgo/badges dependen de metricas calculadas en dia calendario **Santiago** (gotcha 6d) aguas arriba; la card solo pinta.
