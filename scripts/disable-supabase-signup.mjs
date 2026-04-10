import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()

function readProjectRef() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL')
  const match = url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co$/i)
  if (!match) throw new Error('Could not parse project ref from NEXT_PUBLIC_SUPABASE_URL')
  return match[1]
}

async function main() {
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN
  if (!accessToken) {
    throw new Error(
      'Missing SUPABASE_ACCESS_TOKEN. Create a Personal Access Token in Supabase and set it in your environment.'
    )
  }

  const projectRef = readProjectRef()
  const endpoint = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`
  const response = await fetch(endpoint, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ disable_signup: true }),
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Failed to disable signup (${response.status}): ${body}`)
  }

  console.log(`disable_signup=true applied for project ${projectRef}`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
