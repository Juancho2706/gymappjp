/**
 * Seed — Ejercicios de REHABILITACIÓN / READAPTACIÓN globales, en español latino.
 *
 * Espejo exacto de `scripts/seed-cardio-exercises.mjs`: mismos gates, misma idempotencia (upsert
 * por `id` determinístico), misma ownership (NULL = librería del SISTEMA, visible para TODO
 * coach/alumno) y multimedia VACÍA a propósito (si mañana se le cargan videos, re-correr el seed
 * los PRESERVA: un upsert solo actualiza las columnas del payload).
 *
 * Por qué existe (docs/specs/coach-onboarding-v2, W3 F3.4): la persona `rehab` del onboarding v2
 * siembra un alumno de ejemplo con pauta domiciliaria en tres áreas (Movilidad / Control motor /
 * Fortalecimiento). Sin este catálogo, esa rama abre el builder con movilidad genérica y sin nada
 * de control motor ni propiocepción — justo el «prometer lo que no existe» que la spec marca como
 * riesgo.
 *
 * 24 ejercicios en cuatro bloques (`body_part` guarda el bloque; `muscle_group` es la CATEGORÍA
 * del catálogo, igual que 'Cardio' o 'Movilidad' en los seeds hermanos):
 *   Movilidad (6) · Control motor (7) · Propiocepción (5) · Fortalecimiento (6)
 *
 * `exercise_type` respeta el CHECK vigente (`strength | cardio | mobility | roller`, migración
 * 20260611090001): lo correctivo va como `mobility` y lo que se carga va como `strength`.
 *
 * IDEMPOTENTE: upsert por `id` (onConflict 'id'). NUNCA borra. ADITIVO.
 *
 * Uso:
 *   Ensayo (no escribe nada, no pide confirmación):
 *     node scripts/seed-rehab-exercises.mjs --dry-run
 *   Escritura remota (doble gate):
 *     PowerShell: $env:SEED_CONFIRM='yes'; node scripts/seed-rehab-exercises.mjs --allow-remote
 *     bash:       SEED_CONFIRM=yes node scripts/seed-rehab-exercises.mjs --allow-remote
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../apps/web/.env.local') })
config({ path: resolve(__dirname, '../.env.local'), override: false })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const dryRun = process.argv.includes('--dry-run')

if (!dryRun && (!SUPABASE_URL || !SERVICE_KEY)) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el env.')
    process.exit(1)
}

const isLocal = Boolean(SUPABASE_URL) && (SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost'))
const allowRemote = process.argv.includes('--allow-remote')
if (!dryRun && !isLocal && (!allowRemote || process.env.SEED_CONFIRM !== 'yes')) {
    console.error(`URL remota detectada (${SUPABASE_URL}). Para escribir en remoto: --allow-remote + SEED_CONFIRM=yes.`)
    process.exit(1)
}
console.log(
    dryRun
        ? '[seed-rehab-exercises] DRY-RUN: no se escribe nada.'
        : `[seed-rehab-exercises] objetivo: ${SUPABASE_URL} (${isLocal ? 'local' : 'REMOTO'})`,
)

// id determinístico: namespace 0f81 (= el siguiente al 0f80 del catálogo de movilidad) + índice.
const oid = (n) => `00000000-0000-0000-0f81-${String(n).padStart(12, '0')}`

/**
 * Campos comunes: global (sin dueño), sistema, categoría Rehabilitación.
 * NO incluye media: ver la cabecera.
 */
const COMMON = {
    muscle_group: 'Rehabilitación',
    gender_focus: 'Neutro',
    source: 'system',
    coach_id: null,
    org_id: null,
    team_id: null,
    deleted_at: null,
}

const EXERCISES = [
    // ── Movilidad ────────────────────────────────────────────────────────────────────────────
    {
        id: oid(1),
        name: 'Báscula pélvica en supino',
        body_part: 'Movilidad',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Acuéstate boca arriba con las rodillas dobladas y los pies apoyados al ancho de la cadera.',
            'Lleva la pelvis hacia atrás pegando la zona lumbar al piso y luego hacia adelante dejando un hueco chico.',
            'El movimiento es corto y lento: no despegues los glúteos ni empujes con las piernas.',
        ],
    },
    {
        id: oid(2),
        name: 'Estiramiento del psoas en media rodilla',
        body_part: 'Movilidad',
        exercise_type: 'mobility',
        equipment: 'Colchoneta',
        difficulty: 'Principiante',
        instructions: [
            'Apoya una rodilla en el piso y la otra pierna adelante en 90°.',
            'Mete la pelvis (glúteo apretado) y avanza el peso sin arquear la espalda.',
            'Debes sentirlo en la ingle de la pierna de atrás, nunca en la zona lumbar.',
        ],
    },
    {
        id: oid(3),
        name: 'Apertura de cadera en posición 90/90',
        body_part: 'Movilidad',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Intermedio',
        instructions: [
            'Sentado en el piso, una pierna adelante en 90° y la otra al costado también en 90°.',
            'Con la espalda alta, gira el tronco hacia la pierna de adelante y vuelve.',
            'Cambia de lado rotando las dos rodillas al mismo tiempo, sin usar las manos si puedes.',
        ],
    },
    {
        id: oid(4),
        name: 'Movilidad de tobillo contra la pared',
        body_part: 'Movilidad',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Ponte frente a una pared con el pie a un palmo de distancia.',
            'Lleva la rodilla hacia la pared sin despegar el talón del piso.',
            'Si el talón se levanta, acerca el pie; si llegas fácil, alójalo un centímetro más.',
        ],
    },
    {
        id: oid(5),
        name: 'Deslizamiento neural del ciático',
        body_part: 'Movilidad',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Sentado en una silla, estira una pierna y lleva la punta del pie hacia ti mientras miras hacia abajo.',
            'Luego dobla la rodilla, suelta el pie y mira al frente. Alterna con ritmo suave.',
            'Es un deslizamiento, no un estiramiento: no busques tensión ni sostengas la posición.',
        ],
    },
    {
        id: oid(6),
        name: 'Extensión pasiva de rodilla en prono',
        body_part: 'Movilidad',
        exercise_type: 'mobility',
        equipment: 'Colchoneta',
        difficulty: 'Principiante',
        instructions: [
            'Boca abajo en una camilla o cama, con la rodilla y la pierna por fuera del borde.',
            'Deja que el peso de la pierna estire la rodilla; relaja el muslo por completo.',
            'Sostén el tiempo prescrito respirando tranquilo. No fuerces con las manos.',
        ],
    },

    // ── Control motor ────────────────────────────────────────────────────────────────────────
    {
        id: oid(7),
        name: 'Respiración diafragmática 360°',
        body_part: 'Control motor',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Acuéstate boca arriba con las manos en las costillas bajas.',
            'Inhala por la nariz llevando el aire hacia los lados y hacia atrás, sin levantar los hombros.',
            'Exhala lento por la boca sintiendo cómo bajan las costillas.',
        ],
    },
    {
        id: oid(8),
        name: 'Activación del transverso abdominal en supino',
        body_part: 'Control motor',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Boca arriba con las rodillas dobladas y los dedos apoyados a los lados del ombligo.',
            'Sin contener la respiración, tensa suave la pared abdominal como si te ajustaras un cinturón.',
            'Sostén el tiempo indicado sin mover la pelvis ni apretar los glúteos.',
        ],
    },
    {
        id: oid(9),
        name: 'Perro-pájaro (bird dog)',
        body_part: 'Control motor',
        exercise_type: 'mobility',
        equipment: 'Colchoneta',
        difficulty: 'Principiante',
        instructions: [
            'En cuatro apoyos, con la espalda neutra y el abdomen firme.',
            'Estira un brazo y la pierna contraria hasta la línea del cuerpo, sin arquear la espalda.',
            'Vuelve controlado y cambia de lado. La pelvis no se mueve en todo el ejercicio.',
        ],
    },
    {
        id: oid(10),
        name: 'Dead bug (bicho muerto)',
        body_part: 'Control motor',
        exercise_type: 'mobility',
        equipment: 'Colchoneta',
        difficulty: 'Principiante',
        instructions: [
            'Boca arriba con brazos al techo y caderas y rodillas en 90°.',
            'Baja un brazo y la pierna contraria manteniendo la zona lumbar pegada al piso.',
            'Si la espalda se despega, acorta el recorrido. Exhala al bajar.',
        ],
    },
    {
        id: oid(11),
        name: 'Marcha en supino con presión de talones',
        body_part: 'Control motor',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Boca arriba con caderas y rodillas en 90° y el abdomen firme.',
            'Baja un pie hasta tocar el piso con el talón y vuelve, alternando como una marcha lenta.',
            'La pelvis se mantiene quieta: si se balancea, baja menos.',
        ],
    },
    {
        id: oid(12),
        name: 'Plancha lateral con rodillas apoyadas',
        body_part: 'Control motor',
        exercise_type: 'mobility',
        equipment: 'Colchoneta',
        difficulty: 'Principiante',
        instructions: [
            'De lado, apoyado en el antebrazo y las rodillas dobladas atrás.',
            'Sube la cadera hasta alinear hombro, cadera y rodilla, y sostén.',
            'Hombro sobre el codo y cuello largo. Respira sin cortar el aire.',
        ],
    },
    {
        id: oid(13),
        name: 'Puente de glúteos con control abdominal',
        body_part: 'Control motor',
        exercise_type: 'mobility',
        equipment: 'Colchoneta',
        difficulty: 'Principiante',
        instructions: [
            'Boca arriba con las rodillas dobladas y los pies al ancho de la cadera.',
            'Mete un poco la pelvis, aprieta los glúteos y sube la cadera hasta alinear rodilla, cadera y hombro.',
            'No busques altura arqueando la espalda: sube solo hasta donde manda el glúteo.',
        ],
    },

    // ── Propiocepción ────────────────────────────────────────────────────────────────────────
    {
        id: oid(14),
        name: 'Apoyo monopodal en superficie estable',
        body_part: 'Propiocepción',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'De pie, sube una rodilla hasta la altura de la cadera y sostén el equilibrio.',
            'Reparte el peso en toda la planta del pie de apoyo y mantén la cadera nivelada.',
            'Ten una pared o silla cerca por si necesitas apoyarte.',
        ],
    },
    {
        id: oid(15),
        name: 'Apoyo monopodal con ojos cerrados',
        body_part: 'Propiocepción',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Intermedio',
        instructions: [
            'Igual que el apoyo en una pierna, pero cerrando los ojos.',
            'Empieza con 10 segundos y sube de a poco. Ten un apoyo al alcance de la mano.',
            'Si te vas de lado, corrige desde el pie y el tobillo, no dando pasos.',
        ],
    },
    {
        id: oid(16),
        name: 'Apoyo monopodal sobre superficie inestable',
        body_part: 'Propiocepción',
        exercise_type: 'mobility',
        equipment: 'Cojín o disco de equilibrio',
        difficulty: 'Intermedio',
        instructions: [
            'Párate en una pierna sobre un cojín o disco de equilibrio.',
            'Mantén la rodilla levemente flexionada y la cadera nivelada.',
            'Empieza cerca de una pared: la idea es corregir en chico, no pelear con el equilibrio.',
        ],
    },
    {
        id: oid(17),
        name: 'Alcance con una pierna en estrella (Y-balance)',
        body_part: 'Propiocepción',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Intermedio',
        instructions: [
            'Párate en una pierna y alcanza con el otro pie hacia adelante, atrás-adentro y atrás-afuera.',
            'Toca suave el piso con la punta y vuelve al centro sin apoyar el peso.',
            'La rodilla de apoyo se dobla acompañando; no se va hacia adentro.',
        ],
    },
    {
        id: oid(18),
        name: 'Paso lateral con banda en tobillos',
        body_part: 'Propiocepción',
        exercise_type: 'mobility',
        equipment: 'Banda elástica',
        difficulty: 'Principiante',
        instructions: [
            'Banda en los tobillos, media sentadilla y pies al ancho de la cadera.',
            'Da pasos laterales manteniendo la tensión de la banda todo el tiempo.',
            'Las puntas de los pies apuntan al frente y el tronco no se balancea.',
        ],
    },

    // ── Fortalecimiento ──────────────────────────────────────────────────────────────────────
    {
        id: oid(19),
        name: 'Activación de cuádriceps en supino',
        body_part: 'Fortalecimiento',
        exercise_type: 'strength',
        equipment: 'Toalla enrollada',
        difficulty: 'Principiante',
        instructions: [
            'Boca arriba con la pierna estirada y una toalla enrollada bajo la rodilla.',
            'Aprieta el muslo empujando la rodilla contra la toalla y levanta apenas el talón.',
            'Sostén el tiempo indicado y suelta lento.',
        ],
    },
    {
        id: oid(20),
        name: 'Elevación de pierna recta en supino',
        body_part: 'Fortalecimiento',
        exercise_type: 'strength',
        equipment: 'Colchoneta',
        difficulty: 'Principiante',
        instructions: [
            'Boca arriba, una rodilla doblada con el pie apoyado y la otra pierna estirada.',
            'Aprieta el muslo de la pierna estirada y súbela hasta la altura de la rodilla contraria.',
            'Baja controlado sin dejarla caer. La rodilla no se dobla en el camino.',
        ],
    },
    {
        id: oid(21),
        name: 'Sentadilla a la silla',
        body_part: 'Fortalecimiento',
        exercise_type: 'strength',
        equipment: 'Silla',
        difficulty: 'Principiante',
        instructions: [
            'De pie frente a una silla, con los pies al ancho de la cadera.',
            'Baja llevando la cadera atrás hasta rozar el asiento y sube apretando los glúteos.',
            'Rodillas en línea con las puntas de los pies; el pecho no se cae al piso.',
        ],
    },
    {
        id: oid(22),
        name: 'Bisagra de cadera con bastón',
        body_part: 'Fortalecimiento',
        exercise_type: 'strength',
        equipment: 'Bastón',
        difficulty: 'Principiante',
        instructions: [
            'Sostén un bastón en la espalda tocando cabeza, espalda alta y sacro.',
            'Lleva la cadera hacia atrás doblando poco las rodillas, hasta sentir los isquiotibiales.',
            'Los tres puntos de contacto no se pierden en ningún momento.',
        ],
    },
    {
        id: oid(23),
        name: 'Elevación de talones de pie',
        body_part: 'Fortalecimiento',
        exercise_type: 'strength',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'De pie, con los dedos apoyados en una pared solo para equilibrio.',
            'Sube los talones lo más alto que puedas y baja lento hasta el piso.',
            'Sin rebotar: la bajada dura el doble que la subida.',
        ],
    },
    {
        id: oid(24),
        name: 'Rotación externa de hombro con banda',
        body_part: 'Fortalecimiento',
        exercise_type: 'strength',
        equipment: 'Banda elástica',
        difficulty: 'Principiante',
        instructions: [
            'Codo pegado al cuerpo en 90°, con una toalla enrollada bajo la axila si te ayuda.',
            'Lleva el antebrazo hacia afuera sin despegar el codo del costado.',
            'Vuelve lento. Sin dolor: si aparece, baja la tensión de la banda.',
        ],
    },
]

async function main() {
    const rows = EXERCISES.map((e) => ({ ...COMMON, ...e }))

    if (dryRun) {
        console.log(`[seed-rehab-exercises] ${rows.length} ejercicios que se escribirían:\n`)
        for (const row of rows) {
            console.log(
                `  ${row.id}  ${row.body_part.padEnd(16)} ${row.exercise_type.padEnd(9)} ${row.equipment.padEnd(26)} ${row.name}`,
            )
        }
        const porBloque = rows.reduce((acc, row) => ({ ...acc, [row.body_part]: (acc[row.body_part] ?? 0) + 1 }), {})
        console.log(`\n[seed-rehab-exercises] por bloque:`, porBloque)
        const ids = new Set(rows.map((r) => r.id))
        const names = new Set(rows.map((r) => r.name))
        if (ids.size !== rows.length) throw new Error('ids duplicados en el payload')
        if (names.size !== rows.length) throw new Error('nombres duplicados en el payload')
        console.log('[seed-rehab-exercises] DRY-RUN OK — ids y nombres únicos, nada escrito.')
        return
    }

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
    const { error } = await admin.from('exercises').upsert(rows, { onConflict: 'id' })
    if (error) {
        console.error('[seed-rehab-exercises] error:', error.message)
        process.exit(1)
    }
    console.log(
        `[seed-rehab-exercises] OK — ${rows.length} ejercicios de rehabilitación globales upserted (multimedia vacía).`,
    )
}

main()
