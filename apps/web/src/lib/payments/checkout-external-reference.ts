import {
    isBillingCycleAllowedForTier,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'

export type ParsedCheckoutExternalReference = {
    coachId: string
    tier: SubscriptionTier | null
    billingCycle: BillingCycle | null
    /**
     * Add-ons que viajan en la 4ª parte del reference (signup / supersede con add-ons).
     * Ausente o inválida ⇒ `[]` (backward compatible con preapprovals vivos de 3 partes).
     */
    addons: ModuleKey[]
}

const MODULE_KEY_SET = new Set<string>(MODULE_KEYS)

/**
 * Parsea la 4ª parte opcional `addon1+addon2` validando cada clave contra MODULE_KEYS.
 * Claves inválidas se descartan; duplicados se colapsan; vacío/ausente ⇒ `[]`.
 */
function parseAddonsPart(raw?: string): ModuleKey[] {
    if (!raw) return []
    const seen = new Set<ModuleKey>()
    for (const candidate of raw.split('+')) {
        const key = candidate.trim()
        if (MODULE_KEY_SET.has(key)) seen.add(key as ModuleKey)
    }
    return [...seen]
}

/**
 * Mercado Pago `external_reference` format: `coachId|tier|billingCycle[|addon1+addon2]`.
 * La 4ª parte (add-ons) es OPCIONAL y backward-compatible: un preapproval legacy de 3
 * partes parsea igual con `addons: []`.
 */
export function parseCheckoutExternalReference(
    reference?: string | null
): ParsedCheckoutExternalReference | null {
    if (!reference) return null
    const parts = reference.split('|')
    const coachId = parts[0]?.trim()
    if (!coachId) return null

    const addons = parseAddonsPart(parts[3]?.trim())

    const tierRaw = parts[1]?.trim()
    const cycleRaw = parts[2]?.trim()
    if (!tierRaw || !cycleRaw) return { coachId, tier: null, billingCycle: null, addons }

    if (!(tierRaw in TIER_CONFIG)) return { coachId, tier: null, billingCycle: null, addons }
    const tier = tierRaw as SubscriptionTier

    if (cycleRaw !== 'monthly' && cycleRaw !== 'quarterly' && cycleRaw !== 'annual') {
        return { coachId, tier, billingCycle: null, addons }
    }
    const billingCycle = cycleRaw as BillingCycle
    if (!isBillingCycleAllowedForTier(tier, billingCycle)) {
        return { coachId, tier, billingCycle: null, addons }
    }
    return { coachId, tier, billingCycle, addons }
}
