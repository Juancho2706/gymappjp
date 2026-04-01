'use client';

import { useEffect, useState } from 'react';
import { X, Download, Share, PlusSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';

interface InstallPromptProps {
  brandName?: string;
}

export default function InstallPrompt({ brandName = 'App' }: InstallPromptProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const pathname = usePathname();

  useEffect(() => {
    // 1. Detect if already in standalone mode
    const checkStandalone = 
      window.matchMedia('(display-mode: standalone)').matches || 
      (window.navigator as any).standalone === true;
    
    setIsStandalone(checkStandalone);

    // 2. Detect OS
    const ua = window.navigator.userAgent;
    const isIosDevice = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    setIsIOS(isIosDevice);

    // 3. Android beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      checkAndShow();
    };

    const checkAndShow = () => {
      const isDismissed = localStorage.getItem('pwa_prompt_dismissed') === 'true';

      if (isDismissed) {
        return;
      }

      // Show after a delay to be non-intrusive and after page load
      const timer = setTimeout(() => {
        // Double check standalone state to avoid flicker
        const stillNotStandalone = !(window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true);
        if (stillNotStandalone) {
          setIsVisible(true);
        }
      }, 2000); // 2 seconds delay (reduced from 10s for login visibility)

      return () => clearTimeout(timer);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // For iOS, we check manually since there's no event
    if (isIosDevice) {
      checkAndShow();
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [pathname]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setIsVisible(false);
      setDeferredPrompt(null);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('pwa_prompt_dismissed', 'true');
  };

  if (isStandalone || !isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <div className="fixed inset-x-0 bottom-0 z-[100] p-4 pointer-events-none flex flex-col items-center">
          {isIOS ? (
            /* iOS Tooltip / Overlay - Mimics Safari's Tooltip */
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.9 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: 1,
                transition: { type: "spring", damping: 25, stiffness: 300 }
              }}
              exit={{ opacity: 0, y: 40, scale: 0.9 }}
              className="relative w-full max-w-[340px] bg-card/95 backdrop-blur-xl border border-border rounded-[2.5rem] shadow-[0_20px_50px_rgba(0,0,0,0.3)] p-6 pointer-events-auto mb-20"
            >
              <button 
                onClick={handleDismiss}
                className="absolute top-5 right-5 p-1.5 hover:bg-muted rounded-full transition-colors"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>

              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-theme-subtle rounded-2xl flex items-center justify-center shrink-0">
                  <Download className="w-7 h-7 text-theme" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-lg text-foreground leading-tight truncate">Instalar {brandName}</h3>
                  <p className="text-xs text-muted-foreground">Úsala como una aplicación nativa</p>
                </div>
              </div>

              <div className="space-y-4 px-1">
                <div className="flex items-start gap-4 text-sm">
                  <div className="w-8 h-8 flex items-center justify-center bg-muted rounded-xl shrink-0">
                    <Share className="w-5 h-5 text-foreground" />
                  </div>
                  <p className="pt-1.5 text-foreground/80 leading-snug">1. Toca el botón <strong>Compartir</strong> en la barra inferior de Safari.</p>
                </div>
                <div className="flex items-start gap-4 text-sm">
                  <div className="w-8 h-8 flex items-center justify-center bg-muted rounded-xl shrink-0">
                    <PlusSquare className="w-5 h-5 text-foreground" />
                  </div>
                  <p className="pt-1.5 text-foreground/80 leading-snug">2. Desliza hacia abajo y selecciona <strong>"Añadir a inicio"</strong>.</p>
                </div>
              </div>

              {/* Arrow pointing down to Safari's Share button */}
              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-card border-r border-b border-border rotate-45" />
              
              <motion.div 
                animate={{ y: [0, 5, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="absolute -bottom-10 left-1/2 -translate-x-1/2"
              >
                <div className="w-1 bg-white/30 h-6 rounded-full mx-auto" />
              </motion.div>
            </motion.div>
          ) : (
            /* Android Modern Banner */
            <motion.div
              initial={{ opacity: 0, y: 100 }}
              animate={{ 
                opacity: 1, 
                y: 0,
                transition: { type: "spring", damping: 20, stiffness: 200 }
              }}
              exit={{ opacity: 0, y: 100 }}
              className="w-full max-w-md bg-card/95 backdrop-blur-md border border-border rounded-3xl shadow-2xl p-5 pointer-events-auto flex items-center gap-5"
            >
              <div className="w-14 h-14 bg-theme-subtle rounded-2xl flex items-center justify-center shrink-0">
                <Download className="w-7 h-7 text-theme" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base text-foreground truncate italic">¿Instalar {brandName}?</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">Disfruta de una experiencia más fluida y rápida.</p>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                <button
                  onClick={handleInstallClick}
                  className="px-6 py-2.5 bg-theme text-white text-sm font-bold rounded-xl shadow-lg shadow-primary/20 hover:opacity-90 transition-all active:scale-95 btn-theme"
                >
                  Instalar
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-6 py-1.5 text-[10px] font-medium text-muted-foreground/60 hover:text-foreground transition-colors uppercase tracking-wider"
                >
                  No volver a mostrar
                </button>
              </div>
            </motion.div>
          )}
        </div>
      )}
    </AnimatePresence>
  );
}
