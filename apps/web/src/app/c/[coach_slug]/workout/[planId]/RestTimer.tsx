"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X, Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { playTimerSound, playCountdownBeep } from "@/lib/audioUtils";
import { BRAND_APP_ICON } from "@/lib/brand-assets";
import { triggerHaptic } from "@/lib/client/haptics";
import { cn } from "@/lib/utils";
import { springsSheet } from "@/lib/animation-presets";
import {
  readRestTimerSound,
  readRestTimerVolume,
  readRestTimerMuted,
  writeRestTimerMuted,
} from "./rest-timer-preferences";
import { readExecVibration, readExecKeepAwake } from "./v3/exec-settings";
import { RestInterstitialV3 } from "./v3/RestInterstitialV3";

interface RestTimerProps {
  initialSeconds: number;
  /** "Qué sigue" (nombre del próximo ejercicio/serie) — mostrado en la barra si está a mano. */
  nextLabel?: string;
  /** Descanso de aproximación (warmup) vs efectivo — sólo cambia la etiqueta. */
  warmup?: boolean;
  /**
   * Ejecutor V3 (E3.1): `'v3'` presenta el descanso como interstitial a pantalla completa (misma
   * instancia/estado que la barra — minimizar sólo cambia la presentación, nunca reinicia el conteo).
   * `'compact'` (default) = barra inferior histórica (legacy intacto).
   */
  variant?: "compact" | "v3";
  onClose: () => void;
}

// Anillo grande de cuenta regresiva (reuse del pill, agrandado a barra protagonista).
const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

export function RestTimer({
  initialSeconds,
  nextLabel,
  warmup = false,
  variant = "compact",
  onClose,
}: RestTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const [muted, setMuted] = useState(false);
  // Ejecutor V3 (E3.1): en `variant='v3'` el descanso arranca como interstitial; minimizar cambia sólo
  // la presentación (barra compacta) sin desmontar → el conteo/alarma/WakeLock siguen vivos.
  const [minimized, setMinimized] = useState(false);
  // Ejecutor V3 (QA4): la píldora del descanso existe SÓLO mientras el alumno descansa. Al llegar a 0
  // arrancamos la salida suave (`leaving`) y descartamos el descanso; nunca persiste al siguiente paso.
  const [leaving, setLeaving] = useState(false);
  const reducedMotion = useReducedMotion();

  // Háptico gateado por la pref de vibración (E3.7 · tuerca). Default ON (histórico) si nunca se tocó.
  const haptic = useCallback((pattern: number | number[]) => {
    if (readExecVibration()) triggerHaptic(pattern);
  }, []);

  const isAlarmRingingRef = useRef(false);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const alarmCountRef = useRef(0);
  const endTimeRef = useRef<number | null>(null);
  // Latest-refs: leídos en callbacks (adjust / alarma / beeps) sin re-suscribir efectos.
  const timeLeftRef = useRef(initialSeconds);
  const isActiveRef = useRef(true);
  const mutedRef = useRef(false);
  // Guarda anti-doble-beep: último segundo (3/2/1) ya beepeado.
  const lastBeepRef = useRef<number | null>(null);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  // Preferencia de silencio (persistida). Se sincroniza con el panel de ajustes y otras pestañas.
  useEffect(() => {
    const sync = () => setMuted(readRestTimerMuted());
    sync();
    window.addEventListener("rest-timer-prefs-changed", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("rest-timer-prefs-changed", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Reinicio al re-disparar el descanso (mismo o distinto tipo → remount con nuevos segundos).
  useEffect(() => {
    setTimeLeft(initialSeconds);
    setTotalSeconds(initialSeconds);
    timeLeftRef.current = initialSeconds;
    endTimeRef.current = null;
    lastBeepRef.current = null;
    setIsActive(true);
    // V3: un descanso nuevo reabre el interstitial (por si el anterior quedó minimizado) y cancela
    // cualquier salida en curso (por si el descanso previo estaba auto-descartándose).
    setMinimized(false);
    setLeaving(false);
  }, [initialSeconds]);

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    isAlarmRingingRef.current = false;
    setIsAlarmRinging(false);
    alarmCountRef.current = 0;
  }, []);

  // Limpieza dura del loop de alarma si el componente se desmonta sonando (auto-skip / cierre).
  useEffect(() => {
    return () => {
      if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isAlarmRinging) return;
    const handleInteraction = () => stopAlarm();
    document.addEventListener("click", handleInteraction);
    document.addEventListener("touchstart", handleInteraction);
    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
    };
  }, [isAlarmRinging, stopAlarm]);

  const triggerAlarm = useCallback(() => {
    if (isAlarmRingingRef.current) return;

    isAlarmRingingRef.current = true;
    setIsAlarmRinging(true);
    alarmCountRef.current = 1;
    // Silencio (opt-out): mantiene háptico + visual + notificación en background, sin sonido.
    if (!mutedRef.current) playTimerSound(readRestTimerSound(), readRestTimerVolume());

    alarmIntervalRef.current = setInterval(() => {
      alarmCountRef.current += 1;
      if (alarmCountRef.current > 5) {
        stopAlarm();
      } else {
        if (!mutedRef.current) playTimerSound(readRestTimerSound(), readRestTimerVolume());
        haptic([200, 100, 200, 100, 400]);
      }
    }, 3000);

    // Push en background (M2 · 5): notificación local con marca del coach SÓLO si ya hay permiso.
    // Sin permiso ⇒ silencio (cero prompts nuevos en medio del entreno).
    if (
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification("¡Descanso listo!", {
          body: "Prepárate para la siguiente serie. (Toca para detener)",
          icon: BRAND_APP_ICON,
          vibrate: [200, 100, 200, 100, 400],
          tag: "rest-timer",
          requireInteraction: true,
        } as NotificationOptions);
      });
    }

    haptic([200, 100, 200, 100, 400]);
    setIsActive(false);
    endTimeRef.current = null;
  }, [stopAlarm, haptic]);

  // Wake lock durante el descanso (la sesión ya tiene su propio lock; esto refuerza en background).
  useEffect(() => {
    let wakeLock: { release: () => Promise<void> } | null = null;
    const requestWakeLock = async () => {
      try {
        // Gate por la pref "Mantener pantalla encendida" (E3.7 · tuerca). Default ON (histórico).
        if ("wakeLock" in navigator && document.visibilityState === "visible" && readExecKeepAwake()) {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        console.error("Wake Lock error:", err);
      }
    };
    requestWakeLock();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") requestWakeLock();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wakeLock?.release().catch(console.error);
    };
  }, []);

  // Cuenta regresiva (endTime-based → resiste throttling de background).
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      if (!endTimeRef.current) {
        endTimeRef.current = Date.now() + timeLeft * 1000;
      }
      interval = setInterval(() => {
        if (endTimeRef.current) {
          const newTimeLeft = Math.max(
            0,
            Math.ceil((endTimeRef.current - Date.now()) / 1000)
          );
          timeLeftRef.current = newTimeLeft;
          setTimeLeft(newTimeLeft);
          if (newTimeLeft === 0) triggerAlarm();
        }
      }, 500);
    } else if (timeLeft === 0 && isActive) {
      triggerAlarm();
    } else if (!isActive) {
      endTimeRef.current = null;
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft, triggerAlarm]);

  // Beeps suaves 3-2-1 (M2 · 3): un beep por segundo en los últimos 3s; el 0 lo cubre la alarma.
  useEffect(() => {
    if (!isActive) return;
    if (timeLeft > 0 && timeLeft <= 3 && lastBeepRef.current !== timeLeft) {
      lastBeepRef.current = timeLeft;
      if (!mutedRef.current) {
        playCountdownBeep(readRestTimerVolume());
        haptic(30);
      }
    }
  }, [timeLeft, isActive, haptic]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const toggleTimer = () => setIsActive((a) => !a);

  const resetTimer = () => {
    stopAlarm();
    setTimeLeft(initialSeconds);
    setTotalSeconds(initialSeconds);
    timeLeftRef.current = initialSeconds;
    lastBeepRef.current = null;
    endTimeRef.current = null;
    setIsActive(true);
  };

  // ±15s al vuelo (M2 · 2). Reanuda si veníamos del 0 (alarma); mantiene pausa si estaba pausado.
  const adjust = useCallback(
    (delta: number) => {
      haptic(10);
      const prev = timeLeftRef.current;
      const next = Math.max(0, prev + delta);
      timeLeftRef.current = next;
      setTimeLeft(next);
      setTotalSeconds((t) => (next > t ? next : t));
      if (next <= 3) lastBeepRef.current = null; // permite re-beep si volvemos a la zona 3-2-1

      if (next === 0) {
        endTimeRef.current = null;
      } else if (prev === 0) {
        stopAlarm();
        setIsActive(true);
        endTimeRef.current = Date.now() + next * 1000;
      } else if (isActiveRef.current) {
        endTimeRef.current = Date.now() + next * 1000;
      } else {
        endTimeRef.current = null;
      }
    },
    [stopAlarm, haptic]
  );

  const toggleMute = () => {
    setMuted((m) => {
      const next = !m;
      writeRestTimerMuted(next);
      return next;
    });
  };

  // Media Session API — controles de lock screen / auriculares (pausa/play del descanso).
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    if (isActive) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: "Descanso activo",
        artist: `${formatTime(timeLeft)} restantes`,
        album: "EVA Fitness",
        artwork: [{ src: BRAND_APP_ICON, sizes: "512x512", type: "image/png" }],
      });
      navigator.mediaSession.setActionHandler("pause", () => setIsActive(false));
      navigator.mediaSession.setActionHandler("play", () => setIsActive(true));
    } else {
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("play", null);
    }
    return () => {
      navigator.mediaSession.metadata = null;
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("play", null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const done = timeLeft === 0;
  const frac = Math.max(0, Math.min(1, timeLeft / (totalSeconds || 1)));
  const dashoffset = RING_C * (1 - frac);

  // V3 (E3.1 → QA4): la píldora del descanso existe SÓLO mientras el alumno descansa (la minimiza para
  // mirar otras cosas). Al llegar a 0 mostramos "¡A entrenar!" ~1.5s y AUTO-DESCARTAMOS el descanso
  // (salida suave), sea el interstitial a pantalla completa o la barra minimizada — así JAMÁS queda
  // pegada "DESCANSO 0:00" al pasar al siguiente ejercicio. El motor de tiempo/alarma queda INTACTO
  // (misma instancia); sólo se retira la presentación. "Saltar"/cerrar la ronda → onClose inmediato.
  useEffect(() => {
    if (variant !== "v3" || !done) return;
    const t = setTimeout(() => setLeaving(true), reducedMotion ? 700 : 1500);
    return () => clearTimeout(t);
  }, [variant, done, reducedMotion]);

  // Al arrancar la salida, AnimatePresence retira el nodo (fade/slide); tras la animación descartamos
  // el descanso por completo (onClose → el provider desmonta el RestTimer). Reduced-motion: inmediato.
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => onClose(), reducedMotion ? 0 : 320);
    return () => clearTimeout(t);
  }, [leaving, reducedMotion, onClose]);

  const utilityBtn =
    "flex h-9 w-9 items-center justify-center rounded-full text-on-dark-muted transition-colors hover:text-on-dark hover:bg-white/10";

  // V3: presentación a pantalla completa mientras no esté minimizado (mismo estado/controles).
  if (variant === "v3" && !minimized) {
    return (
      <RestInterstitialV3
        timeLeft={timeLeft}
        total={totalSeconds}
        done={done}
        isActive={isActive}
        nextLabel={nextLabel}
        warmup={warmup}
        formatTime={formatTime}
        onAdjust={adjust}
        onSkip={onClose}
        onMinimize={() => setMinimized(true)}
        leaving={leaving}
      />
    );
  }

  return (
    <AnimatePresence>
      {!leaving && (
      <motion.div
        // Marca para el gate del auto-scroll (BUG 2 · sub-fix 3): el ejecutor mide el borde superior de
        // este sheet inferior para no disparar un scroll cuando la fila destino ya está a la vista.
        data-exec-bottom-sheet=""
        initial={reducedMotion ? false : { y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={reducedMotion ? undefined : { y: 40, opacity: 0 }}
        transition={reducedMotion ? { duration: 0 } : springsSheet.enter}
        // Barra/sheet inferior protagonista: sobre el footer de Finalizar (no lo tapa), capsule en <760, centrada en desktop.
        className={cn(
          "fixed z-50 left-3 right-3 md:left-1/2 md:right-auto md:w-[460px] md:-translate-x-1/2",
          "bottom-[calc(env(safe-area-inset-bottom,0px)+5.5rem)]",
          "overflow-hidden rounded-sheet border bg-[var(--ink-900)]/95 shadow-2xl backdrop-blur-xl",
          done ? "border-[var(--ember-500)]/60" : "border-[var(--border-inverse)]"
        )}
      >
        {/* Pulso ember al llegar a 0 (estático bajo reduced-motion). */}
        {done &&
          (reducedMotion ? (
            <div className="pointer-events-none absolute inset-0 bg-[var(--ember-500)]/15" />
          ) : (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-[var(--ember-500)]/20"
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
            />
          ))}

        <div className="relative z-10 flex items-center gap-3.5 p-3.5">
          {/* Anillo grande + tiempo gigante */}
          <div className="relative h-24 w-24 shrink-0">
            <svg className="h-24 w-24 -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r={RING_R}
                strokeWidth="9"
                fill="none"
                stroke="currentColor"
                className="text-white/10"
              />
              <circle
                cx="60"
                cy="60"
                r={RING_R}
                strokeWidth="9"
                fill="none"
                stroke="var(--ember-500)"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={dashoffset}
                style={{ transition: reducedMotion ? "none" : "stroke-dashoffset 0.5s linear" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="eva-metric text-[1.75rem] leading-none text-on-dark">
                {formatTime(timeLeft)}
              </span>
            </div>
          </div>

          {/* Info + controles */}
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ember-300)]">
                  {warmup ? "Aproximación" : "Descanso"}
                </p>
                <p className="truncate text-[13px] font-semibold text-on-dark">
                  {done
                    ? "¡A entrenar!"
                    : nextLabel
                      ? <>Sigue · <span className="text-on-dark-muted">{nextLabel}</span></>
                      : "Recupérate"}
                </p>
              </div>
              <div className="flex shrink-0 items-center">
                {variant === "v3" && (
                  <button type="button" onClick={() => setMinimized(false)} className={utilityBtn} aria-label="Ampliar el descanso">
                    <Maximize2 className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={toggleTimer} className={utilityBtn} aria-label={isActive ? "Pausar" : "Reanudar"}>
                  {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                <button type="button" onClick={resetTimer} className={utilityBtn} aria-label="Reiniciar descanso">
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button type="button" onClick={onClose} className={utilityBtn} aria-label="Cerrar descanso">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* ±15s (44px) + mute */}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={() => adjust(-15)}
                className="flex h-11 flex-1 items-center justify-center rounded-control border border-[var(--border-inverse)] bg-white/[0.06] text-sm font-bold text-on-dark transition-colors hover:bg-white/[0.12] active:scale-95"
                aria-label="Restar 15 segundos"
              >
                −15s
              </button>
              <button
                type="button"
                onClick={() => adjust(15)}
                className="flex h-11 flex-1 items-center justify-center rounded-control border border-[var(--border-inverse)] bg-white/[0.06] text-sm font-bold text-on-dark transition-colors hover:bg-white/[0.12] active:scale-95"
                aria-label="Sumar 15 segundos"
              >
                +15s
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-pressed={muted}
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-control border transition-colors active:scale-95",
                  muted
                    ? "border-[var(--border-inverse)] bg-white/[0.03] text-on-dark-muted"
                    : "border-[var(--ember-500)]/30 bg-[var(--ember-500)]/[0.12] text-[var(--ember-200)]"
                )}
                aria-label={muted ? "Activar sonido del descanso" : "Silenciar descanso"}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
