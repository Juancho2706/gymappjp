'use client'
 
import { useEffect } from 'react'
import { AlertTriangle, Home, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
 
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Page error:', error)
  }, [error])
 
  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full shadow-lg border-border">
            <CardHeader className="text-center pb-4">
                <div className="mx-auto w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 border border-amber-500/20">
                    <AlertTriangle className="w-8 h-8 text-amber-500" />
                </div>
                <CardTitle className="text-2xl font-bold">Oops! Algo falló</CardTitle>
                <CardDescription className="text-muted-foreground mt-2 text-base">
                    No pudimos cargar esta página. Puede ser un error temporal de conexión o un problema en nuestros servidores.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {error.digest && (
                     <div className="p-3 bg-secondary/50 rounded-lg text-xs font-mono text-muted-foreground break-words border border-border">
                         <span className="font-semibold text-foreground/70">Error ID:</span> {error.digest}
                     </div>
                )}
            </CardContent>
            <CardFooter className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={() => reset()} className="w-full sm:w-auto gap-2" variant="default">
                    <RotateCcw className="w-4 h-4" />
                    Reintentar
                </Button>
                <Button variant="outline" className="w-full sm:w-auto gap-2" onClick={() => window.location.href = "/"}>
                    <Home className="w-4 h-4" />
                    Ir al Inicio
                </Button>
            </CardFooter>
        </Card>
    </div>
  )
}