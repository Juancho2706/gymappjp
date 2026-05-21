'use server'

import { toggleClientBrandColors as toggleClientBrandColorsImpl } from './_actions/client-root.actions'

export async function toggleClientBrandColors(...args: Parameters<typeof toggleClientBrandColorsImpl>) {
    return toggleClientBrandColorsImpl(...args)
}
