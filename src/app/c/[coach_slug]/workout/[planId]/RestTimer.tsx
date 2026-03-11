"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, X, Play, Pause, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RestTimerProps {
  initialSeconds: number;
  onClose: () => void;
}

export function RestTimer({
  initialSeconds,
  onClose,
}: RestTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);

  // WakeLock para mantener la pantalla activa
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch (err) {
        console.error("Wake Lock error:", err);
      }
    };
    requestWakeLock();
    return () => {
      if (wakeLock) {
        wakeLock.release().catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isActive) {
      // Reproducir sonido de alerta
      try {
        const AudioContext =
          window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContext) {
          const ctx = new AudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.type = "sine";
          osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota A5
          gain.gain.setValueAtTime(0.1, ctx.currentTime); // Volumen

          osc.start();
          osc.stop(ctx.currentTime + 0.5); // Medio segundo de duración
        }
      } catch (e) {
        console.error("Audio playback error:", e);
      }

      // Vibración para móviles
      if ("vibrate" in navigator) {
        navigator.vibrate([200, 100, 200, 100, 400]);
      }

      setIsActive(false);
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const toggleTimer = () => setIsActive(!isActive);
  const resetTimer = () => setTimeLeft(initialSeconds);

  // Calculate percentage for progress circle
  const percentage = (timeLeft / initialSeconds) * 100;
  const strokeDashoffset = 283 - (283 * percentage) / 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        className="fixed bottom-[80px] md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-80 bg-card border border-border/50 shadow-2xl rounded-3xl p-5 z-50 overflow-hidden"
      >
        {/* Background glow when finished */}
        {timeLeft === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-emerald-500/10 z-0"
          />
        )}

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Circular Progress Timer */}
            <div className="relative w-14 h-14 flex items-center justify-center">
              <svg className="w-14 h-14 transform -rotate-90">
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-muted/30"
                />
                <circle
                  cx="28"
                  cy="28"
                  r="24"
                  stroke="var(--theme-primary)"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray="283"
                  strokeDashoffset={strokeDashoffset}
                  className="transition-all duration-1000 ease-linear"
                />
              </svg>
              <span className="absolute text-sm font-bold tabular-nums">
                {formatTime(timeLeft)}
              </span>
            </div>

            <div>
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                Descanso
              </p>
              <p className="text-sm font-bold text-foreground">
                {timeLeft === 0 ? "¡Tiempo!" : "Recupérate"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={toggleTimer}
            >
              {isActive ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={resetTimer}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <div className="w-px h-6 bg-border mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
