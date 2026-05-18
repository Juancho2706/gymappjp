/**
 * Server-side performance spans (opt-in).
 * Set PERF_NAV_SERVER=1 in .env.local to log timings to stderr (visible in dev terminal / hosting logs).
 */
const PERF_NAV_SERVER = process.env.PERF_NAV_SERVER === '1'

export async function measureServer<T>(label: string, fn: () => Promise<T>): Promise<T> {
    if (!PERF_NAV_SERVER) {
        return fn()
    }
    const t0 = performance.now()
    try {
        const result = await fn()
        const ms = Math.round(performance.now() - t0)
        console.warn(`[perf:server] ${label} ${ms}ms`)
        return result
    } catch (err) {
        const ms = Math.round(performance.now() - t0)
        console.warn(`[perf:server] ${label} FAILED after ${ms}ms`, err)
        throw err
    }
}

