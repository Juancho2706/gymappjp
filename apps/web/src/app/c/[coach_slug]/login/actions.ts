'use server'

import {
    changePasswordAction as changePasswordActionImpl,
    clientLoginAction as clientLoginActionImpl,
} from './_actions/login.actions'

export type { ChangePasswordState, ClientLoginState } from './_actions/login.actions'
import type { ChangePasswordState, ClientLoginState } from './_actions/login.actions'

export async function clientLoginAction(
    prevState: ClientLoginState,
    formData: FormData
) {
    return clientLoginActionImpl(prevState, formData)
}

export async function changePasswordAction(
    prevState: ChangePasswordState,
    formData: FormData
) {
    return changePasswordActionImpl(prevState, formData)
}
