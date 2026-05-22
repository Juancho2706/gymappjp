'use client'

import { createContext, useContext, useReducer, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
    movidaOrg,
    movidaOrgStats,
    movidaCoaches,
    movidaClients,
    movidaOrgMembers,
    mariaActivePlan,
    mariaDailyMeals,
    mariaCheckIns,
    mariaWorkoutHistory,
    type DemoClient,
    type DemoCoach,
    type DemoMeal,
    type DemoCheckIn,
    type DemoWorkoutSet,
    type DemoWorkoutLog,
} from '../_mock'
import type { OrgWithMembership } from '@/infrastructure/db/org.repository'

// ─── State shape ─────────────────────────────────────────────────────────────

export type DemoState = {
    org: OrgWithMembership
    stats: typeof movidaOrgStats
    coaches: DemoCoach[]
    clients: DemoClient[]
    pendingInviteEmail: string | null
    activePlanExercises: DemoWorkoutSet[]
    mealLog: DemoMeal[]
    checkIns: DemoCheckIn[]
    workoutHistory: DemoWorkoutLog[]
    invitedCoaches: string[]
    workoutStarted: boolean
    workoutCompleted: boolean
}

const initialState: DemoState = {
    org: movidaOrg,
    stats: movidaOrgStats,
    coaches: movidaCoaches,
    clients: movidaClients,
    pendingInviteEmail: null,
    activePlanExercises: mariaActivePlan.exercises,
    mealLog: mariaDailyMeals,
    checkIns: mariaCheckIns,
    workoutHistory: mariaWorkoutHistory,
    invitedCoaches: [],
    workoutStarted: false,
    workoutCompleted: false,
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type Action =
    | { type: 'LOG_SET'; exerciseId: string; reps: number; weight: number | null }
    | { type: 'COMPLETE_EXERCISE'; exerciseId: string }
    | { type: 'COMPLETE_WORKOUT' }
    | { type: 'START_WORKOUT' }
    | { type: 'ADD_MEAL'; meal: DemoMeal }
    | { type: 'REMOVE_MEAL'; mealId: string }
    | { type: 'ADD_CHECKIN'; checkIn: DemoCheckIn }
    | { type: 'INVITE_COACH'; email: string }
    | { type: 'ASSIGN_CLIENT'; clientId: string; coachId: string }
    | { type: 'UPDATE_ORG_BRANDING'; primaryColor: string }

function reducer(state: DemoState, action: Action): DemoState {
    switch (action.type) {
        case 'LOG_SET':
            return {
                ...state,
                activePlanExercises: state.activePlanExercises.map(ex =>
                    ex.exercise_id === action.exerciseId
                        ? { ...ex, logged_reps: action.reps, logged_weight_kg: action.weight }
                        : ex
                ),
            }
        case 'COMPLETE_EXERCISE':
            return {
                ...state,
                activePlanExercises: state.activePlanExercises.map(ex =>
                    ex.exercise_id === action.exerciseId ? { ...ex, completed: true } : ex
                ),
            }
        case 'START_WORKOUT':
            return { ...state, workoutStarted: true }
        case 'COMPLETE_WORKOUT':
            return {
                ...state,
                workoutCompleted: true,
                workoutHistory: [
                    {
                        id: `log-demo-${Date.now()}`,
                        plan_name: mariaActivePlan.name,
                        week: mariaActivePlan.week,
                        completed_at: new Date().toISOString(),
                        duration_minutes: 58,
                        total_volume_kg: 4680,
                        exercises_count: 6,
                        sets_count: 20,
                    },
                    ...state.workoutHistory,
                ],
            }
        case 'ADD_MEAL':
            return {
                ...state,
                mealLog: [...state.mealLog, action.meal],
            }
        case 'REMOVE_MEAL':
            return {
                ...state,
                mealLog: state.mealLog.filter(m => m.id !== action.mealId),
            }
        case 'ADD_CHECKIN':
            return {
                ...state,
                checkIns: [action.checkIn, ...state.checkIns],
            }
        case 'INVITE_COACH':
            return {
                ...state,
                invitedCoaches: [...state.invitedCoaches, action.email],
                stats: { ...state.stats, pendingInvites: state.stats.pendingInvites + 1 },
            }
        case 'ASSIGN_CLIENT':
            return {
                ...state,
                clients: state.clients.map(c =>
                    c.id === action.clientId ? { ...c, coach_id: action.coachId } : c
                ),
            }
        case 'UPDATE_ORG_BRANDING':
            return {
                ...state,
                org: { ...state.org, primary_color: action.primaryColor },
            }
        default:
            return state
    }
}

// ─── Context ──────────────────────────────────────────────────────────────────

type DemoContextValue = {
    state: DemoState
    dispatch: React.Dispatch<Action>
}

const DemoContext = createContext<DemoContextValue | null>(null)

export function DemoStateProvider({ children }: { children: ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState)
    return (
        <DemoContext.Provider value={{ state, dispatch }}>
            {children}
        </DemoContext.Provider>
    )
}

export function useDemoState() {
    const ctx = useContext(DemoContext)
    if (!ctx) throw new Error('useDemoState must be used within DemoStateProvider')
    return ctx.state
}

// ─── Actions hook ─────────────────────────────────────────────────────────────

export function useDemoActions() {
    const ctx = useContext(DemoContext)
    if (!ctx) throw new Error('useDemoActions must be used within DemoStateProvider')
    const { dispatch } = ctx

    return {
        logSet(exerciseId: string, reps: number, weight: number | null) {
            dispatch({ type: 'LOG_SET', exerciseId, reps, weight })
            toast.success('Set registrado', { description: 'Demo · acción simulada ✓' })
        },
        completeExercise(exerciseId: string, exerciseName: string) {
            dispatch({ type: 'COMPLETE_EXERCISE', exerciseId })
            toast.success(`${exerciseName} completado`, { description: 'Demo · acción simulada ✓' })
        },
        startWorkout() {
            dispatch({ type: 'START_WORKOUT' })
            toast.info('Entrenamiento iniciado', { description: 'Demo · cronómetro activo' })
        },
        completeWorkout() {
            dispatch({ type: 'COMPLETE_WORKOUT' })
            toast.success('¡Entrenamiento completado!', { description: 'Demo · sesión guardada en historial ✓' })
        },
        addMeal(meal: DemoMeal) {
            dispatch({ type: 'ADD_MEAL', meal })
            toast.success('Comida registrada', { description: 'Demo · macros actualizados ✓' })
        },
        removeMeal(mealId: string) {
            dispatch({ type: 'REMOVE_MEAL', mealId })
            toast.info('Comida eliminada', { description: 'Demo · acción simulada ✓' })
        },
        addCheckIn(checkIn: DemoCheckIn) {
            dispatch({ type: 'ADD_CHECKIN', checkIn })
            toast.success('Check-in registrado', { description: 'Demo · Felipe será notificado ✓' })
        },
        inviteCoach(email: string) {
            dispatch({ type: 'INVITE_COACH', email })
            toast.success('Invitación enviada', { description: `Demo · invite enviado a ${email} ✓` })
        },
        assignClient(clientId: string, coachId: string, coachName: string) {
            dispatch({ type: 'ASSIGN_CLIENT', clientId, coachId })
            toast.success('Cliente asignado', { description: `Demo · asignado a ${coachName} ✓` })
        },
        updateOrgBranding(primaryColor: string) {
            dispatch({ type: 'UPDATE_ORG_BRANDING', primaryColor })
            toast.success('Marca actualizada', { description: 'Demo · cambios de branding aplicados ✓' })
        },
        simulateAction(label: string) {
            toast.success(label, { description: 'Demo · acción simulada ✓' })
        },
    }
}
