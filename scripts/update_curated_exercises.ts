import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'

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

// descriptions genericas
const getDesc = (name: string) => `Ejercicio enfocado en desarrollar fuerza y masa muscular en la zona de ${name.toLowerCase()}. Mantén una técnica controlada, respira adecuadamente y enfócate en la contracción del músculo.`

async function main() {
    console.log('🚀 Starting Curated Exercises Update...')
    
    // Load JSON
    const dataPath = path.resolve(process.cwd(), 'scripts/curated_exercises.json')
    const curatedList = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

    console.log(`\n🗑️ Deleting all existing global exercises...`)
    
    // Clean up blocks to avoid foreign key issues
    console.log('Cleaning up old workout blocks to allow exercise deletion...')
    await adminDb.from('workout_blocks').delete().neq('id', '00000000-0000-0000-0000-000000000000') // delete all

    // We only delete those with coach_id IS NULL to avoid deleting custom coach exercises
    const { error: delError } = await adminDb.from('exercises').delete().is('coach_id', null)
    if (delError) {
        console.error('Error deleting exercises:', delError.message)
        return
    }
    console.log('✅ Deleted global exercises successfully.')

    console.log('\n📡 Fetching ALL exercises from ExerciseDB to map GIFs (this will take a few seconds)...')
    const allExercises: any[] = []
    let offset = 0
    const limit = 100
    let hasMore = true
    
    try {
        while (hasMore && offset <= 1300) {
            process.stdout.write(`\r- Fetching offset ${offset}...`)
            const res = await fetch(`https://exercisedb-api.vercel.app/api/v1/exercises?offset=${offset}&limit=${limit}`)
            if (!res.ok) {
                console.log(' rate limited or error, stopping fetch.')
                break
            }
            const json = await res.json()
            const exercisesChunk = json.data || []
            allExercises.push(...exercisesChunk)
            if (exercisesChunk.length < limit) hasMore = false
            offset += limit
            await new Promise(r => setTimeout(r, 500))
        }
    } catch (e) {
        console.log(' error fetching:', e)
    }
    console.log(`\n✅ Fetched ${allExercises.length} from API. Mapping to curated list...`)

    const toInsert = curatedList.map((curated: any) => {
        // Find best match
        const match = allExercises.find(ex => ex.name.toLowerCase().includes(curated.en.toLowerCase()) || curated.en.toLowerCase().includes(ex.name.toLowerCase()))
        
        return {
            name: curated.es,
            muscle_group: curated.group,
            video_url: match ? match.gifUrl : null,
            instructions: [getDesc(curated.es)],
            coach_id: null
        }
    })

    console.log(`\n⚙️ Inserting ${toInsert.length} curated exercises...`)
    
    const { error: insError } = await adminDb.from('exercises').insert(toInsert)
    if (insError) {
        console.error('Error inserting exercises:', insError.message)
    } else {
        console.log('✅ Successfully inserted curated exercises!')
    }
}

main().catch(console.error)
