require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function getCredentials() {
  const { data: coaches } = await supabase.from('coaches').select('slug').limit(1)
  const { data: clients } = await supabase.from('clients').select('email').limit(1)
  
  console.log('Coach Slug:', coaches?.[0]?.slug)
  console.log('Client Email:', clients?.[0]?.email)
}

getCredentials()
