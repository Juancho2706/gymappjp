import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const db = createClient(supabaseUrl, serviceKey)

async function searchYouTube(query: string) {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " exercise tutorial short")}`
    const response = await fetch(searchUrl)
    const text = await response.text()
    
    // Extract first video ID using regex
    const match = text.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/)
    return match ? `https://www.youtube.com/watch?v=${match[1]}` : null
  } catch (error) {
    console.error(`Error searching YouTube for ${query}:`, error)
    return null
  }
}

async function main() {
  console.log('🔍 Buscando videos de YouTube para ejercicios sin GIF...')
  
  const { data: missing, error } = await db
    .from('exercises')
    .select('id, name')
    .is('coach_id', null)
    .or('video_url.is.null,video_url.eq.""')

  if (error) {
    console.error('Error fetching exercises:', error)
    return
  }

  if (!missing || missing.length === 0) {
    console.log('✅ No hay ejercicios sin video/GIF.')
    return
  }

  console.log(`Encontrados ${missing.length} ejercicios para procesar.`)

  for (const ex of missing) {
    process.stdout.write(`- Buscando para: ${ex.name}... `)
    const videoUrl = await searchYouTube(ex.name)
    
    if (videoUrl) {
      const { error: updateError } = await db
        .from('exercises')
        .update({ video_url: videoUrl })
        .eq('id', ex.id)
      
      if (updateError) {
        console.log(`❌ Error al actualizar: ${updateError.message}`)
      } else {
        console.log(`✅ OK: ${videoUrl}`)
      }
    } else {
      console.log('⚠️ No se encontró video.')
    }
    
    // Rate limit friendly delay
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log('\n🎉 Proceso de búsqueda en YouTube completado.')
}

main()
