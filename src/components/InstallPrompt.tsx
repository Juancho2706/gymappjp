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
      return;
    }

    // Sólo mostrar en móviles
    const mobile = /Mobi|Android|iPhone|iPad|iPod/.test(navigator.userAgent);
    setIsMobile(mobile);
    if (!mobile) return; // no need to continue on desktop

    // Verificar si es iOS
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if (isIOSDevice) {
      // En iOS no hay evento beforeinstallprompt, mostramos la guía si queremos
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed) {
        setIsVisible(true);
      }
    }

    // Escuchar el evento en Android/Chrome
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      
      const hasDismissed = localStorage.getItem('pwa_prompt_dismissed');
      if (!hasDismissed) {
        setIsVisible(true);
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

  // small persistent card that can be tapped to expand
  const card = (
    <div
      onClick={() => setExpanded(true)}
      className="fixed bottom-4 left-4 right-4 z-50 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-800 p-4 transform transition-all animate-in slide-in-from-bottom-5 cursor-pointer"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 flex gap-3 items-center">
          <div className="bg-primary/10 p-2 rounded-xl text-primary">
            <Download size={24} />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900 dark:text-white">Instala la App</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {isIOS 
                ? 'Toca compartir y luego "Añadir a inicio" para instalar.'
                : 'Añádelo a tu pantalla de inicio para una experiencia más fluida.'}
            </p>
          </div>
        </div>
        <button 
          onClick={handleDismiss}
          className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
        >
          <X size={20} />
        </button>
      </div>
      
      {!isIOS && isInstallable && (
        <button
          onClick={handleInstallClick}
          className="mt-3 w-full bg-primary text-primary-foreground hover:bg-primary/90 font-medium py-2 px-4 rounded-xl transition-colors"
        >
          Instalar ahora
        </button>
      )}
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
