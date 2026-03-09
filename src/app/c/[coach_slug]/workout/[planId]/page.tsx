import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Dumbbell, Timer } from 'lucide-react'
import type { Metadata } from 'next'
import { LogSetForm } from './LogSetForm'

export const metadata: Metadata = { title: 'Rutina | OmniCoach OS' }

interface Props {
    params: Promise<{ coach_slug: string; planId: string }>
}

export default async function WorkoutExecutionPage({ params }: Props) {
    const { coach_slug, planId } = await params
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/c/${coach_slug}/login`)

    interface ExerciseType {
        id: string
        name: string
        muscle_group: string
        video_url: string | null
    }

    interface BlockType {
        id: string
        order_index: number
        sets: number
        reps: string
        rir: string | null
        rest_time: string | null
        notes: string | null
        exercises: ExerciseType | ExerciseType[]
    }

    interface PlanType {
        id: string
        title: string
        assigned_date: string
        workout_blocks: BlockType[]
    }

    const { data: rawPlan } = await supabase
        .from('workout_plans')
        .select(`
            id, title, assigned_date,
            workout_blocks (
                id, order_index, sets, reps, rir, rest_time, notes,
                exercises ( id, name, muscle_group, video_url )
            )
        `)
        .eq('id', planId)
        .eq('client_id', user.id)
        .maybeSingle()

    if (!rawPlan) redirect(`/c/${coach_slug}/dashboard`)

    const plan = rawPlan as unknown as PlanType

    // Fetch logs for this plan today to show completion status
    const { data: rawLogs } = await supabase
        .from('workout_logs')
        .select('block_id, set_number, weight_kg, reps_done, rpe')
        .in('block_id', plan.workout_blocks.map(b => b.id))

    const logs = (rawLogs || []) as Array<{
        block_id: string
        set_number: number
        weight_kg: number | null
        reps_done: number | null
        rpe: number | null
    }>

    // Sort blocks by order_index
    const blocks = plan.workout_blocks.sort((a, b) => a.order_index - b.order_index)

    return (
        <div className="min-h-screen pb-20" style={{ backgroundColor: '#0A0A0A' }}>
            {/* Header Sticky */}
            <div className="sticky top-0 z-10 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 px-4 py-4">
                <Link href={`/c/${coach_slug}/dashboard`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium mb-3 transition-colors"
                    style={{ color: 'var(--theme-primary)' }}>
                    <ArrowLeft className="w-4 h-4" />
                    Volver
                </Link>
                <h1 className="text-xl font-bold text-zinc-50 leading-tight" style={{ fontFamily: 'var(--font-outfit)' }}>
                    {plan.title}
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                    {blocks.length} ejercicios · {blocks.reduce((acc, b) => acc + b.sets, 0)} series totales
                </p>
            </div>

            <main className="px-4 py-6 space-y-6 max-w-lg mx-auto">
                {blocks.map((block, index) => {
                    const exercise = Array.isArray(block.exercises) ? block.exercises[0] : block.exercises
                    if (!exercise) return null

                    const blockLogs = logs?.filter(l => l.block_id === block.id) || []
                    const isCompleted = blockLogs.length >= block.sets

                    return (
                        <div key={block.id}
                            className={`bg-zinc-900 border rounded-2xl overflow-hidden transition-all duration-300
                            ${isCompleted ? 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]' : 'border-zinc-800'}`}>

                            {/* Block Header */}
                            <div className="p-4 border-b border-zinc-800/50">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                                            ${isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-800 text-zinc-400'}`}>
                                            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-base font-semibold text-zinc-100 truncate">{exercise.name}</p>
                                            <p className="text-xs text-zinc-500">{exercise.muscle_group}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Target Details */}
                                <div className="flex flex-wrap gap-2 mt-4">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-300">
                                        <Dumbbell className="w-3.5 h-3.5 text-zinc-500" />
                                        {block.sets} × {block.reps}
                                    </span>
                                    {block.rir && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-300">
                                            {block.rir} RIR
                                        </span>
                                    )}
                                    {block.rest_time && (
                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-medium text-zinc-300">
                                            <Timer className="w-3.5 h-3.5 text-zinc-500" />
                                            {block.rest_time}
                                        </span>
                                    )}
                                </div>

                                {block.notes && (
                                    <div className="mt-3 p-2.5 rounded-lg bg-zinc-950/50 border border-zinc-800/50 text-xs text-zinc-400">
                                        <strong className="text-zinc-300">Nota:</strong> {block.notes}
                                    </div>
                                )}
                            </div>

                            {/* Sets Logger */}
                            <div className="p-4 space-y-3 bg-zinc-950/30">
                                <div className="grid grid-cols-[auto_1fr_1fr_1fr_auto] gap-2 px-2 pb-2 text-[10px] font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800/50">
                                    <div className="w-5 text-center">#</div>
                                    <div className="text-center">kg</div>
                                    <div className="text-center">reps</div>
                                    <div className="text-center">rpe</div>
                                    <div className="w-8"></div>
                                </div>

                                {Array.from({ length: block.sets }).map((_, i) => {
                                    const setNumber = i + 1
                                    const log = blockLogs.find(l => l.set_number === setNumber)
                                    return (
                                        <LogSetForm
                                            key={setNumber}
                                            blockId={block.id}
                                            setNumber={setNumber}
                                            existingLog={log}
                                        />
                                    )
                                })}
                            </div>
                        </div>
                    )
                })}
            </main>
        </div>
    )
}
