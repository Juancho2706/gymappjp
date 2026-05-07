/**
 * One-off: create demo clients for a coach (service role).
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const COACH_ID = 'cf74e27b-17a8-4699-acc6-a893194cea33'
const COACH_SLUG = 'mindgym-temuco'

const clients = [
    { name: 'Camila Rojas', email: 'camila.rojas@demo.eva-app.cl', pass: 'Demo1234!', weight: 58, height: 165, experience: 'intermedio', goals: 'Tonificar y reducir grasa', availability: 'Lunes a viernes, 18:00-20:00' },
    { name: 'Matías Soto', email: 'matias.soto@demo.eva-app.cl', pass: 'Demo1234!', weight: 82, height: 178, experience: 'avanzado', goals: 'Ganar masa muscular', availability: 'Lunes, miércoles, viernes, 07:00-09:00' },
    { name: 'Valentina Díaz', email: 'valentina.diaz@demo.eva-app.cl', pass: 'Demo1234!', weight: 64, height: 168, experience: 'principiante', goals: 'Perder peso y mejorar resistencia', availability: 'Martes, jueves, sábados, 10:00-12:00' },
    { name: 'Diego Herrera', email: 'diego.herrera@demo.eva-app.cl', pass: 'Demo1234!', weight: 90, height: 181, experience: 'intermedio', goals: 'Fuerza y definición', availability: 'Lunes a viernes, 06:30-08:00' },
    { name: 'Javiera Morales', email: 'javiera.morales@demo.eva-app.cl', pass: 'Demo1234!', weight: 55, height: 162, experience: 'intermedio', goals: 'Hipertrofia glútea y piernas', availability: 'Lunes, miércoles, viernes, 19:00-21:00' },
    { name: 'Sebastián Fuentes', email: 'sebastian.fuentes@demo.eva-app.cl', pass: 'Demo1234!', weight: 78, height: 175, experience: 'principiante', goals: 'Bajar de peso y ganar condición', availability: 'Martes, jueves, domingos, 08:00-10:00' },
    { name: 'Francisca Vega', email: 'francisca.vega@demo.eva-app.cl', pass: 'Demo1234!', weight: 61, height: 170, experience: 'avanzado', goals: 'Competencia fitness', availability: 'Lunes a sábado, 17:00-20:00' },
    { name: 'Nicolás Araya', email: 'nicolas.araya@demo.eva-app.cl', pass: 'Demo1234!', weight: 85, height: 180, experience: 'intermedio', goals: 'Fuerza máxima y powerlifting', availability: 'Lunes, miércoles, viernes, 20:00-22:00' },
]

async function main() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        console.error('Missing env vars')
        process.exit(1)
    }

    const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    const created = []

    for (const c of clients) {
        // Check email availability
        const { data: avail } = await admin.rpc('check_platform_email_availability', { p_email: c.email })
        if (avail?.exists_in_auth || avail?.orphan_client_email) {
            console.log(`SKIP (exists): ${c.email}`)
            continue
        }

        // Create auth user
        const { data: authData, error: authErr } = await admin.auth.admin.createUser({
            email: c.email,
            password: c.pass,
            email_confirm: true,
        })
        if (authErr || !authData?.user) {
            console.error(`FAIL auth ${c.email}:`, authErr?.message)
            continue
        }

        const userId = authData.user.id

        // Insert client
        const { error: clientErr } = await admin.from('clients').insert({
            id: userId,
            coach_id: COACH_ID,
            full_name: c.name,
            email: c.email,
            onboarding_completed: true,
            is_active: true,
        })
        if (clientErr) {
            console.error(`FAIL client ${c.email}:`, clientErr.message)
            await admin.auth.admin.deleteUser(userId)
            continue
        }

        // Insert intake
        const { error: intakeErr } = await admin.from('client_intake').insert({
            client_id: userId,
            weight_kg: c.weight,
            height_cm: c.height,
            experience_level: c.experience,
            goals: c.goals,
            availability: c.availability,
            injuries: null,
            medical_conditions: null,
        })
        if (intakeErr) {
            console.error(`FAIL intake ${c.email}:`, intakeErr.message)
        }

        created.push({ name: c.name, email: c.email, id: userId })
        console.log(`OK client: ${c.name} (${c.email})`)
    }

    console.log(`\nCreated ${created.length} clients`)
    console.log(created)
}

main().catch(console.error)
