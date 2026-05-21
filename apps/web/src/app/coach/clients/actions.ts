'use server'

import {
    archiveClientAction as archiveClientActionImpl,
    createClientAction as createClientActionImpl,
    deleteClientAction as deleteClientActionImpl,
    getClientIntakeAction as getClientIntakeActionImpl,
    resetClientPasswordAction as resetClientPasswordActionImpl,
    toggleClientStatusAction as toggleClientStatusActionImpl,
    unarchiveClientAction as unarchiveClientActionImpl,
    updateClientDataAction as updateClientDataActionImpl,
} from './_actions/clients.actions'

export type { ClientIntakeData, CreateClientState, UpdateClientDataState } from './_actions/clients.actions'

export async function createClientAction(...args: Parameters<typeof createClientActionImpl>) {
    return createClientActionImpl(...args)
}

export async function getClientIntakeAction(...args: Parameters<typeof getClientIntakeActionImpl>) {
    return getClientIntakeActionImpl(...args)
}

export async function updateClientDataAction(...args: Parameters<typeof updateClientDataActionImpl>) {
    return updateClientDataActionImpl(...args)
}

export async function deleteClientAction(...args: Parameters<typeof deleteClientActionImpl>) {
    return deleteClientActionImpl(...args)
}

export async function resetClientPasswordAction(...args: Parameters<typeof resetClientPasswordActionImpl>) {
    return resetClientPasswordActionImpl(...args)
}

export async function archiveClientAction(...args: Parameters<typeof archiveClientActionImpl>) {
    return archiveClientActionImpl(...args)
}

export async function unarchiveClientAction(...args: Parameters<typeof unarchiveClientActionImpl>) {
    return unarchiveClientActionImpl(...args)
}

export async function toggleClientStatusAction(...args: Parameters<typeof toggleClientStatusActionImpl>) {
    return toggleClientStatusActionImpl(...args)
}
