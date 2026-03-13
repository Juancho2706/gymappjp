import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !serviceKey) {
    console.error('Error: missing Supabase URL or Service Role Key in .env.local')
    process.exit(1)
}

const adminDb = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
})

const FOODS_TO_SEED = [
    {
        name: 'Huevo entero',
        calories: 140,
        protein_g: 12,
        fats_g: 10,
        carbs_g: 1,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Pechuga de pollo',
        calories: 165,
        protein_g: 31,
        fats_g: 4,
        carbs_g: 0,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Arroz blanco cocido',
        calories: 130,
        protein_g: 3,
        fats_g: 0,
        carbs_g: 28,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Avena',
        calories: 389,
        protein_g: 17,
        fats_g: 7,
        carbs_g: 66,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Leche descremada',
        calories: 35,
        protein_g: 3,
        fats_g: 0,
        carbs_g: 5,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Pan integral',
        calories: 247,
        protein_g: 13,
        fats_g: 3,
        carbs_g: 41,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Palta',
        calories: 160,
        protein_g: 2,
        fats_g: 15,
        carbs_g: 9,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Atún al agua',
        calories: 116,
        protein_g: 26,
        fats_g: 1,
        carbs_g: 0,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Plátano',
        calories: 89,
        protein_g: 1,
        fats_g: 0,
        carbs_g: 23,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Manzana',
        calories: 52,
        protein_g: 0,
        fats_g: 0,
        carbs_g: 14,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Carne molida magra 5%',
        calories: 137,
        protein_g: 21,
        fats_g: 5,
        carbs_g: 0,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Papa cocida',
        calories: 77,
        protein_g: 2,
        fats_g: 0,
        carbs_g: 17,
        serving_size_g: 100,
        coach_id: null
    },
    {
        name: 'Queso fresco',
        calories: 200,
        protein_g: 15,
        fats_g: 14,
        carbs_g: 4,
        serving_size_g: 100,
        coach_id: null
    }
]

async function main() {
    console.log('🚀 Iniciando el sembrado de alimentos...')

    const { error } = await adminDb
        .from('foods')
        .insert(FOODS_TO_SEED)

    if (error) {
        console.error('❌ Error insertando alimentos:', error.message)
    } else {
        console.log(`✅ ¡Éxito! Se insertaron ${FOODS_TO_SEED.length} alimentos básicos en la base de datos.`)
    }
}

main().catch(console.error)
