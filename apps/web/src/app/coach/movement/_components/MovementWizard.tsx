'use client'

import { useActionState, useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertCircle, ArrowLeft, ArrowRight, Check, Loader2, Users } from 'lucide-react'
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

/** Dolor o descarte positivo fuerzan puntaje 0 (kit): el score row se oculta y el item cuenta como completo. */
function isForcedZero(def: MovementPatternDef, item: ItemState): boolean {
    return item.pain || (def.hasClearing && item.clearing_positive === true)
}

function isComplete(def: MovementPatternDef, item: ItemState): boolean {
    if (isForcedZero(def, item)) return true
    return def.isPerSide ? item.score_left != null && item.score_right != null : item.score_single != null
}

function toCalcInput(def: MovementPatternDef, item: ItemState): CalcItemInput {
    const forced = isForcedZero(def, item)
    return {
        pattern: def.slug,
        isPerSide: def.isPerSide,
        scoreLeft: item.score_left ?? (forced && def.isPerSide ? 0 : null),
        scoreRight: item.score_right ?? (forced && def.isPerSide ? 0 : null),
        scoreSingle: item.score_single ?? (forced && !def.isPerSide ? 0 : null),
        pain: item.pain,
        clearingPositive: item.clearing_positive,
    }
}

/** Color del puntaje 0–3: 0 danger · 1 warning · 2 sport · 3 success (semáforo del DS). */
const SCORE_COLOR = ['var(--danger-500)', 'var(--warning-500)', 'var(--sport-500)', 'var(--success-500)']

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
            <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">{label}</p>
            <div className="flex gap-2" role="radiogroup" aria-label={label}>
                {[0, 1, 2, 3].map((score) => {
                    const active = value === score
                    return (
                        <button
                            key={score}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => onChange(score)}
                            // Targets tactiles >= 44px (AC10)
                            className={cn(
                                'h-12 flex-1 rounded-control border-[1.5px] font-display text-xl font-black tabular-nums transition-all active:scale-[0.97]',
                                active
                                    ? 'border-transparent text-white'
                                    : 'border-default bg-surface-card text-muted hover:bg-surface-sunken'
                            )}
                            style={active ? { background: SCORE_COLOR[score] } : undefined}
                        >
                            {score}
                        </button>
                    )
                })}
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
                'flex min-h-11 w-full items-center justify-between gap-3 rounded-control border-[1.5px] px-3.5 py-3 text-left text-sm font-semibold transition-colors',
                checked
                    ? danger
                        ? 'border-transparent bg-[var(--danger-100)] text-[color:var(--danger-700)]'
                        : 'border-transparent bg-sport-100 text-strong'
                    : 'border-transparent bg-surface-sunken text-strong hover:bg-[var(--border-subtle)]'
            )}
        >
            <span>{label}</span>
            <span
                aria-hidden
                className={cn(
                    'flex h-6 w-10 shrink-0 items-center rounded-pill p-0.5 transition-colors',
                    checked
                        ? danger
                            ? 'bg-[var(--danger-500)]'
                            : 'bg-sport-500'
                        : 'bg-[var(--ink-300)]'
                )}
            >
                <span
                    className={cn(
                        'size-5 rounded-full bg-white shadow transition-transform',
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
        // Forzado a 0 (dolor/descarte): el schema exige los puntajes crudos → se persisten en 0
        // (el motor finalItemScore fuerza el final a 0 igual; el server recalcula SIEMPRE).
        const forced = isForcedZero(def, item)
        setSaveError(null)
        startSaving(async () => {
            const res = await upsertDraftItemAction({
                client_id: clientId,
                item: {
                    pattern: def.slug,
                    score_left: def.isPerSide ? (item.score_left ?? (forced ? 0 : null)) : null,
                    score_right: def.isPerSide ? (item.score_right ?? (forced ? 0 : null)) : null,
                    score_single: def.isPerSide ? null : (item.score_single ?? (forced ? 0 : null)),
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
                        className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-muted transition-colors hover:text-strong"
                    >
                        <ArrowLeft className="size-4" aria-hidden />
                        {clientName ?? t('assessment.title')}
                    </Link>
                    <p className="text-xs font-bold text-muted">
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
                                'h-1.5 flex-1 rounded-pill transition-colors',
                                i < step || isReview
                                    ? 'bg-sport-500'
                                    : i === step
                                      ? 'bg-sport-300'
                                      : 'bg-[var(--ink-200)]'
                            )}
                        />
                    ))}
                </div>
            </header>

            <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-5 pb-32 md:pb-8">
                {editedByOther && (
                    <p className="mb-4 flex items-center gap-2 rounded-control bg-[var(--warning-100)] px-3.5 py-2.5 text-xs font-semibold text-[color:var(--warning-700)]">
                        <Users className="size-3.5 shrink-0" aria-hidden />
                        {t('assessment.wizard.lastEditedBy')}: {t('assessment.wizard.resumedDraft')}
                    </p>
                )}

                {def && (
                    <section className="space-y-4">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sport-600">
                                {t('assessment.wizard.step')} {step + 1}
                            </p>
                            <h1 className="mt-1 font-display text-2xl font-black tracking-[-0.02em] text-strong">
                                {t(`assessment.pattern.${def.slug}`)}
                            </h1>
                        </div>

                        {isForcedZero(def, items[def.slug]) ? (
                            <div className="flex items-center gap-[9px] rounded-control bg-[var(--danger-100)] px-3.5 py-3">
                                <AlertCircle className="size-4 shrink-0 text-[color:var(--danger-600)]" aria-hidden />
                                <p className="text-[12.5px] font-semibold text-[color:var(--danger-700)]">
                                    El patrón se registra con puntaje 0.
                                </p>
                            </div>
                        ) : def.isPerSide ? (
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
                                className="mb-1.5 block text-xs font-bold uppercase tracking-[0.06em] text-muted"
                            >
                                {t('assessment.wizard.comment')}
                            </label>
                            <textarea
                                id="pattern-comment"
                                value={items[def.slug].comment}
                                onChange={(e) => patch(def.slug, { comment: e.target.value })}
                                rows={3}
                                maxLength={500}
                                className="w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5 py-2.5 text-sm text-strong outline-none transition-colors placeholder:text-subtle focus:border-[var(--brand)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                            />
                        </div>
                    </section>
                )}

                {isReview && (
                    <section className="space-y-4">
                        <h1 className="font-display text-2xl font-black tracking-[-0.02em] text-strong">{t('assessment.wizard.review')}</h1>

                        <ul className="overflow-hidden rounded-card border border-subtle bg-surface-card shadow-sm">
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
                                    <li
                                        key={d.slug}
                                        className={cn(
                                            'flex items-center justify-between gap-3 px-4 py-3',
                                            i > 0 && 'border-t border-subtle'
                                        )}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => setStep(i)}
                                            className="min-h-11 flex-1 text-left text-sm font-semibold text-strong transition-colors hover:text-[color:var(--brand)]"
                                        >
                                            {t(`assessment.pattern.${d.slug}`)}
                                        </button>
                                        <span
                                            className={cn(
                                                'inline-flex size-8 items-center justify-center rounded-[8px] font-display text-sm font-black tabular-nums',
                                                score == null
                                                    ? 'bg-surface-sunken text-muted'
                                                    : score === 0
                                                      ? 'bg-[var(--danger-100)] text-[color:var(--danger-600)]'
                                                      : 'bg-surface-sunken text-strong'
                                            )}
                                        >
                                            {score ?? '—'}
                                        </span>
                                    </li>
                                )
                            })}
                        </ul>

                        {!allComplete && (
                            <p className="rounded-control bg-[var(--warning-100)] px-3.5 py-2.5 text-xs font-semibold text-[color:var(--warning-700)]">
                                {t('assessment.wizard.incomplete')}
                            </p>
                        )}

                        {previewSummary && (
                            <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-[color:var(--border-inverse)] bg-[var(--surface-inverse)] p-5 shadow-[var(--shadow-md)]">
                                <div>
                                    <p className="text-xs uppercase tracking-[0.06em] text-on-dark-muted">
                                        {t('assessment.wizard.previewBand')}
                                    </p>
                                    <PriorityBadge band={previewSummary.band} size="lg" className="mt-2" />
                                </div>
                                <p className="flex items-baseline gap-1 font-display text-4xl font-black tabular-nums tracking-[-0.03em] text-on-dark">
                                    {previewSummary.composite}
                                    <span className="text-base font-semibold text-on-dark-muted">/21</span>
                                </p>
                            </div>
                        )}

                        <form action={finalizeAction} className="space-y-3">
                            <input type="hidden" name="client_id" value={clientId} />
                            <input type="hidden" name="assessment_id" value={assessmentId ?? ''} />

                            <div>
                                <label
                                    htmlFor="assessment-notes"
                                    className="mb-1.5 block text-xs font-bold uppercase tracking-[0.06em] text-muted"
                                >
                                    {t('assessment.wizard.notes')}
                                </label>
                                <textarea
                                    id="assessment-notes"
                                    name="notes"
                                    rows={3}
                                    maxLength={2000}
                                    className="w-full rounded-control border-[1.5px] border-default bg-surface-card px-3.5 py-2.5 text-sm text-strong outline-none transition-colors focus:border-[var(--brand)] focus-visible:ring-[3px] focus-visible:ring-[var(--focus-ring)]"
                                />
                            </div>

                            {viaTeam ? (
                                <p
                                    className={cn(
                                        'rounded-control px-3.5 py-2.5 text-xs font-semibold',
                                        hasActiveConsent
                                            ? 'bg-[var(--success-100)] text-[color:var(--success-700)]'
                                            : 'bg-[var(--danger-100)] text-[color:var(--danger-700)]'
                                    )}
                                >
                                    {hasActiveConsent
                                        ? t('assessment.wizard.consentOk')
                                        : t('assessment.wizard.consentMissing')}
                                </p>
                            ) : (
                                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-control border-[1.5px] border-default bg-surface-card px-3.5 py-3">
                                    <input
                                        type="checkbox"
                                        name="consent_attested"
                                        required
                                        className="mt-0.5 size-5 shrink-0 accent-[var(--brand)]"
                                    />
                                    <span className="text-sm text-body">
                                        {t('assessment.wizard.attestation')}
                                    </span>
                                </label>
                            )}

                            {finalizeState.error && (
                                <p className="rounded-control bg-[var(--danger-100)] px-3.5 py-2.5 text-xs font-semibold text-[color:var(--danger-700)]">
                                    {finalizeState.error}
                                </p>
                            )}

                            <button
                                type="submit"
                                disabled={!canFinalize}
                                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-[var(--cta-fill)] px-5 text-[15px] font-bold text-[var(--text-on-sport)] shadow-[var(--glow-sport)] transition-all hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
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
                    <p className="mt-4 rounded-control bg-[var(--danger-100)] px-3.5 py-2.5 text-xs font-semibold text-[color:var(--danger-700)]">
                        {saveError}
                    </p>
                )}
            </main>

            {/* Barra fija en móvil: total parcial + navegacion (safe-area, AC10). En desktop
                queda confinada a la columna de contenido (kit dt-stage) — jamás sobre el sidebar. */}
            <footer className="fixed inset-x-0 bottom-0 z-40 border-t border-subtle bg-[color-mix(in_oklab,var(--surface-card)_92%,transparent)] px-4 pb-safe backdrop-blur-xl md:static md:inset-x-auto">
                <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 py-3">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-muted">
                            {t('assessment.wizard.partialTotal')}
                        </p>
                        <p className="font-display text-xl font-black tabular-nums tracking-[-0.03em] text-strong">
                            {partialTotal}
                            <span className="text-sm font-semibold text-muted">/21</span>
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {step > 0 && (
                            <button
                                type="button"
                                onClick={() => setStep((s) => Math.max(0, s - 1))}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-control border-[1.5px] border-default bg-surface-card px-4 text-sm font-bold text-strong transition-colors hover:bg-surface-sunken active:scale-[0.97]"
                            >
                                <ArrowLeft className="size-4" aria-hidden />
                                {t('assessment.wizard.back')}
                            </button>
                        )}
                        {!isReview && def && (
                            <button
                                type="button"
                                disabled={!isComplete(def, items[def.slug]) || isSaving}
                                onClick={() => saveCurrent(() => setStep((s) => s + 1))}
                                className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-[var(--cta-fill)] px-5 text-sm font-bold text-[var(--text-on-sport)] shadow-[var(--shadow-sm)] transition-all hover:opacity-90 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
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
