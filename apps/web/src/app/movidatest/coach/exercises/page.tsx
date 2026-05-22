'use client'

import { useState } from 'react'
import { Search, Dumbbell } from 'lucide-react'
import { movidaExercises } from '../../_mock'

const CATEGORIES = ['Todos', 'Fuerza', 'Funcional', 'Rehabilitación', 'Aislamiento', 'Cardio', 'Olímpico']
const MUSCLES = ['Todos', 'Piernas', 'Pecho', 'Espalda', 'Hombros', 'Core', 'Glúteos', 'Full body']

export default function ExercisesPage() {
    const [search, setSearch] = useState('')
    const [category, setCategory] = useState('Todos')
    const [muscle, setMuscle] = useState('Todos')

    const filtered = movidaExercises.filter(ex => {
        const matchSearch = !search || ex.name.toLowerCase().includes(search.toLowerCase())
        const matchCat = category === 'Todos' || ex.category === category
        const matchMuscle = muscle === 'Todos' || ex.muscle_group.includes(muscle)
        return matchSearch && matchCat && matchMuscle
    })

    return (
        <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
            <div>
                <h1 className="text-xl font-bold">Ejercicios</h1>
                <p className="text-sm text-muted-foreground mt-0.5">{movidaExercises.length} ejercicios disponibles</p>
            </div>

            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                    placeholder="Buscar ejercicio..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500/50"
                />
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {CATEGORIES.map(cat => (
                    <button
                        key={cat}
                        onClick={() => setCategory(cat)}
                        className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${category === cat ? 'text-white' : 'border border-border text-muted-foreground hover:bg-accent'}`}
                        style={category === cat ? { backgroundColor: '#0D9488' } : undefined}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
                {MUSCLES.map(m => (
                    <button
                        key={m}
                        onClick={() => setMuscle(m)}
                        className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition-colors ${muscle === m ? 'bg-violet-500/10 text-violet-500' : 'border border-border text-muted-foreground hover:bg-accent'}`}
                    >
                        {m}
                    </button>
                ))}
            </div>

            <p className="text-xs text-muted-foreground">{filtered.length} ejercicios</p>

            <div className="grid sm:grid-cols-2 gap-2">
                {filtered.map(ex => (
                    <div key={ex.id} className="rounded-xl border border-border bg-card p-4 flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center shrink-0">
                            <Dumbbell className="w-4 h-4 text-violet-500" />
                        </div>
                        <div className="min-w-0">
                            <p className="text-sm font-medium">{ex.name}</p>
                            <p className="text-[11px] text-muted-foreground">{ex.muscle_group}</p>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{ex.category}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
