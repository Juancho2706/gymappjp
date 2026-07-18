# Sweep copy español neutro (eliminación de voseo) — apps/web

Fecha: 2026-07-10
Decisión CEO: el copy del producto WEB debe ser español **latino neutro** (tuteo estándar).
Se elimina TODO el voseo rioplatense de las strings user-facing (y, por limpieza, de comentarios)
en `apps/web/src`. NO se tocó `apps/mobile` (otro workflow) ni `packages/*` (sin voseo).

## Resumen

- **Total de reemplazos: 472** (460 automáticos por script + 12 manuales).
- **Archivos tocados: 132** (todos bajo `apps/web/src`).
- **Tests actualizados: 0** — ningún test asevera copy con voseo (verificado por grep).
- `packages/*` (incl. dicts i18n de movement/exchanges): **0 ocurrencias** de voseo.

Método: grep sistemático + script Node con reemplazo whole-word (boundaries unicode-aware,
preservando mayúscula/minúscula). Se auditó de forma exhaustiva con listas de frecuencia de
palabras terminadas en `á / ás / és / ís / í / é` para separar voseo de futuros
(`será`, `podrás`, `activará` — idénticos en tuteo, se dejan), adverbios (`acá`, `aquí`, `jamás`,
`atrás`) y primeras personas del pretérito (ver "Casos NO tocados").

## Conteo por forma

### Presente indicativo (vos → tú)
- podés → puedes: 34
- tenés → tienes: 28
- querés → quieres: 7
- necesitás → necesitas: 7
- debés → debes: 6
- seguís → sigues: 4
- gestionás → gestionas: 3
- conservás → conservas: 3
- trabajás → trabajas: 2
- pensás → piensas: 2
- subís → subes: 2
- entrenás/sumás/calificás/esperás/reintentás/abrís/creés/suspendés/modificás/cambiás/dejás/continuás/configurás/arrancás/agregás/ahorrás/movés/pasás: 1 c/u
- sos → eres: 1 (manual; evitado en script por colisión con acrónimo "SOS")

### Imperativo -ar (á → a, con cambios de raíz)
- intentá → intenta: 35
- revisá → revisa: 18
- creá → crea: 16
- usá → usa: 12
- probá → prueba: 11
- empezá → empieza: 9
- iniciá → inicia: 9
- completá → completa: 8
- agregá → agrega: 8
- contactá → contacta: 7
- seleccioná → selecciona: 7
- confirmá/personalizá/esperá: 5 c/u
- ingresá/sumá/hacé*(ver -er)/cancelá/actualizá/activá/importá/reintentá/organizá/expandí*(ver -ir): 4–5 c/u
- tocá(3), verificá(3), arrastrá(3), ajustá(3): 3 c/u
- descansá/cambiá/dejá/calculá/asigná/recargá/superá: 2 c/u
- guardá→guarda variantes, filtrá, cortá, trabajá, enviá, pagá, marcá(0)... y singles:
  entrená, filtrá, cortá, trabajá, enviá, pagá, agendá, mové, limpiá, instalá, ignorá, copiá,
  saltá, avanzá, desagrupá, alterná, eliminá, armá, combiná, migrá, borrá, solicitá, pasá,
  diseñá, hablá, gestioná, ahorrá, potenciá, forzá→**fuerza** (o→ue): 1 c/u
- pegá → pega: 1 · asegurate → asegúrate: 1 · desbloqueá → desbloquea: 1 · entrá → entra: 2
- registrate → regístrate: 1 · escribinos → escríbenos: 5 · dejalo → déjalo: 1
- asignale → asígnale: 4 · asignáselo → asígnaselo: 1 · revisálo → revísalo: 1
- pedíselo → pídeselo: 1 (manual)

### Imperativo -er/-ir (é/í → e, con cambios de raíz)
- elegí → elige: 26
- seguí → sigue: 7
- compartí → comparte: 6
- respondé → responde: 6
- hacé → haz: 5
- volvé → vuelve: 4
- mantené → mantén: 4
- escribí → escribe: 3
- subí → sube: 2 · repetí → repite: 2 · abrí → abre: 2 · construí → construye: 2 · encendé → enciende: 2
- pedí → pide: 1 · recibí → recibe: 1 · conocé → conoce: 1

### Pronombre "vos" (manual, según contexto)
- "sobre vos" → "sobre ti": 1 (privacidad)
- "(vos)" / "· vos" / "Vos quedas" / "ni vos" → tú: 9 (TeamMembersManager, CoachTeamDesktop, settings, drip + transactional emails)

## Casos NO tocados (ambiguos / no-voseo) y por qué

1. **Primera persona del pretérito (homógrafa del voseo, NO es voseo)** — se conservan:
   - `sentí` → "Ej: sentí molestia en el hombro" (placeholder de nota del alumno, `LogSetForm.tsx`).
   - `dormí` / `entrené` → notas de check-in en fixtures ("dormí mejor", "entrené 3 veces").
   - `¡Completé "..."!` → texto que comparte el alumno de su logro (`WorkoutSummaryOverlay`).
   - `Pasé de cinco planillas...` → testimonial en 1ª persona (landing).
   - `Ya pagué` / `Ya confirmé` → labels de botón en 1ª persona.
   - `creé`/`activé` → comentarios de código en 1ª persona ("creé el one-shot").

2. **Futuro (idéntico en tuteo y voseo, NO es voseo)** — se dejan tal cual:
   `será`, `serás`, `podrás`, `podrá`, `deberás`, `verás`, `activará`, `recibirá`, `guardará`,
   `perderás`, `usarás`, `pagarás`, `encontrarás`, etc.

3. **Adverbios / sustantivos neutros** — no son voseo: `acá`, `aquí`, `ahí`, `allí`, `allá`,
   `jamás`, `atrás`, `detrás`, `después`, `además`, `demás`, `través`, `país`, `inglés`, `revés`,
   `Mié` (abreviatura de miércoles), `caché` (término técnico), `esté`/`estés` (subjuntivo de estar).

---

# Sweep copy español neutro — apps/mobile (RN)

Fecha: 2026-07-10 · Rama: `rnmobiledenuevo` · QA Ronda 4 Lote B.
Mismo método (script Node + reemplazo whole-word case-preserving, boundaries unicode-aware)
sobre `apps/mobile/**/*.{ts,tsx}`. Los fixers pixel de hoy habían copiado voseo de la web:
se barrió TODO (strings user-facing y comentarios). Homógrafos de 1ª persona conservados.

## Resumen mobile

- **Total de reemplazos: ~195** (187 por script + 8 manuales).
- **Archivos tocados: 56.**
- Homógrafos 1ª persona **NO tocados** (no son voseo): `Ya confirmé` (botón verify-email),
  `¡Completé "..."!` (texto que comparte el alumno — WorkoutSummaryOverlay, WorkoutSummaryModal).

## Conteo por forma (script, whole-word)

- Intentá 10 · Podés 16 (Podés 10 + podés 6) · Elegí 9 · Revisá 9 · Tocá 10 (Tocá 7 + tocá 3)
- Creá 7 · Usá 8 (Usá 3 + usá 5) · Tenés 9 (Tenés 2 + tenés 7) · Subí 7 (Subí 6 + subí 1)
- Compartí 4 · Escribinos 5 · Seguí 4 · Agregá 7 (Agregá 5 + agregá 2) · Probá 3 · Completá 4
- Ingresá 4 · Seleccioná 3 · Confirmá 2 · Pedí 3 · Activá 2 · Reactivá 2 · Definí 2 · Desbloqueá 2
- pegá 3 · sumá 3 (Sumá 1 + sumá 2) · cambiás 2 · trabajás 3 · Dejalo 1 · usalo 1 · agregalos 1
- singles: Iniciá, Registrate, esperá, querés, Encendé, Contactá, Asigná, necesitás, Necesitás,
  completá, Guardá, Empezá, Armá/armá, deslizá, Entrená, Personalizá, Forzá, usás, Apagá, entrenás,
  saltá, Escribí, Debés, Verificá, reducí, Esperá, revisá, Querés, seguís, movés, definís, Definís,
  creás, agregás, Registrás, subís, mantené

## Manuales (8)

- `vos` → pronombre neutro según contexto: features.tsx (`ven vos`→`ven tú`, `para vos`→`para ti`),
  support-faq.ts (`vos defines`→`tú defines`). 3 casos.
- Presente -ás/-ís que el script no cubría (agregados a mano): `asignás`→`asignas`, `editás`→`editas`,
  `ajustás`→`ajustas`, `desbloqueás`→`desbloqueas` (nutricion.tsx), `decidís`→`decides` (features.tsx). 5 casos.

## Verificación mobile

- Grep dictionary consolidado de voseo en `apps/mobile` → **0 ocurrencias** (salvo `confirmé`/`Completé` 1ª persona).
- `apps/mobile` `tsc --noEmit` → **EXIT 0**.

---

## Verificación

- `pnpm --filter @eva/web typecheck` → **EXIT 0** (tsc --noEmit, sin errores).
- `vitest run` sobre módulos con copy cambiado (addons/route + change-card.service) → **33 tests verde**.
- Grep final consolidado de formas voseantes en `apps/web/src` → **0 ocurrencias** (excepto los
  homógrafos de 1ª persona documentados arriba, que NO son voseo).
- Escaneo por frecuencia de terminaciones `á/ás/és/ís/í/é` → solo quedan futuros, adverbios y
  primeras personas legítimas.
