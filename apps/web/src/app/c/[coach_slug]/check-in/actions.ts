'use server'

import { submitCheckinAction as submitCheckinActionImpl } from './_actions/check-in.actions'

export type { CheckinState } from './_actions/check-in.actions'
import type { CheckinState } from './_actions/check-in.actions'

export async function submitCheckinAction(
    prevState: CheckinState,
    formData: FormData
) {
    return submitCheckinActionImpl(prevState, formData)
}
