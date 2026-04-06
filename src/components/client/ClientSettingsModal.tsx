'use client'

import { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Settings, Moon, Sun, Palette, Volume2 } from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'
import { useTheme } from 'next-themes'
import { toggleClientBrandColors } from '@/app/c/[coach_slug]/actions'
import { toast } from 'sonner'
import { playTimerSound, TimerSound } from '@/lib/audioUtils'

interface Props {
    coachSlug: string
    initialUseBrandColors: boolean
}

export function ClientSettingsModal({ coachSlug, initialUseBrandColors }: Props) {
    const { theme, setTheme } = useTheme()
    const [useBrandColors, setUseBrandColors] = useState(initialUseBrandColors)
    const [isTogglingColors, setIsTogglingColors] = useState(false)
    const [soundType, setSoundType] = useState<TimerSound>('digital')
    const [volume, setVolume] = useState(1.0)

    // Cargar preferencias de sonido de localStorage
    useEffect(() => {
        const savedSound = localStorage.getItem('restTimerSound') as TimerSound
        const savedVolume = localStorage.getItem('restTimerVolume')
        if (savedSound) setSoundType(savedSound)
        if (savedVolume) setVolume(parseFloat(savedVolume))
    }, [])

    const handleToggleBrandColors = async (newValue: boolean) => {
        setIsTogglingColors(true)
        setUseBrandColors(newValue)
        
        try {
            const res = await toggleClientBrandColors(newValue, coachSlug)
            if (res.error) {
                setUseBrandColors(!newValue) // revertir si hay error
                toast.error('Error al guardar preferencia')
            } else {
                toast.success(newValue ? 'Colores del Coach activados' : 'Colores por defecto activados')
                // Forzar recarga para aplicar cambios de CSS custom properties del server
                window.location.reload()
            }
        } catch (error) {
            setUseBrandColors(!newValue)
            toast.error('Error de red')
        } finally {
            setIsTogglingColors(false)
        }
    }

    const handleSoundChange = (newSound: TimerSound) => {
        setSoundType(newSound)
        localStorage.setItem('restTimerSound', newSound)
        playTimerSound(newSound, volume) // Vista previa
    }

    const handleVolumeChange = (newVolume: number) => {
        setVolume(newVolume)
        localStorage.setItem('restTimerVolume', newVolume.toString())
        // No reproducimos en cada pequeño cambio de slider para no saturar, 
        // pero aquí es un select o botones, así que está bien.
    }

    return (
        <Dialog>
            <DialogTrigger render={<Button variant="ghost" size="icon" className="rounded-xl hover:bg-muted/50 transition-colors" />}>
                <Settings className="w-5 h-5 text-muted-foreground" />
                <span className="sr-only">Configuración</span>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] rounded-3xl border-border/40 bg-background/95 backdrop-blur-xl md:bg-background/80">
                <DialogHeader>
                    <DialogTitle className="text-xl font-bold flex items-center gap-2 text-foreground">
                        <Settings className="w-5 h-5" style={{ color: 'var(--theme-primary, var(--primary))' }} />
                        CONFIGURACIÓN
                    </DialogTitle>
                </DialogHeader>
                
                <div className="grid gap-6 py-4">
                    {/* Tema */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 dark:bg-muted/30 border border-border/50 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background border border-border/50 shadow-sm">
                                {theme === 'dark' ? <Moon className="w-4 h-4" style={{ color: 'var(--theme-primary, var(--primary))' }} /> : <Sun className="w-4 h-4" style={{ color: 'var(--theme-primary, var(--primary))' }} />}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Tema</p>
                                <p className="text-xs text-muted-foreground">Claro u Oscuro</p>
                            </div>
                        </div>
                        <ThemeToggle />
                    </div>

                    {/* Brand Colors */}
                    <div className="flex items-center justify-between p-4 rounded-2xl bg-muted/50 dark:bg-muted/30 border border-border/50 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background border border-border/50 shadow-sm">
                                <Palette className="w-4 h-4" style={{ color: 'var(--theme-primary, var(--primary))' }} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Colores del Coach</p>
                                <p className="text-xs text-muted-foreground">Usa la identidad de tu coach</p>
                            </div>
                        </div>
                        <Switch 
                            checked={useBrandColors} 
                            onCheckedChange={handleToggleBrandColors}
                            disabled={isTogglingColors}
                        />
                    </div>

                    {/* Alarma de descanso */}
                    <div className="space-y-4 p-4 rounded-2xl bg-muted/50 dark:bg-muted/30 border border-border/50 shadow-sm">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-background border border-border/50 shadow-sm">
                                <Volume2 className="w-4 h-4" style={{ color: 'var(--theme-primary, var(--primary))' }} />
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-foreground">Alarma de descanso</p>
                                <p className="text-xs text-muted-foreground">Sonido al terminar el descanso</p>
                            </div>
                        </div>
                        
                        <div className="grid gap-2 pt-2">
                            <Label htmlFor="sound-type" className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground px-1">
                                Tipo de sonido
                            </Label>
                            <Select value={soundType} onValueChange={(v) => handleSoundChange(v as TimerSound)}>
                                <SelectTrigger id="sound-type" className="bg-background border-border/50 rounded-xl text-foreground">
                                    <SelectValue placeholder="Selecciona un sonido" />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-border/50">
                                    <SelectItem value="digital" className="text-foreground">Digital (Beep)</SelectItem>
                                    <SelectItem value="bell" className="text-foreground">Campana</SelectItem>
                                    <SelectItem value="classic" className="text-foreground">Clásico</SelectItem>
                                    <SelectItem value="boxing" className="text-foreground">Boxeo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                <div className="pt-2 text-center">
                    <p className="text-[10px] text-muted-foreground">
                        v1.2.0 • Hecho con ❤️ para tu progreso
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    )
}
