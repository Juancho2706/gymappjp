'use client';

import { useEffect, useState } from 'react';
import { X, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function InstallPrompt() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Verificar si ya está en modo standalone (instalado)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      console.log('App is already installed (standalone mode).');
      return;
    }

    // Sólo mostrar en móviles
    const mobile = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
    setIsMobile(mobile);
    if (!mobile) {
      console.log('InstallPrompt blocked: Not a mobile device.');
      return; 
    }

    // Verificar si es iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // En iOS no hay evento beforeinstallprompt, mostramos la guía si queremos
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed) {
        setIsVisible(true);
      } else {
        console.log('InstallPrompt blocked (iOS): User previously dismissed it.');
      }
    }

    // Escuchar el evento en Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      console.log('beforeinstallprompt event fired!');
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed) {
        setIsVisible(true);
      } else {
        console.log('InstallPrompt blocked (Android): User previously dismissed it.');
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

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

  if (!isVisible) return null;

  // floating action button (FAB) for installation
  const card = (
    <div
      className="fixed bottom-24 right-4 z-50 transform transition-all animate-in slide-in-from-bottom-5 fade-in duration-500"
    >
      <div className="relative">
        <button
          onClick={() => isIOS ? setExpanded(true) : handleInstallClick()}
          className="flex items-center gap-2 px-5 py-3.5 bg-primary text-primary-foreground font-bold text-sm rounded-full shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 transition-all"
        >
          <Download className="w-5 h-5 animate-bounce" />
          Instalar App
        </button>
        <button 
          onClick={handleDismiss}
          className="absolute -top-2 -right-2 p-1 bg-muted text-muted-foreground border border-border rounded-full shadow-sm hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  return (
    <>
      {card}
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Instala la App</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            {isIOS
              ? 'Para instalar en iOS toca el botón de compartir y luego "Añadir a inicio". Después podrás abrir la app desde tu pantalla de inicio.'
              : 'Pulsa "Instalar ahora" abajo para añadir la aplicación a tu pantalla de inicio. Esto ofrece una experiencia sin navegador y más rápida.'}
          </p>
          {!isIOS && isInstallable && (
            <button
              onClick={handleInstallClick}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium py-2 px-4 rounded-xl transition-colors"
            >
              Instalar ahora
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="mt-3 w-full text-center text-sm text-zinc-500 dark:text-zinc-400"
          >
            Cerrar
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
