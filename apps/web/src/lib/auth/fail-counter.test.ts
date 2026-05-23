import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSet = vi.fn()
const mockGet = vi.fn()

vi.mock('next/headers', () => ({
    cookies: vi.fn(() =>
        Promise.resolve({
            get: mockGet,
            set: mockSet,
        }),
    ),
}))

// Import after mocking
const { readFailCount, incrementFailCount, clearFailCount, CAPTCHA_THRESHOLD } =
    await import('./fail-counter')

beforeEach(() => {
    mockGet.mockReset()
    mockSet.mockReset()
})

describe('readFailCount', () => {
    it('returns 0 when cookie absent', async () => {
        mockGet.mockReturnValue(undefined)
        expect(await readFailCount('coach')).toBe(0)
    })

    it('parses integer from cookie', async () => {
        mockGet.mockReturnValue({ value: '3' })
        expect(await readFailCount('coach')).toBe(3)
    })

    it('returns 0 for non-numeric cookie', async () => {
        mockGet.mockReturnValue({ value: 'abc' })
        expect(await readFailCount('coach')).toBe(0)
    })

    it('returns 0 for negative value', async () => {
        mockGet.mockReturnValue({ value: '-2' })
        expect(await readFailCount('coach')).toBe(0)
    })

    it('uses org cookie for org feature', async () => {
        mockGet.mockReturnValue({ value: '5' })
        expect(await readFailCount('org')).toBe(5)
        expect(mockGet).toHaveBeenCalledWith('eva_org_auth_fails')
    })
})

describe('incrementFailCount', () => {
    it('returns 1 when starting from 0', async () => {
        mockGet.mockReturnValue(undefined)
        const next = await incrementFailCount('coach')
        expect(next).toBe(1)
        expect(mockSet).toHaveBeenCalledOnce()
        const arg = mockSet.mock.calls[0][0]
        expect(arg.value).toBe('1')
        expect(arg.httpOnly).toBe(true)
        expect(arg.sameSite).toBe('lax')
        expect(arg.path).toBe('/login')
    })

    it('increments existing count', async () => {
        mockGet.mockReturnValue({ value: '4' })
        const next = await incrementFailCount('coach')
        expect(next).toBe(5)
        expect(mockSet.mock.calls[0][0].value).toBe('5')
    })

    it('uses /org/login path for org feature', async () => {
        mockGet.mockReturnValue(undefined)
        await incrementFailCount('org')
        expect(mockSet.mock.calls[0][0].path).toBe('/org/login')
    })
})

describe('clearFailCount', () => {
    it('sets maxAge 0 to expire cookie', async () => {
        await clearFailCount('coach')
        expect(mockSet).toHaveBeenCalledOnce()
        const arg = mockSet.mock.calls[0][0]
        expect(arg.maxAge).toBe(0)
        expect(arg.value).toBe('')
    })
})

describe('CAPTCHA_THRESHOLD', () => {
    it('is 3', () => {
        expect(CAPTCHA_THRESHOLD).toBe(3)
    })
})
