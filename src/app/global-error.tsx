'use client'
 
import { useEffect } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
 
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error('Global unhandled error:', error)
  }, [error])
 
  return (
    <html>
      <body>
        <div className="min-h-dvh flex items-center justify-center bg-background p-4">
            <Card className="max-w-md w-full border-destructive/20 bg-destructive/5">
                <CardHeader className="text-center pb-4">
                    <div className="mx-auto w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mb-4">
                        <AlertCircle className="w-6 h-6 text-destructive" />
                    </div>
                    <CardTitle className="text-xl font-bold">Algo salió mal</CardTitle>
                    <CardDescription className="text-muted-foreground mt-2">
                        Ha ocurrido un error inesperado crítico en la aplicación. 
                        Nuestros ingenieros han sido notificados.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                    {error.message && (
                         <div className="p-3 bg-background border rounded-md text-xs font-mono text-muted-foreground break-words overflow-x-auto">
                             {error.message}
                         </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-center">
                    <Button onClick={() => reset()} className="w-full sm:w-auto gap-2">
                        <RotateCcw className="w-4 h-4" />
                        Intentar nuevamente
                    </Button>
                </CardFooter>
            </Card>
        </div>
      </body>
    </html>
  )
}
