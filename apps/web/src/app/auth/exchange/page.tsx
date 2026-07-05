import { AuthExchangeClient } from './AuthExchangeClient'

// Intercambio de tokens de auth (lee la URL en runtime): jamás prerender.
// Sin esto, `next build` intenta prerenderizarla y puede reventar con
// "Invariant: Expected workStore to be initialized" según el env del build.
export const dynamic = 'force-dynamic'

export default function AuthExchangePage() {
    return <AuthExchangeClient />
}
