'use server'

import { adminLoginAction as adminLoginActionImpl } from './_actions/login.actions'

export type { AdminLoginState } from './_actions/login.actions'

export async function adminLoginAction(...args: Parameters<typeof adminLoginActionImpl>) {
    return adminLoginActionImpl(...args)
}
