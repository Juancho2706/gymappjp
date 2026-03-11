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

// Mapping ExerciseDB muscles to our application's Spanish muscle groups
const MUSCLE_MAPPING: Record<string, string> = {
    'chest': 'Pecho',
    'back': 'Espalda',
    'shoulders': 'Hombros',
    'upper arms': 'Brazos',
    'lower arms': 'Brazos',
    'upper legs': 'Piernas',
    'lower legs': 'Piernas',
    'waist': 'Core', // They use waist for abs
    'cardio': 'Cardio'
}

// Limits how many exercises per muscle group to snatch
const EXERCISES_PER_MUSCLE = 20

// Function to capitalize first letter
const formatName = (str: string) => {
    return str.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')
}

async function main() {
    console.log('🚀 Starting ExerciseDB API Seed...')
    console.log('We will fetch the top exercises per muscle group and inject them with 3D GIFs.\n')

    console.log(`📡 Fetching the entire exercise catalog...`)

    const allExercises: any[] = []
    let offset = 250 // Start from 250 since 0-249 were already fetched
    const limit = 25
    let hasMore = true

    while (hasMore) {
        process.stdout.write(`\r- Fetching offset ${offset}...`)
        const res = await fetch(`https://exercisedb-api.vercel.app/api/v1/exercises?offset=${offset}&limit=${limit}`)

        if (!res.ok) {
            console.error(`\n❌ Failed at offset ${offset}. Status: ${res.status}`)
            break
        }

        const json = await res.json()
        const exercisesChunk = json.data || []
        allExercises.push(...exercisesChunk)

        if (exercisesChunk.length < limit || allExercises.length >= 1350) {
            hasMore = false
        } else {
            offset += limit
            // Wait 2500ms between calls to respect rate limits (429 previously)
            await new Promise(r => setTimeout(r, 2500))
        }
    }

    console.log(`\n✅ Loaded ${allExercises.length} exercises from API. Filtering the top picks...`)
    let totalInserted = 0

    for (const [enMuscle, esMuscle] of Object.entries(MUSCLE_MAPPING)) {
        console.log(`\n⚙️  Processing [${enMuscle}] -> [${esMuscle}]...`)

        // Find exercises that match the target body part or muscle
        const matchedExercises = allExercises.filter((ex: any) =>
            ex.targetMuscles?.includes(enMuscle) ||
            ex.bodyParts?.includes(enMuscle)
        ).slice(0, EXERCISES_PER_MUSCLE)

        if (matchedExercises.length === 0) {
            console.warn(`⚠️ No exercises found for ${enMuscle}`)
            continue
        }

        const formattedExercises = matchedExercises.map((ex: any) => ({
            name: formatName(ex.name),
            muscle_group: esMuscle,
            video_url: ex.gifUrl,
            coach_id: null // Global catalog
        }))

        const { error } = await adminDb
            .from('exercises')
            .insert(formattedExercises)

        if (error) {
            console.error(`❌ Error inserting ${enMuscle}:`, error.message)
        } else {
            console.log(`✅ Success for ${enMuscle} (${formattedExercises.length} items inserted)`)
            totalInserted += formattedExercises.length
        }
    }

    console.log(`\n🎉 Seed completed successfully! Added ${totalInserted} premium 3D exercises to the global catalog.`)
}

main().catch(console.error)
