import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import es from './es.json'

/**
 * Detector de keys i18n huerfanas (plan 02 / F4.3).
 *
 * Extrae las keys de `es.json` y las cruza contra los literales delimitados
 * (`'key'`, `"key"`, `` `key` ``) presentes en `apps/web/src/**\/*.{ts,tsx}`.
 * Una key se considera REFERENCIADA si aparece como literal exacto en cualquier
 * call site (sea `t('key')`, `titleKey: 'key'` en un objeto, o un array de
 * suffix keys que luego se pasa a `t()`).
 *
 * El test falla si una key NO esta referenciada Y NO entra en una de las dos
 * allowlists documentadas:
 *   1. DYNAMIC_KEY_PREFIXES — familias construidas dinamicamente (template
 *      literal `t(`PREFIX.${x}`)`), imposibles de trazar como literal exacto.
 *   2. KNOWN_LEGACY_ORPHANS — keys muertas PRE-EXISTENTES (sin call site en TODO
 *      el repo), heredadas de componentes de landing ya removidos. NO son scope
 *      del plan 02 (Teams), que solo autoriza tocar los json para paridad; se
 *      dejan listadas y trackeadas para una limpieza futura. Mantenerlas aqui
 *      hace que el test siga VERDE hoy pero reviente ante CUALQUIER huerfana
 *      NUEVA (p. ej. una key Teams sin uso) — que es el riesgo real a cubrir.
 *
 * Verificado 2026-06-12 con grep repo-wide (`git grep`): las KNOWN_LEGACY_ORPHANS
 * no tienen call site en ningun `.ts/.tsx` del repo.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// .../apps/web/src/lib/i18n -> .../apps/web/src
const SRC_ROOT = path.resolve(__dirname, '..', '..')

/**
 * Familias de keys construidas dinamicamente via template literal `t(`PREFIX.${x}`)`.
 * Documentadas por entrada con su call site. Cualquier key bajo estos prefijos
 * se considera referenciada (no se puede trazar como literal exacto).
 */
const DYNAMIC_KEY_PREFIXES: { prefix: string; reason: string }[] = [
    {
        prefix: 'landing.studentTabs.nutrition.',
        reason: 'LandingStudentTabs.tsx: t(`landing.studentTabs.nutrition.${m.key}`)',
    },
    {
        prefix: 'assessment.band.',
        reason: 'PriorityBadge / MovementPrintReport: t(`assessment.band.${band}`)',
    },
    {
        prefix: 'assessment.pattern.',
        reason: 'EvolutionCharts / AssessmentReportCard / MovementWizard: t(`assessment.pattern.${slug}`)',
    },
]

/**
 * Keys muertas PRE-EXISTENTES (sin call site en todo el repo). Fuera del scope del
 * plan 02; trackeadas para limpieza. Agrupadas por familia de origen para que la
 * limpieza futura sea ordenada. NO agregar keys nuevas aqui: una huerfana nueva
 * debe FALLAR el test, no esconderse en esta lista.
 */
const KNOWN_LEGACY_ORPHANS: string[] = [
    // --- hero / demo legacy (variantes de copy ya no renderizadas) ---
    'landing.hero.title3',
    'landing.hero.secondaryCta',
    'landing.hero.statusLine',
    'landing.demo.title',
    'landing.demo.subtitle',
    'landing.demo.iframeTitle',
    'landing.demo.placeholder',
    'landing.demo.ctaTrial',
    'landing.demo.ctaPricing',
    // --- landing.core.* (seccion "core" removida) ---
    'landing.core.routines.title',
    'landing.core.macros.title',
    'landing.core.templates.title',
    'landing.core.apply',
    // --- landing.functions.* (seccion "functions" removida) ---
    'landing.functions.eyebrow',
    'landing.functions.title',
    'landing.functions.subtitle',
    'landing.functions.tagline',
    // --- landing.feature.* (grid de features removido) ---
    'landing.feature.routines.title',
    'landing.feature.routines.desc',
    'landing.feature.nutrition.title',
    'landing.feature.nutrition.desc',
    'landing.feature.checkins.title',
    'landing.feature.checkins.desc',
    'landing.feature.whitelabel.title',
    'landing.feature.whitelabel.desc',
    'landing.feature.profile.title',
    'landing.feature.profile.desc',
    'landing.feature.analytics.title',
    'landing.feature.analytics.desc',
    // --- landing.whitelabel.* (seccion white-label dedicada removida) ---
    'landing.whitelabel.eyebrow',
    'landing.whitelabel.title',
    'landing.whitelabel.subtitle',
    'landing.whitelabel.customize.title',
    'landing.whitelabel.customize.body',
    'landing.whitelabel.urlExample',
    'landing.whitelabel.pwa.title',
    'landing.whitelabel.pwa.body',
    // --- landing.journey.* (seccion "journey" removida, 6 cards) ---
    'landing.journey.eyebrow',
    'landing.journey.title',
    'landing.journey.subtitle',
    'landing.journey.c1.title',
    'landing.journey.c1.b1',
    'landing.journey.c1.b2',
    'landing.journey.c1.b3',
    'landing.journey.c2.title',
    'landing.journey.c2.b1',
    'landing.journey.c2.b2',
    'landing.journey.c2.b3',
    'landing.journey.c3.title',
    'landing.journey.c3.b1',
    'landing.journey.c3.b2',
    'landing.journey.c3.b3',
    'landing.journey.c4.title',
    'landing.journey.c4.b1',
    'landing.journey.c4.b2',
    'landing.journey.c4.b3',
    'landing.journey.c5.title',
    'landing.journey.c5.b1',
    'landing.journey.c5.b2',
    'landing.journey.c5.b3',
    'landing.journey.c6.title',
    'landing.journey.c6.b1',
    'landing.journey.c6.b2',
    'landing.journey.c6.b3',
    // --- landing.pricing.* legacy (copy/layout viejo del pricing preview) ---
    'landing.pricing.subtitle', // referenciada en otra app del monorepo, no en apps/web/src
    'landing.pricing.legendMonthly',
    'landing.pricing.legendPrepaid',
    'landing.pricing.fullLink',
    'landing.pricing.groupTraining',
    'landing.pricing.groupTrainingBadge',
    'landing.pricing.groupFull',
    'landing.pricing.groupFullBadge',
    'landing.pricing.billing.monthlyOnly',
    'landing.pricing.billing.monthlyQuarterlyAnnual',
    'landing.pricing.billing.quarterlyAnnual',
    'landing.pricing.priceBlock.monthly',
    'landing.pricing.priceBlock.prepaid',
    'landing.pricing.includedTitle',
    'landing.pricing.includedSubtitle',
    'landing.pricing.group.free',
    'landing.pricing.group.individual',
    'landing.pricing.group.business', // separador "Negocio establecido": F3 lo limpiara tras plan 04
    'landing.pricing.group.individual.badge',
    'landing.pricing.group.business.badge', // huerfana ya detectada a mano en el plan 02
    'landing.pricing.freePriceLabel',
    'landing.pricing.upToClients',
    'landing.pricing.planFree',
    'landing.pricing.monthlyOrAnnual',
    // --- landing.tierFeature.* (subset sin uso) ---
    'landing.tierFeature.branding',
    'landing.tierFeature.nutritionPlans',
    // --- landing.studentTabs.checkin.* (subset sin uso) ---
    'landing.studentTabs.checkin.step2Title',
    'landing.studentTabs.checkin.step2Body',
    'landing.studentTabs.checkin.prev',
    'landing.studentTabs.checkin.next',
    // --- landing.typewriter.prefix (reemplazado por prefixBefore/Brand/After) ---
    'landing.typewriter.prefix',
    // --- landing.diorama.phone.* (mockup de telefono removido) ---
    'landing.diorama.phone.greeting',
    'landing.diorama.phone.streak',
    'landing.diorama.phone.routineTitle',
    'landing.diorama.phone.exercise',
    'landing.diorama.phone.sets',
    'landing.diorama.phone.focusTag',
    'landing.diorama.phone.doneBadge',
    // --- common.* / tooltip.* / section.* (namespaces sin call site) ---
    'common.coach',
    'common.clients',
    'common.exercises',
    'common.settings',
    'common.logout',
    'tooltip.sets',
    'tooltip.reps',
    'section.checkIn',
    'section.nutrition',
    'section.exercises',
    'section.coachDashboard',
    'section.coachBuilder',
    'section.coachNutrition',
    'section.coachBrand',
    // --- assessment.* (subset sin call site) ---
    'assessment.shortTitle',
    'assessment.report.weakSide',
    'assessment.report.evaluator',
    'assessment.report.score',
    'assessment.hub.viewReport',
]

function collectSourceFiles(dir: string, acc: string[]): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            collectSourceFiles(full, acc)
        } else if (
            /\.(ts|tsx)$/.test(entry.name) &&
            !/\.test\.(ts|tsx)$/.test(entry.name) &&
            !entry.name.endsWith('.json')
        ) {
            acc.push(full)
        }
    }
    return acc
}

function buildSourceBlob(): string {
    const files = collectSourceFiles(SRC_ROOT, [])
    return files.map((f) => fs.readFileSync(f, 'utf8')).join('\n')
}

const SOURCE_BLOB = buildSourceBlob()

function isReferencedLiteral(key: string): boolean {
    // Literal delimitado exacto en cualquier call site (t('key'), titleKey: 'key', array de keys, etc.).
    return (
        SOURCE_BLOB.includes(`'${key}'`) ||
        SOURCE_BLOB.includes(`"${key}"`) ||
        SOURCE_BLOB.includes('`' + key + '`')
    )
}

function isDynamicFamily(key: string): boolean {
    return DYNAMIC_KEY_PREFIXES.some(({ prefix }) => key.startsWith(prefix))
}

describe('i18n orphans (keys sin call site)', () => {
    const allKeys = Object.keys(es as Record<string, string>)
    const legacySet = new Set(KNOWN_LEGACY_ORPHANS)

    it('encontro literales i18n en el codigo fuente (sanity del scanner)', () => {
        // Si el scanner no ve nada, todo seria falso-huerfano: protege contra un blob vacio.
        expect(SOURCE_BLOB.length).toBeGreaterThan(10_000)
        expect(isReferencedLiteral('landing.nav.teams')).toBe(true)
    })

    it('no hay keys huerfanas NUEVAS (fuera de allowlist dinamica / legacy documentada)', () => {
        const orphans = allKeys.filter((key) => {
            if (isReferencedLiteral(key)) return false
            if (isDynamicFamily(key)) return false
            if (legacySet.has(key)) return false
            return true
        })
        expect(
            orphans,
            `Keys i18n huerfanas (sin call site, sin prefijo dinamico, sin allowlist legacy). ` +
                `Si son intencionalmente dinamicas, agregar el prefijo a DYNAMIC_KEY_PREFIXES con su call site. ` +
                `Si son copy nuevo aun sin cablear, cablearlas o removerlas: ${orphans.join(', ')}`
        ).toEqual([])
    })

    it('la allowlist legacy no tiene entradas obsoletas (keys ya re-cableadas o eliminadas)', () => {
        // Higiene: si una key legacy volvio a usarse o se borro del json, sacarla de la lista.
        const stale = KNOWN_LEGACY_ORPHANS.filter(
            (key) => isReferencedLiteral(key) || !(key in (es as Record<string, string>)) || isDynamicFamily(key)
        )
        expect(
            stale,
            `Entradas obsoletas en KNOWN_LEGACY_ORPHANS (ya referenciadas, eliminadas del json, o cubiertas por un prefijo dinamico) — limpiar: ${stale.join(', ')}`
        ).toEqual([])
    })

    it('las keys Teams del plan 02 estan TODAS referenciadas (no huerfanas)', () => {
        const teamsKeys = allKeys.filter(
            (k) =>
                k === 'landing.nav.teams' ||
                k === 'landing.final.empresas' ||
                k.startsWith('landing.teams.') ||
                k.startsWith('landing.pricing.teamsCallout.') ||
                k.startsWith('landing.pricing.teamsCard.')
        )
        // Sanity: el contrato i18n del plan 02 trae estas familias.
        expect(teamsKeys.length).toBeGreaterThanOrEqual(20)
        const unreferenced = teamsKeys.filter((k) => !isReferencedLiteral(k))
        expect(
            unreferenced,
            `Keys Teams sin call site (deberian estar cableadas por F1/F2): ${unreferenced.join(', ')}`
        ).toEqual([])
    })
})
