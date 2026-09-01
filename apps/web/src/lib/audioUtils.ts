export type TimerSound = 'digital' | 'bell' | 'classic' | 'boxing';

/**
 * Cierre del `AudioContext` cuando el ÚLTIMO sonido agendado terminó (Sentry EVA-NEXTJS-8).
 *
 * EL BUG: acá se creaba un `AudioContext` por sonido y NUNCA se cerraba. Un solo ciclo de descanso
 * son 3 beeps de cuenta regresiva + la alarma repetida hasta 5 veces ⇒ hasta 8 contextos; en una
 * sesión de 15-20 series, más de 100 vivos. WebKit limita los contextos concurrentes y, al llegar
 * al techo, `new AudioContext()` falla: `InvalidStateError: Failed to start the audio device`. El
 * alumno se queda sin alarma justo cuando más la necesita, en pleno entrenamiento.
 *
 * POR QUÉ NO UN SINGLETON, que era la solución obvia: iOS puede llevar un contexto compartido a
 * `closed` cuando la app pasa a segundo plano, y desde ahí `createOscillator()` lanza una excepción
 * síncrona que el `catch` de abajo se traga en silencio ⇒ el audio quedaría muerto para el resto de
 * la sesión, sin una sola traza. El contexto efímero se mantiene; lo que se agrega es cerrarlo.
 *
 * POR QUÉ POR TIEMPO Y NO POR `onended`: `onended` no dispara si el contexto se suspende antes de
 * que el nodo termine (pestaña al fondo, pantalla bloqueada), y ahí el contexto quedaría abierto
 * para siempre — el bug original. El instante de fin acá se conoce de antemano, así que se agenda.
 *
 * `endsAt` = el `stop()` MÁS TARDÍO de la rama, no el primero: cerrar sobre el primero cortaría los
 * beeps siguientes a mitad de tono. El margen extra deja respirar la cola del sonido.
 */
function closeWhenDone(ctx: AudioContext, endsAt: number) {
  const CLOSE_MARGIN_MS = 250;
  const waitMs = Math.max(0, (endsAt - ctx.currentTime) * 1000) + CLOSE_MARGIN_MS;
  window.setTimeout(() => {
    // `close()` sobre un contexto ya cerrado rechaza: no es un error que le importe a nadie.
    void Promise.resolve(ctx.close()).catch(() => { /* ya estaba cerrado */ });
  }, waitMs);
}

/**
 * `resume()` devuelve una promesa que WebKit RECHAZA cuando no hubo gesto del usuario o el device
 * de audio está ocupado. Sin `catch` eso viaja como `unhandledrejection` al handler global de
 * Sentry — es el camino sospechoso de EVA-NEXTJS-8. No hay nada que hacer al respecto salvo no
 * romper: si no se pudo reanudar, el sonido simplemente no suena.
 */
function resumeSafely(ctx: AudioContext) {
  if (ctx.state !== 'suspended') return;
  void Promise.resolve(ctx.resume()).catch(() => { /* sin gesto del usuario / device ocupado */ });
}

/**
 * Beep suave y corto para la cuenta regresiva 3-2-1 del descanso (M2). Un solo tono sine breve
 * — distinto de la alarma final (playTimerSound), que es más larga/insistente. Misma infra Web
 * Audio (extiende, no duplica). Silencioso y sin errores en navegadores sin AudioContext.
 */
export function playCountdownBeep(volume: number = 1.0) {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    resumeSafely(ctx);

    const t = ctx.currentTime;
    const v = Math.max(0, Math.min(1, volume));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(760, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12 * v || 0.0001, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

    osc.start(t);
    osc.stop(t + 0.16);
    closeWhenDone(ctx, t + 0.16);
  } catch (e) {
    console.error('Countdown beep error:', e);
  }
}

export function playTimerSound(soundType: TimerSound = 'digital', volume: number = 1.0) {
  try {
    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContext) return;

    const ctx = new AudioContext();

    // If context is suspended (due to autoplay policies), try to resume it
    resumeSafely(ctx);

    const t = ctx.currentTime;
    const baseVolume = Math.max(0, Math.min(1, volume)); // Ensure between 0 and 1
    // Instante en que termina el ÚLTIMO nodo de la rama elegida; lo llena cada rama y lo consume
    // `closeWhenDone` al final. Si alguien agrega un `soundType` nuevo y no lo actualiza, el
    // contexto se cierra apenas termina el sonido más corto: actualizalo junto con la rama.
    let endsAt = t;

    if (soundType === 'digital') {
      // 3 short high-pitched beeps
      for (let i = 0; i < 3; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'square';
        osc.frequency.setValueAtTime(1000, t + i * 0.2); // 1000Hz
        gain.gain.setValueAtTime(0.1 * baseVolume, t + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01 * baseVolume, t + i * 0.2 + 0.1);

        osc.start(t + i * 0.2);
        osc.stop(t + i * 0.2 + 0.1);
      }
      endsAt = t + 2 * 0.2 + 0.1; // el 3.er beep
    } else if (soundType === 'bell') {
      // A resonant bell sound
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, t);

      gain.gain.setValueAtTime(0.3 * baseVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001 * baseVolume, t + 1.5);

      osc.start(t);
      osc.stop(t + 1.5);
      endsAt = t + 1.5;
    } else if (soundType === 'classic') {
      // Classic electronic watch alarm
      for (let i = 0; i < 4; i++) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(2000, t + i * 0.15);
        gain.gain.setValueAtTime(0.1 * baseVolume, t + i * 0.15);
        gain.gain.linearRampToValueAtTime(0.01 * baseVolume, t + i * 0.15 + 0.05);

        osc.start(t + i * 0.15);
        osc.stop(t + i * 0.15 + 0.1);
      }
      endsAt = t + 3 * 0.15 + 0.1; // el 4.º pulso
    } else if (soundType === 'boxing') {
      // Boxing bell - loud and metallic
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.type = 'sine';
      osc2.type = 'square';

      osc1.frequency.setValueAtTime(600, t);
      osc2.frequency.setValueAtTime(1200, t);

      gain.gain.setValueAtTime(0.2 * baseVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.01 * baseVolume, t + 1.0);

      osc1.start(t);
      osc2.start(t);
      osc1.stop(t + 1.0);
      osc2.stop(t + 1.0);
      endsAt = t + 1.0;
    }

    closeWhenDone(ctx, endsAt);
  } catch (e) {
    console.error("Audio playback error:", e);
  }
}
