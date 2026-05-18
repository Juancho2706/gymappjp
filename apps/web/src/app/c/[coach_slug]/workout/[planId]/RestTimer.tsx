"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, RotateCcw, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playTimerSound } from "@/lib/audioUtils";
import { BRAND_APP_ICON } from "@/lib/brand-assets";
import { readRestTimerSound, readRestTimerVolume } from "./rest-timer-preferences";

interface RestTimerProps {
  initialSeconds: number;
  onClose: () => void;
}

export function RestTimer({
  initialSeconds,
  onClose,
}: RestTimerProps) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds);
  const [isActive, setIsActive] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(initialSeconds.toString());
  const [isAlarmRinging, setIsAlarmRinging] = useState(false);
  const isAlarmRingingRef = useRef(false);
  const alarmIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const alarmCountRef = useRef(0);

  const endTimeRef = useRef<number | null>(null);

  useEffect(() => {
    setTimeLeft(initialSeconds);
    setTotalSeconds(initialSeconds);
    setEditValue(initialSeconds.toString());
    endTimeRef.current = null;
    setIsActive(true);
    setIsEditing(false);
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

    const sound = readRestTimerSound();
    const volume = readRestTimerVolume();

    isAlarmRingingRef.current = true;
    setIsAlarmRinging(true);
    alarmCountRef.current = 1;
    playTimerSound(sound, volume);

    alarmIntervalRef.current = setInterval(() => {
      alarmCountRef.current += 1;
      if (alarmCountRef.current > 5) {
        stopAlarm();
      } else {
        playTimerSound(readRestTimerSound(), readRestTimerVolume());
        if ("vibrate" in navigator) {
          navigator.vibrate([200, 100, 200, 100, 400]);
        }
      }
    }, 3000);

    if (
      "Notification" in window &&
      Notification.permission === "granted" &&
      document.visibilityState !== "visible"
    ) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.showNotification("¡Tiempo de Descanso Terminado!", {
          body: "Prepárate para la siguiente serie. (Toca para detener)",
          icon: BRAND_APP_ICON,
          vibrate: [200, 100, 200, 100, 400],
          tag: "rest-timer",
          requireInteraction: true,
        } as NotificationOptions);
      });
    }

    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    setIsActive(false);
    endTimeRef.current = null;
  }, [stopAlarm]);

  useEffect(() => {
    let wakeLock: { release: () => Promise<void> } | null = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === "visible") {
          wakeLock = await navigator.wakeLock.request("screen");
        }
      } catch (err) {
        console.error("Wake Lock error:", err);
      }
    };

    requestWakeLock();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      wakeLock?.release().catch(console.error);
    };
  }, []);

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
          setTimeLeft(newTimeLeft);

          if (newTimeLeft === 0) {
            triggerAlarm();
          }
        }
      }, 500);
    } else if (timeLeft === 0 && isActive) {
      triggerAlarm();
    } else if (!isActive) {
      endTimeRef.current = null;
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft, triggerAlarm]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = () => {
    stopAlarm();
    setTimeLeft(initialSeconds);
    setTotalSeconds(initialSeconds);
    endTimeRef.current = null;
    if (!isActive) setIsActive(true);
  };

  const saveEdit = () => {
    let val = parseInt(editValue, 10);
    if (isNaN(val) || val < 0) val = 0;
    setTimeLeft(val);
    setTotalSeconds(val);
    endTimeRef.current = isActive ? Date.now() + val * 1000 : null;
    setIsEditing(false);
  };

  const denom = totalSeconds || 1;
  const percentage = (timeLeft / denom) * 100;
  const strokeDashoffset = 176 - (176 * Math.min(100, percentage)) / 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -24, opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed z-50 left-3 right-3 md:left-auto md:right-6 md:w-[300px] top-[calc(env(safe-area-inset-top,0px)+6.25rem)] md:top-4 bg-card/95 backdrop-blur-xl border border-border/60 shadow-lg rounded-2xl px-2.5 py-2 overflow-hidden"
      >
        {timeLeft === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-emerald-500/10 z-0 pointer-events-none"
          />
        )}

        <div className="relative z-10 flex items-center justify-between gap-1.5 min-h-11">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => {
                setIsEditing(!isEditing);
                setEditValue(timeLeft.toString());
                if (!isEditing) setIsActive(false);
              }}
            >
              <Pencil className="w-3.5 h-3.5" />
            </Button>

            {isEditing ? (
              <div className="flex items-center gap-1.5 min-w-0">
                <input
                  type="number"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveEdit()}
                  className="w-14 bg-background border rounded-md px-1.5 py-1 text-xs text-center font-bold"
                  autoFocus
                />
                <span className="text-[10px] text-muted-foreground shrink-0">seg</span>
                <Button size="sm" onClick={saveEdit} className="h-7 px-2 text-xs shrink-0">
                  OK
                </Button>
              </div>
            ) : (
              <>
                <div className="relative w-11 h-11 flex items-center justify-center shrink-0">
                  <svg className="w-11 h-11 transform -rotate-90" viewBox="0 0 44 44">
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="transparent"
                      className="text-muted/30"
                    />
                    <circle
                      cx="22"
                      cy="22"
                      r="18"
                      stroke="var(--theme-primary)"
                      strokeWidth="3"
                      fill="transparent"
                      strokeDasharray="176"
                      strokeDashoffset={strokeDashoffset}
                      className="transition-all duration-500 ease-linear"
                    />
                  </svg>
                  <span className="absolute text-xs font-bold tabular-nums">
                    {formatTime(timeLeft)}
                  </span>
                </div>
                <div className="flex flex-col min-w-0">
                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider truncate">
                    Descanso
                  </p>
                  <p className="text-xs font-bold text-foreground truncate">
                    {timeLeft === 0 ? "¡Tiempo!" : "Recupérate"}
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-0.5 shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={toggleTimer}
              disabled={isEditing}
            >
              {isActive ? (
                <Pause className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={resetTimer}
              disabled={isEditing}
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={onClose}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
