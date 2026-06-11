'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Check, Loader2, Users } from 'lucide-react'
import {
    MOVEMENT_PATTERNS_V1,
    finalItemScore,
    summarizeAssessment,
    type MovementItemInput as CalcItemInput,
    type MovementPatternDef,
    type MovementSummary,
} from '@eva/calc'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { cn } from '@/lib/utils'
import type { MovementAssessmentItem, MovementPatternSlug } from '@/domain/assessment/types'
import { PriorityBadge } from '@/components/movement/PriorityBadge'
import { MovementDisclaimer } from '@/components/movement/MovementDisclaimer'
import {
    finalizeAssessmentAction,
    upsertDraftItemAction,
    type MovementActionState,
} from '../_actions/movement.actions'

type ItemState = {
    score_left: number | null
    score_right: number | null
    score_single: number | null
    pain: boolean
    clearing_positive: boolean | null
    comment: string
}

type ItemsState = Record<MovementPatternSlug, ItemState>

function emptyItem(def: MovementPatternDef): ItemState {
    return {
        score_left: null,
        score_right: null,
        score_single: null,
        pain: false,
        clearing_positive: def.hasClearing ? false : null,
        comment: '',
    }
}

function initItems(saved: MovementAssessmentItem[]): ItemsState {
    const state = {} as ItemsState
    for (const def of MOVEMENT_PATTERNS_V1) {
        const row = saved.find((i) => i.pattern === def.slug)
        state[def.slug] = row
            ? {
                  score_left: row.score_left,
                  score_right: row.score_right,
                  score_single: row.score_single,
                  pain: row.pain,
                  clearing_positive: def.hasClearing ? (row.clearing_positive ?? false) : null,
                  comment: row.comment ?? '',
              }
            : emptyItem(def)
    }
    return state
}

function isComplete(def: MovementPatternDef, item: ItemState): boolean {
    return def.isPerSide ? item.score_left != null && item.score_right != null : item.score_single != null
}

function toCalcInput(def: MovementPatternDef, item: ItemState): CalcItemInput {
    return {
        pattern: def.slug,
        isPerSide: def.isPerSide,
        scoreLeft: item.score_left,
        scoreRight: item.score_right,
        scoreSingle: item.score_single,
        pain: item.pain,
        clearingPositive: item.clearing_positive,
    }
}

function ScoreSegmented({
    value,
    onChange,
    label,
}: {
    value: number | null
    onChange: (v: number) => void
    label: string
}) {
    return (
        <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <div className="flex gap-2" role="radiogroup" aria-label={label}>
                {[0, 1, 2, 3].map((score) => (
                    <button
                        key={score}
                        type="button"
                        role="radio"
                        aria-checked={value === score}
                        onClick={() => onChange(score)}
                        className={cn(
                            // Targets tactiles >= 44px (AC10)
                            'h-11 w-11 rounded-xl border text-base font-bold transition-colors',
                            value === score
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card text-foreground hover:bg-muted'
                        )}
                    >
                        {score}
                    </button>
                ))}
            </div>
        </div>
    )
}

function ToggleRow({
    checked,
    onChange,
    label,
    danger,
}: {
    checked: boolean
    onChange: (v: boolean) => void
    label: string
    danger?: boolean
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            onClick={() => onChange(!checked)}
            className={cn(
                'flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors',
                checked
                    ? danger
                        ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                        : 'border-primary/40 bg-primary/10 text-foreground'
                    : 'border-border bg-card text-foreground hover:bg-muted'
            )}
        >
            <span>{label}</span>
            <span
                aria-hidden
                className={cn(
                    'flex h-6 w-10 shrink-0 items-center rounded-full p-0.5 transition-colors',
                    checked ? (danger ? 'bg-red-500' : 'bg-primary') : 'bg-muted-foreground/30'
                )}
            >
                <span
                    className={cn(
                        'h-5 w-5 rounded-full bg-white shadow transition-transform',
                        checked && 'translate-x-4'
                    )}
                />
            </span>
        </button>
    )
}

/**
 * Wizard de captura del Screening de Movimiento (7 patrones + revision).
 * Tablet-first: h-dvh, targets >= 44px, safe-areas, dark mode. Autosave por paso
 * (useTransition) + retoma borrador cross-device; submit final con useActionState.
 * El semaforo de revision es preview optimista — el server SIEMPRE recalcula.
 */
export function MovementWizard({
    clientId,
    clientName,
    viaTeam,
    hasActiveConsent,
    initialAssessmentId,
    initialItems,
    editedByOther,
}: {
    clientId: string
    clientName: string | null
    viaTeam: boolean
    hasActiveConsent: boolean
    initialAssessmentId: string | null
    initialItems: MovementAssessmentItem[]
    editedByOther: boolean
}) {
    const { t } = useTranslation()
    const router = useRouter()
    const [items, setItems] = useState<ItemsState>(() => initItems(initialItems))
    const [step, setStep] = useState(0) // 0..6 patrones, 7 revision
    const [assessmentId, setAssessmentId] = useState<string | null>(initialAssessmentId)
    const [saveError, setSaveError] = useState<string | null>(null)
    const [isSaving, startSaving] = useTransition()
    const [finalizeState, finalizeAction, isFinalizing] = useActionState<MovementActionState, FormData>(
        finalizeAssessmentAction,
        {}
    )

    useEffect(() => {
        if (finalizeState.success) {
            router.push(`/coach/movement/${clientId}`)
        }
    }, [finalizeState.success, router, clientId])

    const totalSteps = MOVEMENT_PATTERNS_V1.length
    const isReview = step >= totalSteps
    const def = isReview ? null : MOVEMENT_PATTERNS_V1[step]

    const partialTotal = useMemo(() => {
        let sum = 0
        for (const d of MOVEMENT_PATTERNS_V1) {
            const item = items[d.slug]
            if (!isComplete(d, item)) continue
            try {
                sum += finalItemScore(toCalcInput(d, item))
            } catch {
                // item invalido => no suma
            }
        }
        return sum
    }, [items])

    const allComplete = MOVEMENT_PATTERNS_V1.every((d) => isComplete(d, items[d.slug]))

    const previewSummary: MovementSummary | null = useMemo(() => {
        if (!allComplete) return null
        try {
            return summarizeAssessment(MOVEMENT_PATTERNS_V1.map((d) => toCalcInput(d, items[d.slug])))
        } catch {
            return null
        }
    }, [allComplete, items])

    function patch(slug: MovementPatternSlug, partial: Partial<ItemState>) {
        setItems((prev) => ({ ...prev, [slug]: { ...prev[slug], ...partial } }))
    }

    function saveCurrent(onDone?: () => void) {
        if (!def) return
        const item = items[def.slug]
        setSaveError(null)
        startSaving(async () => {
            const res = await upsertDraftItemAction({
                client_id: clientId,
                item: {
                    pattern: def.slug,
                    score_left: def.isPerSide ? item.score_left : null,
                    score_right: def.isPerSide ? item.score_right : null,
                    score_single: def.isPerSide ? null : item.score_single,
                    pain: item.pain,
                    clearing_positive: def.hasClearing ? (item.clearing_positive ?? false) : null,
                    comment: item.comment.trim() || null,
                },
            })
            if (res.error) {
                setSaveError(res.error)
                return
            }
            if (res.assessmentId) setAssessmentId(res.assessmentId)
            onDone?.()
        })
    }

    const canFinalize =
        allComplete && assessmentId != null && (viaTeam ? hasActiveConsent : true) && !isFinalizing

    return (
        <div className="flex min-h-dvh flex-col bg-background">
            <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 px-4 pb-3 pt-safe backdrop-blur-xl">
                <div className="mx-auto flex max-w-2xl items-center justify-between gap-2 pt-3">
                    <Link
                        href={`/coach/movement/${clientId}`}
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden />
                        {clientName ?? t('assessment.title')}
                    </Link>
                    <p className="text-xs font-semibold text-muted-foreground">
                        {isReview
                            ? t('assessment.wizard.review')
                            : `${t('assessment.wizard.step')} ${step + 1} ${t('assessment.wizard.of')} ${totalSteps}`}
                    </p>
                </div>
                <div className="mx-auto mt-2 flex max-w-2xl gap-1">
                    {MOVEMENT_PATTERNS_V1.map((d, i) => (
                        <span
                            key={d.slug}
                            className={cn(
                                'h-1.5 flex-1 rounded-full transition-colors',
                                i < step || isReview
                                    ? 'bg-primary'
                                    : i === step
                                      ? 'bg-primary/50'
                                      : 'bg-muted'
                            )}
                        />
                    ))}
                </div>
            </header>

            <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-32">
                {editedByOther && (
                    <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                        <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        {t('assessment.wizard.lastEditedBy')}: {t('assessment.wizard.resumedDraft')}
                    </p>
                )}

                {def && (
                    <section className="space-y-4">
                        <div>
                            <h1 className="text-xl font-bold text-foreground">
                                {t(`assessment.pattern.${def.slug}`)}
                            </h1>
                        </div>

                        {def.isPerSide ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <ScoreSegmented
                                    label={t('assessment.side.left')}
                                    value={items[def.slug].score_left}
                                    onChange={(v) => patch(def.slug, { score_left: v })}
                                />
                                <ScoreSegmented
                                    label={t('assessment.side.right')}
                                    value={items[def.slug].score_right}
                                    onChange={(v) => patch(def.slug, { score_right: v })}
                                />
                            </div>
                        ) : (
                            <ScoreSegmented
                                label={t('assessment.side.single')}
                                value={items[def.slug].score_single}
                                onChange={(v) => patch(def.slug, { score_single: v })}
                            />
                        )}

                        <div className="space-y-2">
                            <ToggleRow
                                label={t('assessment.wizard.pain')}
                                checked={items[def.slug].pain}
                                onChange={(v) => patch(def.slug, { pain: v })}
                                danger
                            />
                            {def.hasClearing && (
                                <ToggleRow
                                    label={t('assessment.wizard.clearing')}
                                    checked={items[def.slug].clearing_positive === true}
                                    onChange={(v) => patch(def.slug, { clearing_positive: v })}
                                    danger
                                />
                            )}
                        </div>

                        <div>
                            <label
                                htmlFor="pattern-comment"
                                className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                                {t('assessment.wizard.comment')}
                            </label>
                            <textarea
                                id="pattern-comment"
                                value={items[def.slug].comment}
                                onChange={(e) => patch(def.slug, { comment: e.target.value })}
                                rows={3}
                                maxLength={500}
                                className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                            />
                        </div>
                    </section>
                )}

                {isReview && (
                    <section className="space-y-4">
                        <h1 className="text-xl font-bold text-foreground">{t('assessment.wizard.review')}</h1>

                        <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border bg-card">
                            {MOVEMENT_PATTERNS_V1.map((d, i) => {
                                const item = items[d.slug]
                                const complete = isComplete(d, item)
                                let score: number | null = null
                                if (complete) {
                                    try {
                                        score = finalItemScore(toCalcInput(d, item))
                                    } catch {
                                        score = null
                                    }
                                }
                                return (
                                    <li key={d.slug} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <button
                                            type="button"
                                            onClick={() => setStep(i)}
                                            className="min-h-11 flex-1 text-left text-sm font-medium text-foreground hover:text-primary"
                                        >
                                            {t(`assessment.pattern.${d.slug}`)}
                                        </button>
                                        <span
                                            className={cn(
                                                'inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold tabular-nums',
                                                score == null
                                                    ? 'bg-muted text-muted-foreground'
                                                    : score === 0
                                                      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                                                      : 'bg-muted text-foreground'
                                            )}
                                        >
                                            {score ?? '—'}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>

                        {!allComplete && (
                            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                                {t('assessment.wizard.incomplete')}
                            </p>
                        )}

                        {previewSummary && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                                <div>
                                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                        {t('assessment.wizard.previewBand')}
                                    </p>
                                    <PriorityBadge band={previewSummary.band} size="lg" className="mt-2" />
                                </div>
                                <p className="text-3xl font-extrabold tabular-nums text-foreground">
                                    {previewSummary.composite}
                                    <span className="text-base font-semibold text-muted-foreground">/21</span>
                                </p>
                            </div>
                        )}

                        <form action={finalizeAction} className="space-y-3">
                            <input type="hidden" name="client_id" value={clientId} />
                            <input type="hidden" name="assessment_id" value={assessmentId ?? ''} />

                            <div>
                                <label
                                    htmlFor="assessment-notes"
                                    className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                                >
                                    {t('assessment.wizard.notes')}
                                </label>
                                <textarea
                                    id="assessment-notes"
                                    name="notes"
                                    rows={3}
                                    maxLength={2000}
                                    className="w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                />
                            </div>

                            {viaTeam ? (
                                <p
                                    className={cn(
                                        'rounded-xl border px-3 py-2 text-xs',
                                        hasActiveConsent
                                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                                            : 'border-red-500/30 bg-red-500/10 text-red-800 dark:text-red-200'
                                    )}
                                >
                                    {hasActiveConsent
                                        ? t('assessment.wizard.consentOk')
                                        : t('assessment.wizard.consentMissing')}
                                </p>
                            ) : (
                                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
                                    <input
                                        type="checkbox"
                                        name="consent_attested"
                                        required
                                        className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
                                    />
                                    <span className="text-sm text-foreground">
                                        {t('assessment.wizard.attestation')}
                                    </span>
                                </label>
                            )}

                            {finalizeState.error && (
                                <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
                                    {finalizeState.error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={!canFinalize}
                                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-lg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isFinalizing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                ) : (
                                    <Check className="h-4 w-4" aria-hidden />
                                )}
                                {isFinalizing ? t('assessment.wizard.finalizing') : t('assessment.wizard.finalize')}
                            </button>
                        </form>

                        <MovementDisclaimer />
                    </section>
                )}

                {saveError && (
                    <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-800 dark:text-red-200">
                        {saveError}
                    </p>
                )}
            </main>

            {/* Barra fija: total parcial + navegacion (safe-area, AC10) */}
            <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/95 px-4 pb-safe backdrop-blur-xl">
                <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 py-3">
                    <div>
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t('assessment.wizard.partialTotal')}
                        </p>
                        <p className="text-xl font-extrabold tabular-nums text-foreground">
                            {partialTotal}
                            <span className="text-sm font-semibold text-muted-foreground">/21</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={() => setStep((s) => Math.max(0, s - 1))}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
                            >
                                <ArrowLeft className="h-4 w-4" aria-hidden />
                                {t('assessment.wizard.back')}
                            </button>
                        )}
                        {!isReview && def && (
                            <button
                                type="button"
                                disabled={!isComplete(def, items[def.slug]) || isSaving}
                                onClick={() => saveCurrent(() => setStep((s) => s + 1))}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {isSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                                        {t('assessment.wizard.saving')}
                                    </>
                                ) : (
                                    <>
                                        {step === totalSteps - 1
                                            ? t('assessment.wizard.review')
                                            : t('assessment.wizard.next')}
                                        <ArrowRight className="h-4 w-4" aria-hidden />
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </footer>
        </div>
    )
}
