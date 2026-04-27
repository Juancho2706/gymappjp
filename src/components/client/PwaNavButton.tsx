'use client';

import { useEffect, useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface Props {
  isCollapsed?: boolean;
}

export function PwaNavButton({ isCollapsed }: Props) {
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone) {
      setIsInstalled(true);
      return;
    }

    // Check if iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);
    
    // In iOS we can always show the instructions, so it's "installable" in a manual way
    if (isIOSDevice) {
      setIsInstallable(true);
    }

    // Listen for Android/Chrome install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (isIOS) {
      setExpanded(true);
      return;
    }

    if (!deferredPrompt) {
      setExpanded(true); // Fallback to instructions if no prompt
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
      setIsInstallable(false);
      setIsInstalled(true);
    }
  };

  if (isInstalled || !isInstallable) return null;

  return (
    <>
      <button
        onClick={handleInstallClick}
        title={isCollapsed ? "Instalar App" : undefined}
        className={cn(
          "flex items-center gap-1 md:gap-3 px-2 py-2 md:py-3 rounded-2xl text-[10px] md:text-sm font-medium transition-all duration-300 group flex-1 md:flex-none",
          isCollapsed ? "md:justify-center md:px-0" : "md:justify-start md:px-3"
        )}
        style={{ 
          backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
          color: 'var(--theme-primary)'
        }}
      >
        <Smartphone className="w-6 h-6 md:w-[18px] md:h-[18px] flex-shrink-0 transition-transform duration-300 group-hover:scale-110" />
        <span className={cn(
          "truncate transition-colors duration-300 font-bold",
          isCollapsed && "md:hidden"
        )}>
          Instalar App
        </span>
      </button>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-md bg-card border-border rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Instala la App</DialogTitle>
          </DialogHeader>
          <div className="py-4 flex flex-col items-center text-center">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{ backgroundColor: 'color-mix(in srgb, var(--theme-primary) 15%, transparent)' }}
            >
              <Download className="w-8 h-8" style={{ color: 'var(--theme-primary)' }} />
            </div>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              {isIOS
                ? 'Para instalar en iOS toca el botón de compartir ⍗ en la barra inferior de Safari y luego "Añadir a inicio". Después podrás abrir la app desde tu pantalla de inicio como una aplicación nativa.'
                : 'Pulsa "Instalar ahora" abajo para añadir la aplicación a tu pantalla de inicio. Esto ofrece una experiencia sin navegador y más rápida.'}
            </p>
            {!isIOS && deferredPrompt && (
              <button
                onClick={handleInstallClick}
                className="w-full text-white hover:opacity-90 font-bold py-3 px-4 rounded-xl transition-all shadow-lg shadow-primary/20"
                style={{ backgroundColor: 'var(--theme-primary)' }}
              >
                Instalar ahora
              </button>
            )}
            <button
              onClick={() => setExpanded(false)}
              className="mt-3 w-full font-semibold py-3 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
