/**
 * Fixtures de PARIDAD de la regla de completitud del día (spec `workout-day-in-progress`, F1).
 *
 * Un solo set de casos consumido por los tres lados para que el estado de la day-card NO pueda
 * divergir entre plataformas:
 *   · `day-completion.parity.test.ts` (este paquete) — el contrato mismo.
 *   · web — tests de `weekPendingWorkouts.ts` (F2).
 *   · RN  — `tests/mobile/executor-v3-weekly-streak.test.ts` (F3).
 * Cada app arma su propia entrada desde SUS queries y verifica que el `state` resultante sea el del
 * fixture; si un adaptador pierde `sets` o `set_number` por el camino, el caso falla ahí.
 *
 * Se exportan desde el índice del paquete (`@eva/workout-engine`) a propósito: los tsconfig de web y
 * mobile mapean UNA sola entrada para este paquete (no hay subpath tipo `@eva/bodycomp/fixtures`).
 * Son datos inertes, sin dependencias.
 */
import type { DayCompletion, DayCompletionInput } from './day-completion'

export interface DayCompletionFixture {
    /** Nombre del caso — se reutiliza como título del `it` en cada plataforma. */
    name: string
    input: DayCompletionInput
    expected: DayCompletion
}

export const DAY_COMPLETION_FIXTURES: readonly DayCompletionFixture[] = [
    {
        name: 'fuerza sin registrar nada => none',
        input: {
            blocks: [
                { id: 'b1', sets: 3 },
                { id: 'b2', sets: 4 },
                { id: 'b3', sets: 3 },
            ],
            loggedSetsByBlock: {},
        },
        expected: { state: 'none', pct: 0, expected: 10, logged: 0 },
    },
    {
        name: 'una sola serie de 10 => in_progress (el bug P0: antes daba done)',
        input: {
            blocks: [
                { id: 'b1', sets: 3 },
                { id: 'b2', sets: 4 },
                { id: 'b3', sets: 3 },
            ],
            loggedSetsByBlock: { b1: 1 },
        },
        expected: { state: 'in_progress', pct: 0.1, expected: 10, logged: 1 },
    },
    {
        name: 'última serie faltante => in_progress (no done)',
        input: {
            blocks: [
                { id: 'b1', sets: 4 },
                { id: 'b2', sets: 4 },
            ],
            loggedSetsByBlock: { b1: 4, b2: 3 },
        },
        expected: { state: 'in_progress', pct: 0.875, expected: 8, logged: 7 },
    },
    {
        name: '100% exacto de las series => done',
        input: {
            blocks: [
                { id: 'b1', sets: 3 },
                { id: 'b2', sets: 4 },
                { id: 'b3', sets: 3 },
            ],
            loggedSetsByBlock: { b1: 3, b2: 4, b3: 3 },
        },
        expected: { state: 'done', pct: 1, expected: 10, logged: 10 },
    },
    {
        name: 'cardio con sets null/ausente: cada bloque vale 1 unidad (mitad hecha)',
        input: {
            blocks: [{ id: 'c1', sets: null }, { id: 'c2' }],
            loggedSetsByBlock: { c1: 1 },
        },
        expected: { state: 'in_progress', pct: 0.5, expected: 2, logged: 1 },
    },
    {
        name: 'plan solo-cardio completo => done',
        input: {
            blocks: [{ id: 'c1', sets: null }, { id: 'c2' }],
            loggedSetsByBlock: { c1: 1, c2: 1 },
        },
        expected: { state: 'done', pct: 1, expected: 2, logged: 2 },
    },
    {
        name: 'sets 0 cuenta como 1 unidad (movilidad junto a fuerza)',
        input: {
            blocks: [
                { id: 'm1', sets: 0 },
                { id: 'b1', sets: 3 },
            ],
            loggedSetsByBlock: { m1: 1, b1: 3 },
        },
        expected: { state: 'done', pct: 1, expected: 4, logged: 4 },
    },
    {
        name: 'mixto fuerza + cardio al 100% => done',
        input: {
            blocks: [
                { id: 's1', sets: 4 },
                { id: 'c1', sets: null },
            ],
            loggedSetsByBlock: { s1: 4, c1: 1 },
        },
        expected: { state: 'done', pct: 1, expected: 5, logged: 5 },
    },
    {
        name: 'cap por bloque: coach bajó las series post-sesión, no hay >100%',
        input: {
            blocks: [
                { id: 'b1', sets: 2 },
                { id: 'b2', sets: 2 },
            ],
            loggedSetsByBlock: { b1: 5, b2: 1 },
        },
        expected: { state: 'in_progress', pct: 0.75, expected: 4, logged: 3 },
    },
    {
        name: 'log huérfano (bloque borrado) se ignora, el resto sigue in_progress',
        input: {
            blocks: [{ id: 'b1', sets: 2 }],
            loggedSetsByBlock: { b1: 1, 'bloque-borrado': 4 },
        },
        expected: { state: 'in_progress', pct: 0.5, expected: 2, logged: 1 },
    },
    {
        name: 'sólo logs huérfanos => none (el día se mide contra el plan vigente)',
        input: {
            blocks: [{ id: 'b1', sets: 2 }],
            loggedSetsByBlock: { 'bloque-borrado': 3 },
        },
        expected: { state: 'none', pct: 0, expected: 2, logged: 0 },
    },
    {
        name: 'plan sin bloques => none (no existe el 100% de nada)',
        input: {
            blocks: [],
            loggedSetsByBlock: { b1: 3 },
        },
        expected: { state: 'none', pct: 0, expected: 0, logged: 0 },
    },
] as const
