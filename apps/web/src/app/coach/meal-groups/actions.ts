'use server'

import {
    deleteMealGroup as deleteMealGroupImpl,
    saveMealGroup as saveMealGroupImpl,
} from './_actions/meal-groups.actions'

export async function saveMealGroup(...args: Parameters<typeof saveMealGroupImpl>) {
    return saveMealGroupImpl(...args)
}

export async function deleteMealGroup(...args: Parameters<typeof deleteMealGroupImpl>) {
    return deleteMealGroupImpl(...args)
}
