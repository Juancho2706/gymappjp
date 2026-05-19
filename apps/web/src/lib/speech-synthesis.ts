const SPEECH_PREF_KEY = 'eva.speech.enabled'
const SPEECH_LANG = 'es-CL'

export function isSpeechSupported(): boolean {
    if (typeof window === 'undefined') return false
    return 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

export function isSpeechEnabled(): boolean {
    if (typeof window === 'undefined') return false
    try {
        return window.localStorage.getItem(SPEECH_PREF_KEY) === 'true'
    } catch {
        return false
    }
}

export function setSpeechEnabled(enabled: boolean): void {
    if (typeof window === 'undefined') return
    try {
        window.localStorage.setItem(SPEECH_PREF_KEY, enabled ? 'true' : 'false')
    } catch {
        // Silent fail
    }
}

export function speak(text: string, opts?: { rate?: number; pitch?: number; volume?: number }): void {
    if (!isSpeechSupported() || !isSpeechEnabled()) return
    if (!text.trim()) return

    try {
        const synth = window.speechSynthesis
        synth.cancel()

        const utter = new SpeechSynthesisUtterance(text)
        utter.lang = SPEECH_LANG
        utter.rate = opts?.rate ?? 1
        utter.pitch = opts?.pitch ?? 1
        utter.volume = opts?.volume ?? 1

        const voices = synth.getVoices()
        const esVoice = voices.find((v) => v.lang.startsWith('es'))
        if (esVoice) utter.voice = esVoice

        synth.speak(utter)
    } catch {
        // Silent fail
    }
}

export function cancelSpeech(): void {
    if (!isSpeechSupported()) return
    try {
        window.speechSynthesis.cancel()
    } catch {
        // Silent fail
    }
}
