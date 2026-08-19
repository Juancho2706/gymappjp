# QA1 Ejecutor V3 · Unidad 08 — Movilidad y Roller (recuperación)

## Veredicto (2 líneas)
El acento recovery (aqua `#18abd4`) está bien aplicado en **web** (fijo en ambos temas, tal como manda el contrato). El problema grave está en **Roller web**, que abandonó el layout del mockup (contador vertical + botón juicy gigante "+1 pasada") y lo reemplazó por una fila `[−][número][+]` con botones chicos sin héroe; además faltan animación de rebote, botón "Completar" y el CTA "Listo este lado" de Movilidad web. En **RN** el layout es más fiel, pero el acento recovery NO es aqua fijo en modo coach (cae a la marca), rompiendo la paridad con web.

**Severidad máxima: BLOCKER** (Roller web).

---

## Contexto de contrato (importante para no re-tocar)
El mockup base de estas dos pantallas es `concepto-a-v3-tipos.html` (columnas "Movilidad" y "Roller"). Ahí Movilidad usa el tono `--calm-a3b: #8ab6c8` y Roller usa el verde de marca. **La iteración final (decisión Ola 0) cambió el acento a `--exec-recovery: #18abd4` aqua fijo para AMBAS pantallas** (globals.css:3239-3242 "aqua FIJO en ambos temas"; artifact px-card "Aqua #18ABD4 (recovery)"). Por lo tanto:
- Que Movilidad/Roller salgan **aqua** (no #8ab6c8, no verde) es CORRECTO, no un delta.
- El mockup sigue siendo la referencia de **layout, jerarquía, tamaños, radios, sombras, tipografía, copy y animaciones**; solo el color de acento evolucionó a aqua.

El registro reusa `LogSetForm`/`ActiveSetRow` tipado (decisión "INTOCABLE"): las filas de captura y el pie de cuadritos de serie NO son "ejecutor viejo", son reuso intencional. No se cuentan como delta.

---

## Deltas — MOVILIDAD

| # | Sev | Delta | Mockup (evidencia) | Web (file:line · valor) | RN (file:line · valor) | Fix |
|---|-----|-------|--------------------|--------------------------|-------------------------|-----|
| M1 | **MAYOR** | Web no tiene el CTA juicy "Listo este lado"; el avance/confirmación queda solo en el anillo + LogSetForm. RN sí lo tiene. | `.a3b-juicy.calm.a3b-mob-cta` "Listo este lado", 60px alto, 17px, acento calm, texto `#08222b` (tipos:748-750, 321-326) | MobilityStepV3.tsx — **ausente** (solo `exec-v3-holdwrap` + filas) | MobilityScreenV3.tsx:229-237 `JuicyButton label="Listo este lado"/"Listo"` height 58, accentText `#08222b` — presente | Agregar botón juicy recovery "Listo este lado" (perSide) / "Listo" en web, altura 60px |
| M2 | **MAYOR** | Anillo de hold demasiado delgado; el mockup es grueso/juicy. | `.a3b-holdring` mask `radial-gradient(closest-side, transparent 77%, #000 78%)` → aro ≈ **23,5px** de grosor sobre r=107 (tipos:308-314) | MobilityStepV3.tsx:125,132 `strokeWidth="12"` (~12,3px escalado) | MobilityScreenV3.tsx:205 `strokeWidth={14}` | Subir grosor a ~22-24px en ambos (web y RN) |
| M3 | **MAYOR** | Número del hold más chico que el mockup. | `.a3b-holdnum` **60px**/900/ls -.04em/`#eef4f6` (tipos:316) | globals.css:3291-3296 `.exec-v3-holdnum` **52px** | MobilityScreenV3.tsx:213 fontSize **56** | Subir a 60px |
| M4 | MENOR | Color del título de Movilidad: el mockup usa un blanco frío específico. | `.a3b-exname.calm-t` `#eef4f6` (tipos:134) | globals.css:1620-1626 `.exec-v3-exname` `#f4f4f6` (genérico) | MobilityScreenV3.tsx:149 `color: s.text` (`#f4f4f6`) | Teñir el título de movilidad a `#eef4f6` |
| M5 | MENOR | Falta el label "Mantén" + punto live pulsante sobre la media. | `.a3b-medialbl` "Manten" + `.a3b-live.calm` pulso (tipos:722, 150-156) | MobilityStepV3.tsx:88-100 — sin overlay | MobilityScreenV3.tsx:167-170 — TypedMediaV3 sin label (el propio comentario dice que lo pinta el consumidor) | Overlay "Mantén" con dot recovery pulsante en la media |
| M6 | MENOR | sidepill de lado más chico en web (RN sí coincide). | `.a3b-sidepill` pad **10/20**, **19px**/900, `.lr` **14px** (tipos:300-306) | globals.css:3325-3343 pad **8/18**, **17px**, dot **13px** | MobilityScreenV3.tsx:197-201 pad 20/10, 19px, dot 14px — coincide | Igualar web al mockup (19px, pad 10/20, dot 14px) |
| M7 | MENOR | Label "Sostén": tracking y color. | `.a3b-holdlbl` ls **.16em**, `#8fa3ab` (tipos:317) | globals.css:3302-3308 ls **.14em**, `#8f8f9c` | MobilityScreenV3.tsx:216 ls 2, color aqua .9 (ni uno ni otro) | Ajustar ls .16em y color `#8fa3ab` |
| M8 | MENOR | "Serie N de M": tracking. | `.a3b-mob-set` ls **.06em** (tipos:320) | globals.css:3251-3256 `.exec-v3-mobset` ls **.04em** | — | ls .06em |
| M9 | MENOR | Copy del chip: el mockup pone solo "Movilidad"; la impl. agrega el músculo. | chip `Movilidad` solo (tipos:683) | MobilityStepV3.tsx:80 `Movilidad · {muscle_group}` | MobilityScreenV3.tsx:156 `Movilidad · {muscle}` | Decisión de copy: dejar "Movilidad" o aceptar el enriquecimiento (consistente web/RN) |
| M10 | MENOR | RN: media más alta y borde aqua-tint. | media 150px, borde calm `#2a333a` (tipos:138-144) | 150px, borde `#2a333a` — coincide | MobilityScreenV3.tsx:22,168 `MEDIA_HEIGHT=168`, borde `hexToRgba(accent,0.22)` | Bajar a 150px y borde frío `#2a333a` para paridad |
| M11 | MENOR | RN: "luego: …" con grises genéricos en vez de fríos. | `.a3b-thenlbl` `#6f7c82` / b `#9fb2b9` (tipos:318-319) | globals.css:3345-3352 `.exec-v3-then` `#6f7c82` / `#9fb2b9` — coincide | MobilityScreenV3.tsx:223-224 `textDim #6f6f7c` / `textMuted #8f8f9c` | Usar `#6f7c82` / `#9fb2b9` |

---

## Deltas — ROLLER

| # | Sev | Delta | Mockup (evidencia) | Web (file:line · valor) | RN (file:line · valor) | Fix |
|---|-----|-------|--------------------|--------------------------|-------------------------|-----|
| R1 | **BLOCKER** | Layout de Roller web NO coincide con el contrato. El mockup = contador **vertical** (número → "de 12" → "Pasadas") + botón juicy **gigante full-width** "+1 pasada" (92px, con icono +) como HÉROE ("es EL botón de la pantalla") + pie con timerchip y "Completar". Web = fila **horizontal** `[−1][número][+1]` con botones 60×60 icon-only; NO existe el botón juicy "+1 pasada" ni "Completar". RN sí conserva el +1 juicy. | `.a3b-counter` vertical (tipos:788-792) + `.a3b-plusbtn` "+1 pasada" 92px full-width (tipos:358-369, 794-796) | RollerStepV3.tsx:104-130 `exec-v3-counter` flex row + `exec-v3-cbtn`/`is-plus` 60×60 sin label (globals.css:3364-3414) | RollerScreenV3.tsx:166-191 JuicyButton "+1 pasada" height 72 breathing + −1 56px — fiel | Rehacer Roller web: contador vertical + botón juicy recovery full-width "+1 pasada" (icono +) como acción principal; −1 discreto opcional |
| R2 | **MAYOR** | Web: el número gigante no rebota al sumar (el mockup salta con micro-spring). | `.a3b-bignumber { animation: concept-a3b-tickpop }` micro-rebote (tipos:565, 597) | globals.css:3376-3382 `.exec-v3-bignumber` — sin animación | RollerScreenV3.tsx:149-158 MotiView spring — presente | Pop/scale (spring) al incrementar en web |
| R3 | **MAYOR** | Número gigante más chico que el mockup. | `.a3b-bignumber` **116px**/900/ls -.05em (tipos:352-354) | globals.css:3377 **88px** | RollerScreenV3.tsx:155 fontSize **104** | Subir a 116px (o cercano) |
| R4 | **MAYOR** | Web: falta el botón "Completar" del pie; el cierre queda solo en LogSetForm. | `.a3b-roll-foot` = timerchip + `.a3b-roll-done` "Completar" (tipos:798-805) | RollerStepV3.tsx:132-139 — timerchip **centrado solo**, sin "Completar" | RollerScreenV3.tsx:210-221 "Completar" presente | Agregar "Completar" al pie de Roller web |
| R5 | MENOR | RN: "Completar" pintado como juicy aqua, pero el mockup lo quiere plano/secundario. | `.a3b-roll-done` plano `#1c1c24` / borde `#2f2f3a` / texto `#e8e8ee` (tipos:380-384) | (web no lo tiene → ver R4) | RollerScreenV3.tsx:211-220 JuicyButton (aqua filled) | Estilo secundario plano, no juicy (el héroe es el "+1 pasada") |
| R6 | MENOR | timerchip web muestra "Cronómetro" fijo, no el tiempo corriendo. | `.a3b-timerchip` con "1:24" corriendo + "Opcional" (tipos:799-803) | RollerStepV3.tsx:134-138 texto fijo "Cronómetro" (abre timer global) | RollerScreenV3.tsx:202-208 muestra elapsed al correr — coincide | Mostrar el tiempo inline al correr |
| R7 | MENOR | Jerarquía del sublabel del contador. Mockup: "de 12" (14px, `#8f8f9c`, NO mayúsculas) y "Pasadas" (11px, ls .16em, mayúsculas) en **dos** líneas. Web las fusiona en una sola línea mayúsculas (ls .14em). | `.goalof` + `.lbl` separados (tipos:356-357) | globals.css:3383-3390 + RollerStepV3.tsx:118-120 fusionado "de N · Pasadas" | RollerScreenV3.tsx:160-162 separado en dos — coincide | Separar "de N" (14px) y "Pasadas" (11px, .16em) |
| R8 | MENOR | Copy del objetivo: web omite el sufijo por lado. | "Objetivo: 10-12 pasadas **por pierna**" (tipos:786) | RollerStepV3.tsx:98-100 "Objetivo: {N} pasadas" (sin sufijo) | RollerScreenV3.tsx:143 usa `rollerGoalLabel` → "… **por lado**" (typed-screen-model.ts:158) | Añadir sufijo "por lado" cuando `per_side` en web |
| R9 | MENOR | Falta el label "En loop" + dot live sobre la media (igual que M5). | `.a3b-medialbl` "En loop" + `.a3b-live` (tipos:775) | RollerStepV3.tsx:83-95 — sin overlay | RollerScreenV3.tsx:133-136 — sin label | Overlay "En loop" con dot recovery |

---

## Delta transversal — ACENTO RECOVERY

| # | Sev | Delta | Contrato (evidencia) | Web | RN | Fix |
|---|-----|-------|----------------------|-----|-----|-----|
| A1 | **MAYOR** | El acento recovery NO es aqua fijo en RN modo coach: cae a la marca del coach. El contrato exige aqua fijo en AMBOS temas; web lo cumple, RN solo en modo `eva`. En cuentas white-label (modo coach), la MISMA sesión sale aqua en web y con la marca en RN. | globals.css:3239-3242 "el subtree adopta el acento recovery (**aqua FIJO en ambos temas**, decisión Ola 0)"; `--exec-recovery: #18abd4` fijo (globals.css:1420); tarea: "acento `#18abd4` aqua, **no marca**" | `.exec-v3-calm { --exec-brand: var(--exec-recovery,#18abd4) }` → aqua siempre, en ambos temas ✓ | exec-theme.ts:127-138 modo coach `recovery: accent` (marca); solo modo `eva` → `#18ABD4` (línea 117) | En modo coach fijar `recovery: EVA_EXEC_RECOVERY` (`#18ABD4`) para movilidad/roller — o confirmar con el dueño de diseño si RN debe ser monocromático (contradice web + contrato) |

---

## Cumple (fiel — no re-tocar)
- **Acento aqua recovery bien resuelto en web** (ambos temas) vía `.exec-v3-calm` sobre-escribiendo `--exec-brand` a `--exec-recovery #18abd4`: chips, anillo, sidepill, dots y controles adoptan el aqua. RN también correcto en modo `eva`.
- **Media calmada (fría)** `linear-gradient(160deg,#1c242a,#161b20)` borde `#2a333a` coincide exactamente con `.a3b-media.calm` en web (globals.css:3246-3249 vs tipos:144).
- **Movilidad — secuencia per_side eyes-free** (lado izq → háptico → lado der, arranque automático del 2º lado) implementada en web (MobilityStepV3.tsx:62-69) y RN (MobilityScreenV3.tsx:99-118), fiel al bullet del mockup.
- **Movilidad — copy "luego: lado derecho"** y colores del `.exec-v3-then` (`#6f7c82` / `#9fb2b9`) coinciden en web (globals.css:3345-3352 vs tipos:318-319).
- **Movilidad — sidepill RN** coincide en dimensiones exactas con el mockup (19px/900, pad 10/20, dot 14px).
- **Movilidad — color del número de hold** `#eef4f6` coincide (web y mockup).
- **Roller — RN conserva el héroe**: botón juicy "+1 pasada" (breathing) + micro-spring del número + −1 discreto, fiel al `.a3b-plusbtn` / bullets del mockup.
- **Roller — chips** "Roller" (aqua) + músculo plain, contador tabular y cronómetro opcional presentes en web y RN.
- **Sin restos del ejecutor viejo**: ambas pantallas usan clases `exec-v3-*` limpias; el reuso de `LogSetForm`/`ActiveSetRow` y el pie de cuadritos es reuso tipado intencional, no legacy.
- **Media empty fallback** con icono coherente (Move en movilidad, GitCommit en roller) en web y RN.

---

### Resumen de conteo
- BLOCKER: 1 (R1 · Roller web sin héroe/layout)
- MAYOR: 7 (M1, M2, M3, R2, R3, R4, A1)
- MENOR: 13 (M4-M11, R5-R9)

**Total deltas: 21** (1 BLOCKER, 7 MAYOR, 13 MENOR).
</content>
</invoke>
