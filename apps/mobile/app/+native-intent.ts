import { fetchBrandingByCoachIdentifier } from '../lib/branding'

/**
 * Maps incoming web/universal-link paths to in-app routes (native only — runs
 * outside React). The web uses `/c/<slug>` and `/invite/<code>` for the student
 * white-label entry; the RN app has no mirror route, so we resolve the coach
 * branding (cached to AsyncStorage → ThemeContext picks it up) and land the
 * student on the branded login. `/reset-password` already maps to its route.
 */
export async function redirectSystemPath({ path }: { path: string; initial: boolean }): Promise<string> {
  try {
    const noProto = path
      .replace(/^https?:\/\/[^/]+/i, '')
      .replace(/^eva:\/\//i, '/')
    const clean = noProto.split('?')[0].split('#')[0]
    const segs = clean.split('/').filter(Boolean)

    // /c/<slug>[/login] → coach-branded student login
    if (segs[0] === 'c' && segs[1]) {
      await fetchBrandingByCoachIdentifier(segs[1]).catch(() => null)
      return '/(auth)/login?role=alumno'
    }
    // /invite/<code> → resolve by invite code, then student login
    if (segs[0] === 'invite' && segs[1]) {
      await fetchBrandingByCoachIdentifier(segs[1]).catch(() => null)
      return '/(auth)/login?role=alumno'
    }

    return path
  } catch {
    return path
  }
}
