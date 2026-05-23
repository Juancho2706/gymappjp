// Constant-time response jitter to mitigate timing attacks on auth endpoints.
// Pads error-path latency so it resembles success-path latency.

export function jitter(minMs = 300, maxMs = 500): Promise<void> {
    if (maxMs < minMs) throw new Error('jitter: maxMs must be >= minMs')
    const span = maxMs - minMs
    const delta = span === 0 ? 0 : Math.floor(Math.random() * (span + 1))
    const ms = minMs + delta
    return new Promise((resolve) => setTimeout(resolve, ms))
}
