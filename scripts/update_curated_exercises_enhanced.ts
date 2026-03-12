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

const getDesc = (name: string) => `Ejercicio enfocado en desarrollar fuerza y masa muscular en la zona de ${name.toLowerCase()}. Mantén una técnica controlada, respira adecuadamente y enfócate en la contracción del músculo.`

async function main() {
    console.log('🚀 Starting Enhanced Curated Exercises Update...')
    
    const dataPath = path.resolve(process.cwd(), 'scripts/curated_exercises.json')
    const curatedList = JSON.parse(fs.readFileSync(dataPath, 'utf-8'))

    console.log('\n📡 Fetching ALL exercises from ExerciseDB (caching locally for mapping)...')
    const allExercises: any[] = []
    let offset = 0
    const limit = 100
    let hasMore = true
    
    try {
        while (hasMore && offset <= 1500) {
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
            await new Promise(r => setTimeout(r, 300))
        }
    } catch (e) {
        console.log(' error fetching:', e)
    }
    console.log(`\n✅ Fetched ${allExercises.length} from API. Mapping with enhanced logic...`)

    const toInsert = curatedList.map((curated: any) => {
        const enName = curated.en.toLowerCase()
        const searchTerms = enName.split(' ')
        
        // 1. Exact match
        let match = allExercises.find(ex => ex.name.toLowerCase() === enName)
        
        // 2. All terms match
        if (!match) {
            match = allExercises.find(ex => {
                const exName = ex.name.toLowerCase()
                return searchTerms.every((term: string) => exName.includes(term))
            })
        }

        // 3. Fallback for specific tricky names (Fuzzy logic / common variations)
        if (!match) {
            match = allExercises.find(ex => {
                const exName = ex.name.toLowerCase()
                // Check if curated name is contained in API name or vice versa
                return (exName.includes(enName) || enName.includes(exName)) && Math.abs(exName.length - enName.length) < 15
            })
        }

        // 4. Special manual overrides for common ExerciseDB naming patterns
        if (!match) {
            if (enName.includes('pec deck')) match = allExercises.find(ex => ex.name.toLowerCase().includes('butterfly'))
            if (enName.includes('zottman')) match = allExercises.find(ex => ex.name.toLowerCase().includes('zottman'))
            if (enName.includes('bulgarian split squat')) match = allExercises.find(ex => ex.name.toLowerCase().includes('bulgarian') || ex.name.toLowerCase().includes('split squat'))
            if (enName.includes('hip thrust')) match = allExercises.find(ex => ex.name.toLowerCase().includes('hip thrust'))
            if (enName.includes('nordic')) match = allExercises.find(ex => ex.name.toLowerCase().includes('hamstring') && ex.name.toLowerCase().includes('curl'))
            if (enName.includes('face pull')) match = allExercises.find(ex => ex.name.toLowerCase().includes('face pull'))
            if (enName.includes('calf')) match = allExercises.find(ex => ex.name.toLowerCase().includes('calf') && ex.name.toLowerCase().includes(searchTerms[0]))
        }
        
        return {
            name: curated.es,
            muscle_group: curated.group,
            video_url: match ? match.gifUrl : null,
            instructions: [getDesc(curated.es)],
            coach_id: null
        }
    })

    console.log(`\n🗑️ Cleaning up global catalog...`)
    await adminDb.from('workout_blocks').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await adminDb.from('exercises').delete().is('coach_id', null)

    console.log(`⚙️ Inserting ${toInsert.length} curated exercises...`)
    const { error: insError } = await adminDb.from('exercises').insert(toInsert)
    if (insError) {
        console.error('Error:', insError.message)
    } else {
        console.log('✅ Successfully updated catalog!')
    }
}

main().catch(console.error)
