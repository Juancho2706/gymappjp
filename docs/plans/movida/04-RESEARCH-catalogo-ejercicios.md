# 04 · RESEARCH — Poblado del catalogo de ejercicios (datos + multimedia) — 2026-06-11

> Insumo para F8 de `specs/movida-entrenamiento/TASKS.md` (seed del catalogo Movida). Investigacion web con fuentes fechadas 2025-2026. Nada implementado aun; decision de compra pendiente del dueno.

## Hallazgo previo (deuda legal existente)

El catalogo system ACTUAL ya hotlinkea GIFs de `v2.exercisedb.io` y `exercisedb-api.vercel.app` (whitelisteados en `apps/web/next.config.ts` L66-70, copy "Catalogo global · ExerciseDB" en `ExerciseCatalogClient.tsx`). El [FAQ de exercisedb.io](https://exercisedb.io/faq) dice que el uso comercial del dataset requiere compra → **media sin licencia comercial + dependencia de un host ajeno** (si ese CDN muere, el catalogo system queda sin GIFs de un dia para otro). La recomendacion de abajo sanea esto.

## Schema real (verificado en repo)

`exercises`: `name`, `muscle_group` (NOT NULL), `body_part`, `equipment`, `difficulty`, `exercise_type` (CHECK: `strength|cardio|mobility|roller` — **NO existe `functional`**: HYROX mapea a `strength`, ergs a `cardio`), `instructions: string[]`, `secondary_muscles: string[]`, `gif_url`, `image_url`, `video_url`, `source`, `coach_id|org_id|team_id` (system = los 3 NULL). Media: bucket `exercise-media` (upload coach solo GIF/JPEG/PNG/WebP, paths `{coach_id}/...` — el seed service-role debe usar prefijo propio, ej. `system/` o `team-movida/`).

## 1. Fuentes de datos — veredictos

| Fuente | # | Español | Licencia comercial | Media | Veredicto |
|---|---|---|---|---|---|
| [free-exercise-db](https://github.com/yuhonas/free-exercise-db) | 870+ | No | **Unlicense (dominio publico)** — sin restriccion; paper trail de imagenes informal (riesgo bajo) | 2 JPG inicio/fin | ✅ Base de texto capa A |
| [ExerciseDB.io dataset](https://exercisedb.io/) ([Gumroad](https://exercisedb.gumroad.com/l/exercisedb)) | 1.500+ | No | **Compra one-time perpetua**, display in-app + re-host OK; no revender dataset | GIFs 180p→1080p por tier | ✅ Compra recomendada (precio: verificar en [pricing](https://exercisedb.io/pricing)) |
| [wger](https://wger.de/en/software/api) | ~845 en | **Si (parcial, 30 idiomas)** | Data CC-BY-SA → atribucion + share-alike (incomodo white-label) | Imagenes CC | ⚠️ Solo si se acepta atribucion |
| [MuscleWiki API](https://musclewiki.com/api-terms) | 1.900+ / 7.500 videos (incl. funcionales) | No | Streaming-only, **prohibido almacenar**, atribucion obligatoria | Videos reales | ❌ Rompe white-label + seed |
| [API Ninjas](https://api-ninjas.com/tos) | 3.000+ | No | Derecho muere al cancelar suscripcion | No | ❌ |
| Kaggle datasets | 470-2.500 | No | Scrapes con procedencia sucia | Variable | ❌ Riesgo legal |
| [ExRx](https://exrx.net/Store/Other/Licensing) | 2.100+ | No | Premium mensual (precio a consultar) | Videos | ⚠️ Sin compra perpetua |
| [Your Move](https://ymove.app/exercise-api/pricing) | 698+ videos HD white-label | No | API desde $19/mes con brand licensing | Video HD | ⚠️ Candidato si se quiere video real |

## 2. Multimedia

- **Stock (Pexels/Pixabay/Storyblocks/Envato): descartado** como base — sin cobertura sistematica por ejercicio; Pexels en zona gris "standalone".
- **YouTube embed**: legal con player oficial, pero links muertos + ads + branding ajeno → solo fallback opcional del coach (`video_url` ya lo soporta).
- **Hosting propio en Supabase Storage (recomendado)**: Pro incluye 100 GB storage + 250 GB egress ($0.03-0.09/GB overage). 300-500 clips de 5-10 s ≈ 0,3-0,8 GB. MP4/WebM loop = 10-50x mas liviano que GIF, pero el render actual trata `gif_url` como imagen → **WebP animado = cero cambios de codigo hoy**; MP4 + `<video>` como mejora posterior. Subir en tandas (leccion Disk IO Micro 2026-06-10).
- **AI video 2026: gimmick** para demos tecnicas (riesgo de forma incorrecta inaceptable en contexto kine). La IA madura esta en analisis de forma, no generacion.
- **HYROX/funcional: ninguna fuente open lo cubre con media licenciable** → grabar en Movida (ver capa C).

## 3. Español

wger es la unica fuente open con español real (parcial). Via correcta: **traduccion LLM batch** (300-800 ejercicios ≈ USD 5-20 en tokens) + glosario es-CL/latam neutro fijo + **revision del kine de Ani sobre el CSV final** (= insumo que F8 ya espera) + alias en ingles para busqueda.

## 4. Recomendacion — 3 capas (mapea a columna `scope` del CSV F8)

| Capa | Contenido | Texto | Media | scope | exercise_type |
|---|---|---|---|---|---|
| **A** Fuerza clasica (~150-300) | gym estandar | free-exercise-db traducido LLM | **Comprar ExerciseDB.io one-time** y re-hostear GIFs en bucket propio (sanea el hotlink); fallback $0: JPGs de free-exercise-db | system | strength |
| **B** Cardio/movilidad/roller (~30-60) | run/bike/row/ski erg, estiramientos, foam roller | redaccion propia LLM + validacion kine | foto estatica (maquinas); grabar estiramientos en Movida | system | cardio/mobility/roller |
| **C** Funcional HYROX + lista kine (~30-50) | sled push/pull, farmer carry, wall balls, burpee broad jump, sandbag lunges | redaccion propia (ref. rulebook HYROX) validada por Movida | **grabar en Movida**: DIY smartphone ≈ $0-200 o videografo $1.000-3.000 USD una vez; clips 5-10 s loop WebP | team (Movida) o system los genericos | strength (mayoria) / cardio (ergs) |

**Costo total:** frugal ≈ USD 0 + tokens; recomendado ≈ compra ExerciseDB one-time (decenas a pocos cientos USD, verificar) + grabacion DIY. Hosting dentro del Pro.

**Pasos F8:** (1) decidir compra ExerciseDB (guardar license.pdf); (2) `data/seed/exercises-movida.csv` calzando schema real (solo los 4 exercise_type del CHECK); (3) `scripts/seed-exercises-movida.mjs` idempotente service-role + subida de media a prefijo reservado del bucket; (4) sesion de grabacion en Movida (checklist encuadre/fondo/5-10 s); (5) traduccion LLM + glosario + revision kine → doble corrida idempotente en branch efimero antes del gate.

Fuentes completas con URLs en el transcript del research (agente 2026-06-11); las claves estan linkeadas arriba. Precios de ExerciseDB.io / ExRx Premium / MuscleWiki PRO no expuestos en resultados de busqueda — verificar en pagina antes de decidir.
