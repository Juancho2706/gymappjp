/**
 * Seed — Ejercicios de CARDIO globales, en español latino (catálogo del módulo cardio).
 *
 * 8 modalidades de cardio/acondicionamiento (con-máquina + sin-máquina) para que el módulo
 * `cardio` sirva out-of-the-box: sin estos, un coach que compra cardio abre el módulo con el
 * catálogo vacío de ejercicios tipo `cardio`. Se cargan como librería del SISTEMA (ownership
 * NULL = visibles para TODO coach/alumno). muscle_group = 'Cardio' (categoría del catálogo).
 * Multimedia VACÍA. La zona/duración/intervalos las prescribe el coach por bloque en el builder;
 * acá solo va una "Prescripción sugerida" en las instrucciones.
 *
 * Modalidades elegidas por research jun-2026 (ubicuidad) + revisión adversarial:
 * cinta, trote exterior, caminata, bici estática, remo, elíptica, saltar la cuerda, burpees (HIIT).
 *
 * IDEMPOTENTE: upsert por `id` determinístico (onConflict 'id'). NUNCA borra. Aditivo.
 *
 * Uso (apunta al Supabase del env; doble gate para remoto/prod):
 *   PowerShell: $env:SEED_CONFIRM='yes'; node scripts/seed-cardio-exercises.mjs --allow-remote
 *   bash:       SEED_CONFIRM=yes node scripts/seed-cardio-exercises.mjs --allow-remote
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

const isLocal = URL.includes('127.0.0.1') || URL.includes('localhost')
const allowRemote = process.argv.includes('--allow-remote')
if (!isLocal && (!allowRemote || process.env.SEED_CONFIRM !== 'yes')) {
    console.error(`URL remota detectada (${URL}). Para escribir en remoto: --allow-remote + SEED_CONFIRM=yes.`)
    process.exit(1)
}
console.log(`[seed-cardio-exercises] objetivo: ${URL} (${isLocal ? 'local' : 'REMOTO'})`)

// id determinístico: namespace 0ca0 (= cardio) + índice.
const oid = (n) => `00000000-0000-0000-0ca0-${String(n).padStart(12, '0')}`

/**
 * Campos comunes: global (sin dueño), sistema, categoría Cardio.
 * NO incluye media: si se cargan videos a estos ejercicios después, re-correr el seed los preserva
 * (un upsert solo actualiza las columnas del payload; incluir video_url:null las pisaría).
 */
const COMMON = {
    muscle_group: 'Cardio',
    exercise_type: 'cardio',
    gender_focus: 'Neutro',
    source: 'system',
    coach_id: null,
    org_id: null,
    team_id: null,
    deleted_at: null,
}

const EXERCISES = [
    {
        id: oid(1),
        name: 'Carrera / trote en cinta de correr',
        equipment: 'Cinta de correr',
        difficulty: 'Principiante',
        instructions: [
            'Ajusta la velocidad y la inclinación para que el esfuerzo coincida con la zona prescrita; corre suelto, sin agarrarte del frente.',
            'Pisa bajo el centro de masa con cadencia alta y zancada corta, hombros relajados.',
            'Mantén el ritmo objetivo estable durante todo el bloque; usa la inclinación si el plano se siente demasiado fácil.',
            'Prescripción sugerida: Z2 base aeróbica, 20-40 min continuo (Z3-Z4 en tempo, Z5 en sprints).',
        ],
    },
    {
        id: oid(2),
        name: 'Trote / carrera al aire libre',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Comienza con un trote suave para entrar en la zona objetivo; regula el ritmo por la sensación de esfuerzo.',
            'Pisa bajo el cuerpo con cadencia alta y zancada corta, hombros sueltos.',
            'Sostén el ritmo prescrito; en intervalos, alterna tramos fuertes con trote de recuperación.',
            'Prescripción sugerida: Z2 base aeróbica, 20-40 min o por distancia (intervalos Z4-Z5, ej. 6x400 m).',
        ],
    },
    {
        id: oid(3),
        name: 'Caminata',
        equipment: 'Ninguno',
        difficulty: 'Principiante',
        instructions: [
            'Camina a paso firme, apoyando talón y punta, con el pecho arriba y los brazos acompañando el ritmo.',
            'Sube la cadencia o agrega inclinación para alcanzar la zona objetivo sin perder la técnica.',
            'Mantén un ritmo constante durante toda la duración prescrita.',
            'Prescripción sugerida: Z1-Z2 recuperación o base de baja intensidad, 30-45 min continuo.',
        ],
    },
    {
        id: oid(4),
        name: 'Bicicleta estática',
        equipment: 'Bicicleta estática',
        difficulty: 'Principiante',
        instructions: [
            'Ajusta el sillín a la altura de la cadera y regula la resistencia según la zona objetivo.',
            'Pedalea de forma redonda, empujando y jalando el pedal, con las rodillas alineadas y el core firme, sin rebotar en el sillín.',
            'Mantén la cadencia (RPM) y la resistencia que correspondan al ritmo prescrito.',
            'Prescripción sugerida: Z2 base aeróbica, 30-60 min continuo (Z3-Z4 en bloques de potencia, Z5 en sprints).',
        ],
    },
    {
        id: oid(5),
        name: 'Máquina de remo',
        equipment: 'Remoergómetro',
        difficulty: 'Intermedio',
        instructions: [
            'Sujeta el mango con la espalda neutra y empuja primero con las piernas, luego abre la cadera y jala con los brazos.',
            'Al volver, invierte el orden: brazos, cadera y piernas; mantén el movimiento fluido y continuo.',
            'Sostén el ritmo (paladas por minuto) y la zona prescrita durante todo el trabajo.',
            'Prescripción sugerida: Z2 base/técnica, por tiempo o distancia (Z3-Z4 en distancias medias, Z5 en sprints de 250-500 m).',
        ],
    },
    {
        id: oid(6),
        name: 'Elíptica',
        equipment: 'Máquina elíptica',
        difficulty: 'Principiante',
        instructions: [
            'Mantente erguido con el core activo y usa los manubrios móviles para sumar el tren superior.',
            'Empuja y jala los manubrios en sincronía con el movimiento de las piernas.',
            'Regula la resistencia y la inclinación para sostener la zona objetivo durante toda la sesión.',
            'Prescripción sugerida: Z2 base aeróbica, 30-60 min continuo (intervalos Z3-Z4, ej. 30/30 o 30/60).',
        ],
    },
    {
        id: oid(7),
        name: 'Saltar la cuerda',
        equipment: 'Cuerda para saltar',
        difficulty: 'Intermedio',
        instructions: [
            'Gira la cuerda con las muñecas, no con los brazos; da saltos bajos, solo lo justo para pasarla.',
            'Aterriza suave sobre el metatarso con las rodillas levemente flexionadas.',
            'Trabaja por intervalos o por tiempo total, sosteniendo el ritmo objetivo en cada bloque.',
            'Prescripción sugerida: intervalos Z4-Z5 (ej. 30 s salto / 30 s descanso) o por tiempo total en Z3.',
        ],
    },
    {
        id: oid(8),
        name: 'Burpees (HIIT)',
        equipment: 'Ninguno',
        difficulty: 'Avanzado',
        instructions: [
            'De pie, baja a cuclillas, apoya las manos y lleva los pies atrás hasta la plancha; baja el pecho controlado.',
            'Vuelve los pies bajo la cadera de un salto y, al subir, da un salto vertical con los brazos arriba.',
            'Trabaja por intervalos cortos manteniendo un ritmo sostenible; cuida la técnica antes que la velocidad.',
            'Prescripción sugerida: intervalos Z4-Z5 (ej. 30 s trabajo / 30 s descanso) o AMRAP por tiempo en Z4.',
        ],
    },
]

async function main() {
    const admin = createClient(URL, KEY, { auth: { persistSession: false } })
    const rows = EXERCISES.map((e) => ({ ...COMMON, ...e }))
    const { error } = await admin.from('exercises').upsert(rows, { onConflict: 'id' })
    if (error) {
        console.error('[seed-cardio-exercises] error:', error.message)
        process.exit(1)
    }
    console.log(`[seed-cardio-exercises] OK — ${rows.length} ejercicios de cardio globales upserted (multimedia vacía).`)
}

main()
