import AsyncStorage from '@react-native-async-storage/async-storage'
import { apiFetch } from './api'

const CACHE_KEY = 'eva:student-account-status:v1'

export type StudentAccountStatus = {
  access: 'active' | 'blocked'
  reason: 'archived' | 'paused' | null
  isTeam: boolean
  brandName: string
  whatsapp: string | null
  forcePasswordChange: boolean
}

function isStudentAccountStatus(value: unknown): value is StudentAccountStatus {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return (row.access === 'active' || row.access === 'blocked')
    && typeof row.isTeam === 'boolean'
    && typeof row.brandName === 'string'
    && (typeof row.whatsapp === 'string' || row.whatsapp === null)
    && typeof row.forcePasswordChange === 'boolean'
    && (row.reason === 'archived' || row.reason === 'paused' || row.reason === null)
}

export async function getStudentAccountStatus(): Promise<StudentAccountStatus | null> {
  const status = await apiFetch<unknown>('/api/mobile/auth/account-status', { authenticated: true })
  if (!isStudentAccountStatus(status)) return null
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(status)).catch(() => {})
  return status
}

export async function getCachedStudentAccountStatus(): Promise<StudentAccountStatus | null> {
  const raw = await AsyncStorage.getItem(CACHE_KEY).catch(() => null)
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isStudentAccountStatus(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function clearStudentAccountStatus(): Promise<void> {
  await AsyncStorage.removeItem(CACHE_KEY).catch(() => {})
}
