import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://jikjeokundmaafuytdcx.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_SERVICE_KEY) {
    console.error('❌ Set SUPABASE_SERVICE_ROLE_KEY env variable.')
    process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
})

async function main() {
    console.log('🚀 Creating Test Coach Account...')

    const email = 'coach@test.com'
    const password = 'Password123!'
    const fullName = 'Juan Coach Test'
    const brandName = 'Juancho Fitness'
    const slug = 'juancho-fitness'

    // 1. Create auth user
    const { data: auth, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true
    })

    if (authErr) {
        if (authErr.message.includes('already registered')) {
            console.log(`⚠️ User ${email} already exists.`)
            return
        }
        console.error('❌ Auth Error:', authErr)
        process.exit(1)
    }

    console.log(`✅ Auth user created: ${auth.user.id}`)

    // 2. Create coaches row
    const { error: dbErr } = await supabase.from('coaches').insert({
        id: auth.user.id,
        full_name: fullName,
        brand_name: brandName,
        slug: slug,
        primary_color: '#10B981',
        subscription_status: 'active'
    })

    if (dbErr) {
        console.error('❌ DB Error:', dbErr)
        process.exit(1)
    }

    console.log('✅ Coach profile created in DB!')
    console.log('\n=========================================')
    console.log('🎉 ACCOUNT READY')
    console.log(`✉️  Email: ${email}`)
    console.log(`🔑 Pass:  ${password}`)
    console.log('=========================================')
}

main()
