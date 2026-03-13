import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'
import { searchYouTube } from './lib/youtube'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const db = createClient(supabaseUrl, serviceKey)

async function main() {
  console.log('🚀 Unificando todo el catálogo a videos de YouTube...')
  
  const { data: exercises, error } = await db
    .from('exercises')
    .select('id, name, video_url')
    .is('coach_id', null)

  if (error) {
    console.error('Error fetching exercises:', error)
    return
  }

  if (!exercises || exercises.length === 0) {
    console.log('✅ No hay ejercicios en el catálogo global.')
    return
  }

  console.log(`Procesando ${exercises.length} ejercicios...`)

  for (const ex of exercises) {
    // Si ya tiene un link de youtube válido de la búsqueda anterior, podemos saltarlo para ahorrar tiempo
    if (ex.video_url?.includes('youtube.com') || ex.video_url?.includes('youtu.be')) {
      console.log(`- [Skipping] ${ex.name} (Ya tiene YouTube)`)
      continue
    }

    process.stdout.write(`- Buscando para: ${ex.name}... `)
    const videoUrl = await searchYouTube(ex.name, 'technique')
    
    if (videoUrl) {
      const { error: updateError } = await db
        .from('exercises')
        .update({ 
            video_url: videoUrl,
            gif_url: null // Limpiamos el gif para forzar el uso del video
        })
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
    await new Promise(r => setTimeout(r, 1000))
  }

  console.log('\n🎉 Unificación a YouTube completada.')
}

main()
