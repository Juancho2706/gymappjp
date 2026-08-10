/**
 * nutrition-v2-intake-runner — glue de RED del registro de consumo V2 (cableado del productor de la
 * cola offline). Dado un payload YA construido y validado (nutrition-v2-intake.ts), intenta la
 * escritura online idempotente; si esta offline o el error es transitorio, lo ENCOLA con la MISMA
 * idempotency-key para replay idempotente. Un 4xx determinista se propaga para revertir el optimismo.
 *
 * Importa react-native / ./api, asi que NO debe importarse desde tests puros de Vitest.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import NetInfo from '@react-native-community/netinfo'
import type {
  NutritionIntakeCorrection,
  NutritionIntakeMutation,
  NutritionIntakeVoid,
  SubstitutionIntakeRequest,
} from '@eva/nutrition-v2'
import { ApiError } from './api'
import {
  correctNutritionIntakeV2,
  recordNutritionIntakeV2,
  substituteNutritionIntakeV2,
  voidNutritionIntakeV2,
} from './nutrition-v2.api'
import { enqueueNutritionV2Mutation } from './nutrition-v2-offline'
import { shouldQueueNutritionV2Error } from './nutrition-v2-intake'

export type NutritionIntakeSubmitOutcome =
  | { status: 'recorded'; id: string }
  | { status: 'queued'; reason: 'offline' | 'error' }
  | { status: 'failed'; error: ApiError }

async function isOffline(): Promise<boolean> {
  const network = await NetInfo.fetch().catch(() => null)
  if (!network) return false
  return network.isConnected === false || network.isInternetReachable === false
}

/** Registra un intake: online idempotente, o cola offline con la misma key. */
export async function submitRecordIntake(
  userId: string,
  payload: NutritionIntakeMutation,
): Promise<NutritionIntakeSubmitOutcome> {
  if (await isOffline()) {
    await enqueueNutritionV2Mutation({ action: 'record', userId, payload })
    return { status: 'queued', reason: 'offline' }
  }
  try {
    const result = await recordNutritionIntakeV2(payload)
    return { status: 'recorded', id: result.id }
  } catch (error) {
    if (shouldQueueNutritionV2Error(error)) {
      await enqueueNutritionV2Mutation({ action: 'record', userId, payload })
      return { status: 'queued', reason: 'error' }
    }
    return { status: 'failed', error: error as ApiError }
  }
}

/** Corrige/retira un intake: online idempotente, o cola offline con la misma key. */
export async function submitCorrectIntake(
  userId: string,
  payload: NutritionIntakeCorrection,
): Promise<NutritionIntakeSubmitOutcome> {
  if (await isOffline()) {
    await enqueueNutritionV2Mutation({ action: 'correct', userId, payload })
    return { status: 'queued', reason: 'offline' }
  }
  try {
    const result = await correctNutritionIntakeV2(payload)
    return { status: 'recorded', id: result.id }
  } catch (error) {
    if (shouldQueueNutritionV2Error(error)) {
      await enqueueNutritionV2Mutation({ action: 'correct', userId, payload })
      return { status: 'queued', reason: 'error' }
    }
    return { status: 'failed', error: error as ApiError }
  }
}

/**
 * Retira un intake (NUT-010, opción A): online contra `void_nutrition_intake_v2`, o cola offline
 * con el mismo payload mínimo. El RPC es idempotente por ESTADO, así que un replay tras un flush
 * dudoso jamás duplica ni falla.
 */
export async function submitVoidIntake(
  userId: string,
  payload: NutritionIntakeVoid,
): Promise<NutritionIntakeSubmitOutcome> {
  if (await isOffline()) {
    await enqueueNutritionV2Mutation({ action: 'void', userId, payload })
    return { status: 'queued', reason: 'offline' }
  }
  try {
    const result = await voidNutritionIntakeV2(payload)
    return { status: 'recorded', id: result.id }
  } catch (error) {
    if (shouldQueueNutritionV2Error(error)) {
      await enqueueNutritionV2Mutation({ action: 'void', userId, payload })
      return { status: 'queued', reason: 'error' }
    }
    return { status: 'failed', error: error as ApiError }
  }
}

/**
 * T2.4: sustituir por un reemplazo AUTORIZADO. Mismo contrato de salida que el resto (recorded /
 * queued / failed) para que la pantalla no tenga un camino especial.
 *
 * Offline encola la INTENCION, no un intake armado: la decision registro-vs-correccion la toma el
 * servidor con el dia real, y offline no hay read model con el que decidirla. `mode` viene en el
 * exito online y sirve solo para el copy.
 */
export async function submitSubstituteIntake(
  userId: string,
  payload: SubstitutionIntakeRequest,
  /**
   * T2.5: cómo pintar la fila mientras el gesto espera en la cola. Va SEPARADO del payload a
   * propósito — el payload es la intención y el servidor no acepta macros del cliente; esto es
   * solo para la pantalla y nunca viaja al servidor.
   */
  preview?: import('./nutrition-v2-offline').QueuedSubstitutionPreview,
): Promise<NutritionIntakeSubmitOutcome & { mode?: 'record' | 'correct' }> {
  if (await isOffline()) {
    await enqueueNutritionV2Mutation({ action: 'substitute', userId, payload, preview })
    return { status: 'queued', reason: 'offline' }
  }
  try {
    const result = await substituteNutritionIntakeV2(payload)
    return { status: 'recorded', id: result.id, mode: result.action }
  } catch (error) {
    if (shouldQueueNutritionV2Error(error)) {
      await enqueueNutritionV2Mutation({ action: 'substitute', userId, payload, preview })
      return { status: 'queued', reason: 'error' }
    }
    return { status: 'failed', error: error as ApiError }
  }
}

// ── Identidad estable para idempotency keys ───────────────────────────────────────────────────

const DEVICE_ID_KEY = 'eva_device_id'

/**
 * ID de dispositivo ESTABLE (persistido) — misma clave que push.ts. Entra en cada idempotency key
 * para que dos dispositivos del mismo alumno no colisionen y para que el reintento local sea estable.
 */
export async function getStableDeviceId(): Promise<string> {
  let id = await AsyncStorage.getItem(DEVICE_ID_KEY).catch(() => null)
  if (!id) {
    id = `${Platform.OS}-${Crypto.randomUUID()}`
    await AsyncStorage.setItem(DEVICE_ID_KEY, id).catch(() => {})
  }
  return id
}

/** UUID nuevo para UNA intencion de registro/correccion. Se conserva si el intento se reintenta. */
export function newNutritionV2OperationId(): string {
  return Crypto.randomUUID()
}
