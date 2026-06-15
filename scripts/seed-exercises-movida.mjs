/**
 * Seed F8 — Ejercicios de MOVILIDAD + FOAM ROLLER (Movida), GLOBALES, en español latino.
 *
 * 13 ejercicios correctivos/movilidad (foam roller + movilidad articular, lenguaje FMS/SFMA)
 * tomados de un template real de coach. Se cargan como librería del SISTEMA (ownership NULL =
 * visibles para TODO coach/alumno de EVA). Multimedia VACÍA (image/gif/video NULL) hasta que se
 * decida el formato. Cierra el F8 del plan 02 (movida-entrenamiento) para los tipos no-fuerza.
 *
 * IDEMPOTENTE: upsert por `id` determinístico (onConflict 'id' → re-correr re-aplica traducciones,
 * cero duplicados). NUNCA borra. Aditivo.
 *
 * Shapes verificados contra apps/web/src/lib/database.types.ts (exercises Insert) +
 * migración 20260611090001_exercise_types_team_catalog.sql (exercise_type, single-owner check).
 *
 * Uso (apunta al Supabase del env; doble gate para remoto/prod):
 *   PowerShell: $env:SEED_CONFIRM='yes'; node scripts/seed-exercises-movida.mjs --allow-remote
 *   bash:       SEED_CONFIRM=yes node scripts/seed-exercises-movida.mjs --allow-remote
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../apps/web/.env.local') })
config({ path: resolve(__dirname, '../.env.local'), override: false })

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el env.')
    process.exit(1)
}

// Gate de seguridad para apuntar a un Supabase remoto/prod.
const isLocal = URL.includes('127.0.0.1') || URL.includes('localhost')
const allowRemote = process.argv.includes('--allow-remote')
if (!isLocal && (!allowRemote || process.env.SEED_CONFIRM !== 'yes')) {
    console.error(`URL remota detectada (${URL}). Para escribir en remoto: --allow-remote + SEED_CONFIRM=yes.`)
    process.exit(1)
}
console.log(`[seed-exercises-movida] objetivo: ${URL} (${isLocal ? 'local' : 'REMOTO'})`)

// id determinístico: namespace 0f80 (= F8) + índice. Postgres uuid acepta cualquier valor de 128 bits.
const oid = (n) => `00000000-0000-0000-0f80-${String(n).padStart(12, '0')}`

/** Campos comunes a todos: global (sin dueño), sistema, multimedia vacía. */
const COMMON = {
    gender_focus: 'Neutro',
    source: 'system',
    coach_id: null,
    org_id: null,
    team_id: null,
    video_url: null,
    gif_url: null,
    image_url: null,
    deleted_at: null,
}

const EXERCISES = [
    {
        id: oid(1),
        name: 'Foam roller – Dorsal (espalda media)',
        muscle_group: 'Dorsal',
        exercise_type: 'roller',
        equipment: 'Foam roller',
        difficulty: 'Principiante',
        instructions: [
            'Acuéstate boca arriba con la zona media de la espalda sobre el foam roller, codos al frente y pies apoyados sosteniendo el peso.',
            'Rueda la espalda media de arriba hacia abajo; deja que la espalda alta se acomode sobre el rodillo manteniendo la altura de la cadera para ganar movilidad torácica (extensión).',
            'Nunca llegues al dolor: buscá una sensación justo por debajo del umbral de molestia.',
        ],
    },
    {
        id: oid(2),
        name: 'Foam roller – Glúteos',
        muscle_group: 'Glúteos',
        exercise_type: 'roller',
        equipment: 'Foam roller',
        difficulty: 'Principiante',
        instructions: [
            'Sentado sobre el foam roller con un glúteo apoyado y las manos sosteniendo el peso.',
            'Rueda el glúteo de arriba hacia abajo y de afuera hacia adentro.',
            'Sin llegar al dolor; presión justo bajo el umbral. Repetí en el glúteo opuesto.',
        ],
    },
    {
        id: oid(3),
        name: 'Foam roller – Isquiotibiales',
        muscle_group: 'Isquiotibiales',
        exercise_type: 'roller',
        equipment: 'Foam roller',
        difficulty: 'Principiante',
        instructions: [
            'Sentado con el isquiotibial apoyado sobre el foam roller y las manos sosteniendo el peso.',
            'Rueda el isquiotibial de arriba hacia abajo y de afuera hacia adentro.',
            'Sin llegar al dolor. Repetí en la pierna opuesta.',
        ],
    },
    {
        id: oid(4),
        name: 'Foam roller – Pantorrilla (gemelos)',
        muscle_group: 'Pantorrilla',
        exercise_type: 'roller',
        equipment: 'Foam roller',
        difficulty: 'Principiante',
        instructions: [
            'Sentado con la pantorrilla apoyada sobre el foam roller y las manos sosteniendo el peso.',
            'Rueda la pantorrilla de arriba hacia abajo y de afuera hacia adentro.',
            'Sin llegar al dolor; presión justo bajo el umbral de molestia.',
        ],
    },
    {
        id: oid(5),
        name: 'Descenso de pierna asistido con banda',
        muscle_group: 'Cadera',
        exercise_type: 'mobility',
        equipment: 'Banda elástica + Foam roller',
        difficulty: 'Intermedio',
        instructions: [
            'Boca arriba con las piernas (cerca del tobillo) sobre un foam roller; banda elástica alrededor de un pie.',
            'Con la banda, elevá esa pierna relajada lo más alto posible sin doblar la rodilla (sostén pasivo, sin dolor ni calambre).',
            'Elevá la otra pierna hasta el nivel de la asistida; si podés, subí un poco más tirando de la banda.',
            'Bajá la pierna activa lento y controlado, con la punta del pie hacia arriba, hasta la superficie elevada. Mantené lumbar y pelvis estables.',
        ],
    },
    {
        id: oid(6),
        name: 'Estiramiento de pierna recta asistido con banda',
        muscle_group: 'Cadena posterior',
        exercise_type: 'mobility',
        equipment: 'Banda elástica',
        difficulty: 'Principiante',
        instructions: [
            'Boca arriba, ambos pies sobre un soporte y la banda anclada a un pie.',
            'Tomá los extremos de la banda con el tobillo en dorsiflexión y elevá la pierna ayudándote de la banda.',
            'Sostené en el punto de resistencia; cuando ceda, tirá un poco más y sostené.',
            'Bajá la pierna lento hasta el piso.',
        ],
    },
    {
        id: oid(7),
        name: 'Rotación torácica en cuadrupedia (lumbar bloqueada)',
        muscle_group: 'Columna torácica',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'En cuadrupedia, sentá los glúteos sobre los talones con codos y antebrazos firmes en el piso.',
            'Una mano en la zona lumbar (palma hacia afuera). Mirá y rotá ese hombro hacia el techo.',
            'Volvé y llevá el hombro hacia el piso, manteniendo el brazo de apoyo firme.',
            'Luego colocá la mano detrás de la cabeza y repetí guiando con el codo.',
        ],
    },
    {
        id: oid(8),
        name: 'Rotación con estabilidad de tronco (rodillas flexionadas)',
        muscle_group: 'Tronco',
        exercise_type: 'mobility',
        equipment: 'Foam roller o toalla',
        difficulty: 'Intermedio',
        instructions: [
            'Boca arriba, rodillas y caderas a 90°, hombros a 90° y brazos extendidos; foam roller o toalla entre las rodillas.',
            'Rotá las rodillas hacia un lado manteniendo el omóplato opuesto pegado al piso.',
            'Volvé al centro y rotá hacia el otro lado. La mano del lado de la rotación gira hacia abajo; la opuesta queda hacia arriba.',
            'Para más dificultad, extendé las rodillas. Volvé los pies al piso.',
        ],
    },
    {
        id: oid(9),
        name: 'Cat/Camel',
        muscle_group: 'Columna',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'En cuatro apoyos: rodillas bajo las caderas, manos bajo los hombros, columna neutra. Prestá atención a la respiración.',
            'Al exhalar, llevá la espalda hacia el techo (gato), acercando cabeza y coxis hacia el piso; exhalá completo al final del rango.',
            'Al inhalar, invertí el movimiento (camello): hundí la espalda y elevá cabeza y coxis.',
            'Repetí lo indicado y volvé a la posición inicial con 2-3 respiraciones normales.',
        ],
    },
    {
        id: oid(10),
        name: 'Dorsiflexión en media rodilla con bastón',
        muscle_group: 'Tobillo',
        exercise_type: 'mobility',
        equipment: 'Bastón',
        difficulty: 'Principiante',
        instructions: [
            'En media rodilla (posición angosta), con un bastón frente al 4° dedo del pie de adelante.',
            'Manteniéndote erguido, llevá la rodilla por fuera del bastón y empujala hacia adelante; el talón delantero mantiene contacto con el piso.',
            'Llegá al final del rango y hacé un ciclo de respiración. Volvé y repetí.',
        ],
    },
    {
        id: oid(11),
        name: 'Rotación en media rodilla con bastón',
        muscle_group: 'Cadera / Columna',
        exercise_type: 'mobility',
        equipment: 'Bastón',
        difficulty: 'Principiante',
        instructions: [
            'En media rodilla (posición 90/90): una rodilla bajo la cadera, el otro pie alineado con esa rodilla. Pie de adelante apenas apoyado.',
            'Mantené el cuerpo lo más alto posible, en línea oreja-hombro-cadera-rodilla.',
            'Rotá el bastón lento hacia un lado lo máximo posible; al final, respirá profundo y volvé. Repetí al otro lado.',
        ],
    },
    {
        id: oid(12),
        name: 'Brettzel 2.0',
        muscle_group: 'Cadena posterior',
        exercise_type: 'mobility',
        equipment: 'Ninguno',
        difficulty: 'Intermedio',
        instructions: [
            'Sentado de costado, con el muslo de adelante y los hombros paralelos entre sí.',
            'Extendé la pierna de adelante manteniendo los hombros paralelos; rotá hacia adelante y atrás entre el lado de la cadera baja y la posición inicial.',
            'Tras unas rotaciones, llevá la mano más cercana a la rodilla de abajo por debajo de la otra mano.',
            'Hacé una flexión lateral hacia abajo manteniendo recto el brazo de apoyo.',
        ],
    },
    {
        id: oid(14),
        name: 'Sentadilla con toque de puntas (toe touch squat)',
        muscle_group: 'Tren inferior',
        exercise_type: 'mobility',
        equipment: 'BOSU / Step / Balón',
        difficulty: 'Intermedio',
        instructions: [
            'Pies al ancho de hombros, con un objeto (BOSU, step o balón) a ~15 cm frente a las puntas; elevá los talones con una tabla o toalla.',
            'Bajá tocando y presionando el objeto, descendiendo a la sentadilla por debajo de los 90° de rodilla.',
            'Subí un brazo a la vez hacia la posición sobre la cabeza.',
            'Empujá el piso con los pies para salir de la sentadilla.',
        ],
    },
]

async function main() {
    const admin = createClient(URL, KEY, { auth: { persistSession: false } })
    const rows = EXERCISES.map((e) => ({ ...COMMON, ...e }))
    const { error } = await admin.from('exercises').upsert(rows, { onConflict: 'id' })
    if (error) {
        console.error('[seed-exercises-movida] error:', error.message)
        process.exit(1)
    }
    console.log(`[seed-exercises-movida] OK — ${rows.length} ejercicios globales upserted (roller + mobility, multimedia vacía).`)
}

main()
