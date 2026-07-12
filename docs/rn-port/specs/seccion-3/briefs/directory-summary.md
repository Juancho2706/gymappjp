# Unidad: directory-summary (key: `directory-summary`)

PORT 1:1 Seccion 3 — COACH. **Web = fuente de verdad.** Esta unidad = el RESUMEN / WarRoom movil del directorio (metricas del dia, PulseCard, MetricChips, entrada a Herramientas) + el banner de alerta del directorio.

## Alcance exacto
- `apps/mobile/components/coach/directory/DirectorySummary.tsx` (206 L): PulseCard (valor/label), grid de MetricChips, eyebrow "Resumen · hoy", entrada Herramientas.
- `apps/mobile/components/coach/directory/DirectoryAlertBanner.tsx` (74 L): banner de alerta (alumnos en riesgo / sin plan).

## webFiles (verdad web, paths verificados)
- `apps/web/src/app/coach/clients/CoachWarRoom.tsx` (472 L) — bloque `md:hidden` = WarRoom movil: eyebrow "Tu seguimiento de hoy" + h1 "Alumnos", icon-buttons copiar-portal (LinkIcon) + importar (FileUp), grid-4 (Total·Activos·**Adher.%**·**Nutri.**), "Resumen · hoy" COLAPSABLE, card Herramientas prominente, PulseCard.

## rnFiles PROPIOS (disjuntos, verificados)
- `apps/mobile/components/coach/directory/DirectorySummary.tsx` (206 L)
- `apps/mobile/components/coach/directory/DirectoryAlertBanner.tsx` (74 L)

## READ-ONLY (de otras unidades — NO tocar)
- `apps/mobile/components/coach/directory/directory-shared.ts` → owner `directory-screen` (`getCoachDirectoryPulse`, `buildStats`, tonos, `RISK_LABELS`).
- `apps/mobile/app/coach/(tabs)/clientes.tsx` → owner `directory-screen` (monta DirectorySummary en el header; el `ScreenHeader` y los icon-buttons copiar-portal/importar del header son de clientes.tsx — coordinar).
- La card "Herramientas" navega a `apps/mobile/app/coach/tools.tsx` (destino read-only; solo `router.push`).

## P0 / riesgos conocidos (audit R5 §2.3 `r5-audit-coach-core.md`)
- **§2.3 metricas secundarias (EST) — ALTO:** grid-4 distinto. Web = Total·Activos·**Adher.%**·**Nutri.** (nutrition-low); RN = Total·Activos·**On track**·**Sin plan** (L124-129). Reemplazar el set de metricas por el del web (faltan Adher.% y Nutri.; sobran On track y Sin plan).
- **§2.3 "Resumen · hoy" colapsable (EST):** web es COLAPSABLE (ChevronDown + linea-resumen colapsada, con persistencia); RN no colapsa (L133,168). Portar el gesto colapsar/expandir + persistencia. Si cambia el GESTO respecto al RN actual → verificar y anotar.
- **§2.3 entrada Herramientas (EST):** web = card full-width prominente (tile `bg-sport-100 sport-600` LayoutGrid + "Herramientas" + subtitulo "Cardio · Movimiento · Composicion" + chevron); RN = pill chica en header (Wrench 15). Reconstruir como card prominente con subtitulo (nota: en RN la pill esta en clientes.tsx header — decidir donde vive la card; coordinar con `directory-screen`).
- **§2.3 MetricChip / PulseCard (PX):** valor 17/800 vs web 15.5/900; label uppercase de mas; PulseCard label 12 vs 11.5.
- **§2.3 header eyebrow (EST):** web "Tu seguimiento de hoy" + h1 "Alumnos" + icon-buttons copiar-portal/importar; RN ScreenHeader "N activos · N total" sin copiar-portal. Los icon-buttons del header son de `directory-screen` — coordinar copy VERBATIM.
- Sin sheets @gorhom ni fetch propio directo (recibe pulse por props) → sin bomba -999. Confirmar que el pulse llega por props (si hace fetch propio → gotcha 6b).

## Componentes a grepear en ola0-hallazgos.json
`docs/rn-port/ola0-hallazgos.json`: `"WarRoom"` / `"DirectorySummary"` / `"PulseCard"` / `"MetricChip"` (buscar). `"DirectoryActionBar"` = 0 hits; base es R5 §2.3.

## Notas de datos (queries/RPC, claves de dia)
- `getCoachDirectoryPulse()` (directory-shared.ts, read-only) → metricas del resumen. Adher.% y Nutri. se computan sobre semana/dia **Santiago** (gotcha 6d).
- Copy VERBATIM: "Tu seguimiento de hoy", "Resumen · hoy", "Herramientas", "Cardio · Movimiento · Composicion", labels de metricas (Total/Activos/Adher./Nutri.).
