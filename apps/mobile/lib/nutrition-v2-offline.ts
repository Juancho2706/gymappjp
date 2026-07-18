import AsyncStorage from '@react-native-async-storage/async-storage'
import NetInfo from '@react-native-community/netinfo'
import type {
  NutritionIntakeCorrection,
  NutritionIntakeMutation,
} from '@eva/nutrition-v2'
import { ApiError } from './api'
import {
  correctNutritionIntakeV2,
  recordNutritionIntakeV2,
} from './nutrition-v2.api'

const QUEUE_KEY = 'eva:nutrition-v2:mutations:v1'
const DEAD_LETTER_KEY = 'eva:nutrition-v2:mutations:dead:v1'
const MAX_QUEUE_ITEMS = 100
const MAX_DEAD_LETTERS = 25
const MAX_ATTEMPTS = 8

type QueuedRecord = {
  queueVersion: 1
  action: 'record'
  userId: string
  clientId: string
  idempotencyKey: string
  payload: NutritionIntakeMutation
  queuedAt: number
  attempts: number
  nextAttemptAt: number
  lastErrorCode: string | null
}

type QueuedCorrection = {
  queueVersion: 1
  action: 'correct'
  userId: string
  clientId: string
  idempotencyKey: string
  payload: NutritionIntakeCorrection
  queuedAt: number
  attempts: number
  nextAttemptAt: number
  lastErrorCode: string | null
}

export type NutritionV2QueuedMutation = QueuedRecord | QueuedCorrection

type DeadLetter = NutritionV2QueuedMutation & {
  failedAt: number
  terminalCode: string
}

let flushPromise: Promise<NutritionV2FlushResult> | null = null

function parseQueue(raw: string | null): NutritionV2QueuedMutation[] {
  if (!raw) return []
  try {
    const value = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.filter((item): item is NutritionV2QueuedMutation => {
      if (!item || typeof item !== 'object') return false
      return (
        item.queueVersion === 1 &&
        (item.action === 'record' || item.action === 'correct') &&
        typeof item.userId === 'string' &&
        typeof item.clientId === 'string' &&
        typeof item.idempotencyKey === 'string' &&
        typeof item.queuedAt === 'number' &&
        typeof item.attempts === 'number' &&
        typeof item.nextAttemptAt === 'number'
      )
    })
  } catch {
    return []
  }
}

async function readQueue(): Promise<NutritionV2QueuedMutation[]> {
  return parseQueue(await AsyncStorage.getItem(QUEUE_KEY).catch(() => null))
}

async function writeQueue(queue: NutritionV2QueuedMutation[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_ITEMS)))
}

async function appendDeadLetter(item: DeadLetter): Promise<void> {
  try {
    const existingRaw = await AsyncStorage.getItem(DEAD_LETTER_KEY)
    const existing = existingRaw ? JSON.parse(existingRaw) : []
    const items = Array.isArray(existing) ? existing : []
    items.push(item)
    await AsyncStorage.setItem(
      DEAD_LETTER_KEY,
      JSON.stringify(items.slice(-MAX_DEAD_LETTERS)),
    )
  } catch {
    // The active queue still removes terminal mutations to avoid infinite replay.
  }
}

function backoffMs(attempts: number): number {
  const base = 2_000 * 2 ** Math.max(0, attempts - 1)
  return Math.min(base, 30 * 60 * 1000)
}

function errorCode(error: unknown): string {
  if (error instanceof ApiError) return error.code || `HTTP_${error.status}`
  if (error instanceof Error && error.name === 'AbortError') return 'ABORTED'
  return 'NETWORK_OR_UNKNOWN'
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  return error.status === 408 || error.status === 429 || error.status >= 500
}

export async function enqueueNutritionV2Mutation(input:
  | { action: 'record'; userId: string; payload: NutritionIntakeMutation }
  | { action: 'correct'; userId: string; payload: NutritionIntakeCorrection }
): Promise<{ queued: true; deduplicated: boolean }> {
  const queue = await readQueue()
  const idempotencyKey = input.payload.idempotencyKey
  const existing = queue.some(
    (item) => item.userId === input.userId && item.idempotencyKey === idempotencyKey,
  )
  if (existing) return { queued: true, deduplicated: true }

  const now = Date.now()
  const item: NutritionV2QueuedMutation = {
    queueVersion: 1,
    action: input.action,
    userId: input.userId,
    clientId: input.payload.clientId,
    idempotencyKey,
    payload: input.payload,
    queuedAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastErrorCode: null,
  } as NutritionV2QueuedMutation

  queue.push(item)
  await writeQueue(queue)
  return { queued: true, deduplicated: false }
}

export interface NutritionV2FlushResult {
  sent: number
  pending: number
  terminal: number
  skippedOtherUser: number
  offline: boolean
}

async function performFlush(userId: string): Promise<NutritionV2FlushResult> {
  const network = await NetInfo.fetch().catch(() => null)
  const online = network?.isConnected === true && network.isInternetReachable !== false
  const queue = await readQueue()

  if (!online) {
    return {
      sent: 0,
      pending: queue.filter((item) => item.userId === userId).length,
      terminal: 0,
      skippedOtherUser: queue.filter((item) => item.userId !== userId).length,
      offline: true,
    }
  }

  const now = Date.now()
  const remaining: NutritionV2QueuedMutation[] = []
  let sent = 0
  let terminal = 0
  let skippedOtherUser = 0

  for (const item of queue) {
    if (item.userId !== userId) {
      skippedOtherUser += 1
      remaining.push(item)
      continue
    }
    if (item.nextAttemptAt > now) {
      remaining.push(item)
      continue
    }

    try {
      if (item.action === 'record') {
        await recordNutritionIntakeV2(item.payload)
      } else {
        await correctNutritionIntakeV2(item.payload)
      }
      sent += 1
    } catch (error) {
      const attempts = item.attempts + 1
      const code = errorCode(error)
      if (!isRetryable(error) || attempts >= MAX_ATTEMPTS) {
        terminal += 1
        await appendDeadLetter({
          ...item,
          attempts,
          lastErrorCode: code,
          failedAt: Date.now(),
          terminalCode: code,
        })
        continue
      }
      remaining.push({
        ...item,
        attempts,
        lastErrorCode: code,
        nextAttemptAt: Date.now() + backoffMs(attempts),
      })
    }
  }

  await writeQueue(remaining)
  return {
    sent,
    pending: remaining.filter((item) => item.userId === userId).length,
    terminal,
    skippedOtherUser,
    offline: false,
  }
}

export function flushNutritionV2MutationQueue(userId: string): Promise<NutritionV2FlushResult> {
  if (flushPromise) return flushPromise
  flushPromise = performFlush(userId).finally(() => {
    flushPromise = null
  })
  return flushPromise
}

export async function getNutritionV2QueueStatus(userId: string): Promise<{
  pending: number
  oldestQueuedAt: number | null
}> {
  const items = (await readQueue()).filter((item) => item.userId === userId)
  return {
    pending: items.length,
    oldestQueuedAt: items.length > 0 ? Math.min(...items.map((item) => item.queuedAt)) : null,
  }
}

export async function clearNutritionV2QueueForUser(userId: string): Promise<void> {
  const queue = await readQueue()
  await writeQueue(queue.filter((item) => item.userId !== userId)).catch(() => {})
}

/**
 * Idempotency keys de las mutaciones AÚN encoladas del usuario. Lo usa la capa de
 * porciones (nutrition-v2-portions) para reconciliar su delta optimista: una marca
 * `queued` cuya key ya no está en la cola fue flusheada (el servidor ya la cuenta).
 */
export async function getNutritionV2QueuedKeys(userId: string): Promise<string[]> {
  const queue = await readQueue()
  return queue.filter((item) => item.userId === userId).map((item) => item.idempotencyKey)
}

/**
 * Cancela UNA mutación encolada por su idempotency key (deshacer-en-cola del
 * marcar-porción — SPEC UX-c / hallazgo M1: la entrada local se cancela SIN generar
 * void; el contador `attempt` del ordinal lo incrementa el caller igual).
 *
 * Espera cualquier flush en vuelo antes del read-modify-write para no resucitar ni
 * perder items por una escritura concurrente. Devuelve `false` si la key ya no está
 * (p. ej. un flush la envió): el caller debe asumir que el intake EXISTE server-side.
 */
export async function removeNutritionV2QueuedMutation(
  userId: string,
  idempotencyKey: string,
): Promise<boolean> {
  if (flushPromise) await flushPromise.catch(() => {})
  const queue = await readQueue()
  const next = queue.filter(
    (item) => !(item.userId === userId && item.idempotencyKey === idempotencyKey),
  )
  if (next.length === queue.length) return false
  await writeQueue(next)
  return true
}
