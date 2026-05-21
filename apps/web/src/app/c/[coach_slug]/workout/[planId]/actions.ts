'use server'

import { logSetAction as logSetActionImpl } from './_actions/workout-log.actions'

export type { LogState } from './_actions/workout-log.actions'
import type { LogState } from './_actions/workout-log.actions'

export async function logSetAction(
    prevState: LogState,
    formData: FormData
) {
    return logSetActionImpl(prevState, formData)
}
