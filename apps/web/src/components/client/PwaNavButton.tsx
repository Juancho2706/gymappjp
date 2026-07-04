'use client';

import { useState } from 'react';
import { Download, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt';

interface Props {
  isCollapsed?: boolean;
}

export function PwaNavButton({ isCollapsed }: Props) {
  // Fuente única del deferredPrompt (mismo hook que InstallPrompt; sin segundo listener ni `any`).
  const { isIOS, isInstalled, canPrompt, promptInstall } = useInstallPrompt();
  const [expanded, setExpanded] = useState(false);

  // Ya instalada / corriendo standalone → el acceso manual pierde sentido; lo ocultamos.
  // En el resto de casos "Instalar la app" queda SIEMPRE visible en el perfil (entrada manual),
  // aunque el navegador aún no haya disparado beforeinstallprompt.
  if (isInstalled) return null;

  const handleInstallClick = async () => {
    if (canPrompt) {
      const outcome = await promptInstall();
      if (outcome === 'unavailable') setExpanded(true);
      return;
    }
    // iOS o Android sin prompt nativo aún → instrucciones manuales.
    setExpanded(true);
  };

  return (
    <>
      <button
        onClick={handleInstallClick}
        title={isCollapsed ? 'Instalar la app' : undefined}
        className={cn(
          'flex items-center gap-1 md:gap-3 px-2 py-2 md:py-3 rounded-2xl text-[10px] md:text-sm font-medium transition-all duration-300 group flex-1 md:flex-none',
          isCollapsed ? 'md:justify-center md:px-0' : 'md:justify-start md:px-3'
        )}
        style={{
          backgroundColor: 'color-mix(in srgb, var(--theme-primary) 10%, transparent)',
          color: 'var(--theme-primary)',
        }}
      >
        <Smartphone className="w-6 h-6 md:w-[18px] md:h-[18px] flex-shrink-0 transition-transform duration-300 group-hover:scale-110" />
        <span
          className={cn(
            'truncate transition-colors duration-300 font-bold',
            isCollapsed && 'md:hidden'
          )}
        >
          Instalar la app
        </span>
      </button>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-md bg-card border-border rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Instalá la app</DialogTitle>
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
                ? 'En iOS: toca el botón Compartir en la barra de Safari, elegí "Añadir a inicio", dejá activado "Abrir como app" y toca Añadir. Después la abrís desde tu pantalla de inicio como una app nativa.'
                : 'Abrí el menú de tu navegador y elegí "Instalar app" (o "Añadir a pantalla de inicio") para tenerla en tu inicio, sin navegador y más rápida.'}
            </p>
            {canPrompt && (
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
