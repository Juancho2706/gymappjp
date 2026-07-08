import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Onboarding walkthrough seen-flag (E1-22 / SPEC Goal 7).
 *
 * The pre-login walkthrough carousel shows ONCE, on the first cold start of a
 * fresh install, before the role selector. This flag persists that fact across
 * launches. Deep-link launches (`/c/<slug>`, `/invite/<code>`) never mount the
 * `/` route (see `app/+native-intent.ts` → they resolve straight to the branded
 * student login), so the walkthrough is naturally bypassed for them — this flag
 * only gates the normal `/` entry.
 */
const WALKTHROUGH_KEY = 'walkthrough_seen'

/** True once the user has completed or skipped the walkthrough. Fail-open. */
export async function hasSeenWalkthrough(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(WALKTHROUGH_KEY)) === '1'
  } catch {
    // Storage unavailable → treat as seen so we never trap the user in the
    // walkthrough on a broken device.
    return true
  }
}

/** Persist that the walkthrough has been seen (idempotent). */
export async function markWalkthroughSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(WALKTHROUGH_KEY, '1')
  } catch {
    // Non-fatal: worst case the walkthrough shows again next launch.
  }
}
