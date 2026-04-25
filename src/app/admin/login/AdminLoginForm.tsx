'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { adminLoginAction } from './actions'

export function AdminLoginForm() {
    const [showPassword, setShowPassword] = useState(false)
    const [state, formAction, pending] = useActionState(adminLoginAction, {})

    return (
        <form action={formAction} className="space-y-4">
            <div>
                <Label htmlFor="email" className="text-neutral-300">Email</Label>
                <Input
                    id="email"
                    name="email"
                    type="email"
                    required
                    className="mt-1 bg-neutral-900 border-neutral-800 text-white"
                    placeholder="admin@eva-app.cl"
                />
            </div>
            <div>
                <Label htmlFor="password" className="text-neutral-300">Contraseña</Label>
                <div className="relative mt-1">
                    <Input
                        id="password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        required
                        className="bg-neutral-900 border-neutral-800 text-white pr-10"
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500"
                    >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
            </div>
            {state.error && <p className="text-sm text-red-400">{state.error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
                {pending ? 'Entrando...' : 'Entrar al Panel CEO'}
            </Button>
        </form>
    )
}
