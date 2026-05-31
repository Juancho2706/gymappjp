import { expect, test } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
const TEST_PASSWORD = 'TestPass123!'

const ORG_A_ID = '00000000-0000-0000-0002-000000000001'
const ORG_B_ID = '00000000-0000-0000-0002-000000000002'
const OWNER_A_EMAIL = 'coach-owner-a@eva-test.cl'

function anonClient() {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

function adminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function signInOwnerA() {
  const sb = anonClient()
  const { error } = await sb.auth.signInWithPassword({
    email: OWNER_A_EMAIL,
    password: TEST_PASSWORD,
  })
  if (error) throw new Error(error.message)
  return sb
}

test.describe('Enterprise storage cross-tenant guards', () => {
  test('org owner A cannot write or list org B assets through storage RLS', async () => {
    const stamp = Date.now()
    const ownPath = `orgs/${ORG_A_ID}/e2e-owner-a-${stamp}.png`
    const otherPath = `orgs/${ORG_B_ID}/e2e-owner-a-denied-${stamp}.png`
    const seededOtherFile = `e2e-seeded-b-${stamp}.png`
    const seededOtherPath = `orgs/${ORG_B_ID}/${seededOtherFile}`
    const bytes = new Uint8Array([137, 80, 78, 71])
    const admin = adminClient()

    try {
      const ownerA = await signInOwnerA()

      const ownUpload = await ownerA.storage
        .from('org-assets')
        .upload(ownPath, bytes, { contentType: 'image/png', upsert: true })
      expect(ownUpload.error).toBeNull()

      const crossUpload = await ownerA.storage
        .from('org-assets')
        .upload(otherPath, bytes, { contentType: 'image/png', upsert: true })
      expect(crossUpload.error?.message ?? '').toMatch(/row-level security|violates|not authorized|unauthorized/i)

      const seeded = await admin.storage
        .from('org-assets')
        .upload(seededOtherPath, bytes, { contentType: 'image/png', upsert: true })
      expect(seeded.error).toBeNull()

      const crossList = await ownerA.storage.from('org-assets').list(`orgs/${ORG_B_ID}`)
      expect(crossList.data?.some((item) => item.name === seededOtherFile)).toBe(false)
    } finally {
      await admin.storage.from('org-assets').remove([ownPath, otherPath, seededOtherPath])
    }
  })
})
