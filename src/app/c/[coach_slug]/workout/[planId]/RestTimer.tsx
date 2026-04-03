"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Timer, X, Play, Pause, RotateCcw, Settings, Pencil, TriangleAlert, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { playTimerSound, TimerSound } from "@/lib/audioUtils";

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
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(initialSeconds.toString());
  const [soundType, setSoundType] = useState<TimerSound>("digital");
  const [showSettings, setShowSettings] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState<boolean | null>(true);
  
  // Timer state for SW sync
  const endTimeRef = useRef<number | null>(null);

  // Load saved sound preference
  useEffect(() => {
    const saved = localStorage.getItem("restTimerSound");
    if (saved) {
      setSoundType(saved as TimerSound);
    }
    
    // Check notification permissions for background alerts
    if ("Notification" in window) {
      setNotificationsGranted(Notification.permission === "granted");
    } else {
      setNotificationsGranted(null); // not supported
    }
  }, []);

  const handleSoundChange = (type: TimerSound) => {
    setSoundType(type);
    localStorage.setItem("restTimerSound", type);
    playTimerSound(type); // Preview
  };

  const requestNotificationPermission = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      setNotificationsGranted(permission === "granted");
      if (permission === "granted") {
         // Create a test notification to ensure it works
         new Notification("¡Notificaciones activadas!", {
             body: "El cronómetro te avisará cuando termine.",
             icon: "/icon-192x192.png"
         });
      }
    }
  };

  // WakeLock para mantener la pantalla activa
  useEffect(() => {
    let wakeLock: any = null;
    const requestWakeLock = async () => {
      try {
        if ("wakeLock" in navigator && document.visibilityState === 'visible') {
          wakeLock = await (navigator as any).wakeLock.request("screen");
        }
      } catch (err) {
        console.error("Wake Lock error:", err);
      }
    };
    
    requestWakeLock();
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (wakeLock) {
        wakeLock.release().catch(console.error);
      }
    };
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;

    if (isActive && timeLeft > 0) {
      // Calculate real end time to prevent background throttling issues
      if (!endTimeRef.current) {
         endTimeRef.current = Date.now() + (timeLeft * 1000);
      }
      
      interval = setInterval(() => {
        if (endTimeRef.current) {
          const newTimeLeft = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000));
          setTimeLeft(newTimeLeft);
          
          if (newTimeLeft === 0) {
            triggerAlarm();
          }
        }
      }, 500); // Check more frequently than 1s to be precise
    } else if (timeLeft === 0 && isActive) {
      triggerAlarm();
    } else if (!isActive) {
      endTimeRef.current = null;
    }

    return () => {
        clearInterval(interval);
    };
  }, [isActive, timeLeft, soundType]);

  const triggerAlarm = () => {
    playTimerSound(soundType);

    // Notificación en background si es posible
    if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        navigator.serviceWorker.ready.then(registration => {
            registration.showNotification("¡Tiempo de Descanso Terminado!", {
                body: "Prepárate para la siguiente serie.",
                icon: "/icon-192x192.png",
                vibrate: [200, 100, 200, 100, 400],
                tag: "rest-timer"
            } as any);
        });
    }

    // Vibración para móviles
    if ("vibrate" in navigator) {
      navigator.vibrate([200, 100, 200, 100, 400]);
    }

    setIsActive(false);
    endTimeRef.current = null;
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const toggleTimer = () => setIsActive(!isActive);
  
  const resetTimer = () => {
      setTimeLeft(initialSeconds);
      endTimeRef.current = null;
      if (!isActive) setIsActive(true);
  };
  
  const saveEdit = () => {
      let val = parseInt(editValue);
      if (isNaN(val) || val < 0) val = 0;
      setTimeLeft(val);
      endTimeRef.current = isActive ? Date.now() + (val * 1000) : null;
      setIsEditing(false);
  };

  // Calculate percentage for progress circle
  const percentage = (timeLeft / (initialSeconds || 1)) * 100;
  const strokeDashoffset = 283 - (283 * Math.min(100, percentage)) / 100;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed top-[80px] md:top-6 left-4 right-4 md:left-auto md:right-6 md:w-[350px] bg-card border border-border/50 shadow-2xl rounded-3xl p-5 z-50 overflow-hidden"
      >
        {/* Background glow when finished */}
        {timeLeft === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 bg-emerald-500/10 z-0"
          />
        )}

        <div className="relative z-10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                
                {/* Edit Button */}
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
                    <Pencil className="w-4 h-4" />
                </Button>

                {/* Circular Progress Timer OR Input */}
                {isEditing ? (
                    <div className="flex items-center gap-2">
                        <input 
                            type="number"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                            className="w-16 bg-background border rounded-md px-2 py-1 text-sm text-center font-bold"
                            autoFocus
                        />
                        <span className="text-xs text-muted-foreground">seg</span>
                        <Button size="sm" onClick={saveEdit} className="h-7 px-2">OK</Button>
                    </div>
                ) : (
                    <div className="relative w-14 h-14 flex items-center justify-center shrink-0">
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
                        className="transition-all duration-500 ease-linear"
                        />
                    </svg>
                    <span className="absolute text-sm font-bold tabular-nums">
                        {formatTime(timeLeft)}
                    </span>
                    </div>
                )}

                {!isEditing && (
                    <div className="flex flex-col">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1">
                            Descanso
                            {notificationsGranted === false && (
                                <span title="Activa notificaciones para alertas en segundo plano">
                                    <TriangleAlert 
                                        className="w-3 h-3 text-warning cursor-pointer text-amber-500" 
                                        onClick={requestNotificationPermission}
                                    />
                                </span>
                            )}
                        </p>
                        <p className="text-sm font-bold text-foreground">
                            {timeLeft === 0 ? "¡Tiempo!" : "Recupérate"}
                        </p>
                    </div>
                )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={toggleTimer}
                  disabled={isEditing}
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
                  disabled={isEditing}
                >
                  <RotateCcw className="w-4 h-4" />
                </Button>
                
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 rounded-full transition-colors ${showSettings ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                  onClick={() => setShowSettings(!showSettings)}
                >
                  <Settings className="w-4 h-4" />
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

            {/* Settings Panel */}
            <AnimatePresence>
                {showSettings && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t pt-3 mt-1 flex flex-col gap-2"
                    >
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium text-muted-foreground">Sonido de Alerta</label>
                            <select 
                                value={soundType} 
                                onChange={(e) => handleSoundChange(e.target.value as TimerSound)}
                                className="bg-background border rounded px-2 py-1 text-xs"
                            >
                                <option value="digital">Digital</option>
                                <option value="bell">Campana</option>
                                <option value="classic">Clásico</option>
                                <option value="boxing">Boxeo</option>
                            </select>
                        </div>
                        
                        {notificationsGranted === false && (
                            <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2 flex items-start gap-2 text-xs text-amber-600 dark:text-amber-400">
                                <BellRing className="w-4 h-4 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold mb-1">Alertas en segundo plano</p>
                                    <p className="mb-2">Activa las notificaciones para que el cronómetro suene incluso si sales de la app o bloqueas la pantalla.</p>
                                    <Button size="sm" variant="outline" className="h-6 text-xs bg-amber-500/10 border-amber-500/50 hover:bg-amber-500/20" onClick={requestNotificationPermission}>
                                        Activar Permisos
                                    </Button>
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
