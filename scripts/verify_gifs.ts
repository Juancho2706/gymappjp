import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
async function main() {
  const { data } = await db.from('exercises').select('name, video_url').is('coach_id', null)
  const missing = data?.filter(ex => !ex.video_url) || []
  const hasGif = data?.filter(ex => ex.video_url) || []
  console.log(`✅ Ejercicios con GIF: ${hasGif.length}`)
  console.log(`❌ Ejercicios SIN GIF: ${missing.length}`)
  if (missing.length > 0) {
    console.log('\nLista de ejercicios sin GIF:')
    missing.forEach(ex => console.log(`- ${ex.name}`))
  }
}
main()
