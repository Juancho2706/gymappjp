'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Flame, Clock, Search, Filter, X } from 'lucide-react'
import Image from 'next/image'
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RecipeModal } from './RecipeModal'

interface RecipeLibraryClientProps {
  recipes: any[]
  coachId: string
}

const CATEGORIES = ["Todas", "Desayuno", "Almuerzo", "Cena", "Snack/Merienda", "Postre"]

export function RecipeLibraryClient({ recipes, coachId }: RecipeLibraryClientProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("Todas")

  const filteredRecipes = recipes.filter(recipe => {
    const matchesSearch = recipe.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = categoryFilter === "Todas" || recipe.category === categoryFilter
    return matchesSearch && matchesCategory
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-4 items-end md:items-center justify-between bg-muted/30 p-4 rounded-lg">
        <div className="flex flex-1 flex-col md:flex-row gap-4 w-full">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          </div>
          <div className="w-full md:w-48">
            <Select value={categoryFilter} onValueChange={(val) => setCategoryFilter(val || 'Todas')}>
              <SelectTrigger>
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <RecipeModal coachId={coachId} />
      </div>

      {filteredRecipes.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredRecipes.map((recipe) => (
            <Card key={recipe.id} className="overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
              <div className="relative h-40 w-full bg-muted">
                {recipe.image_url ? (
                  <Image 
                    src={recipe.image_url} 
                    alt={recipe.name} 
                    fill 
                    className="object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-muted-foreground italic text-sm">
                    Sin imagen
                  </div>
                )}
                {recipe.category && (
                  <Badge className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm text-foreground hover:bg-background/90" variant="secondary">
                    {recipe.category}
                  </Badge>
                )}
                <div className="absolute bottom-2 left-2 flex gap-1">
                    <Badge variant={recipe.source_api === 'edamam' ? "outline" : "default"} className="text-[10px] h-5">
                        {recipe.source_api === 'edamam' ? 'Externa' : 'Manual'}
                    </Badge>
                </div>
              </div>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base line-clamp-2 min-h-[2.5rem]">{recipe.name}</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0 flex flex-col flex-1">
                <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                  <div className="flex items-center gap-1">
                    <Flame className="w-3.5 h-3.5 text-orange-500" />
                    {recipe.calories || '-'} kcal
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-500" />
                    {recipe.prep_time_minutes || '-'} min
                  </div>
                </div>
                <div className="text-xs space-y-1 mb-4 bg-muted/50 p-2 rounded-md">
                  <div className="flex justify-between">
                    <span>Proteínas:</span>
                    <span className="font-medium text-primary">{recipe.protein_g || '-'}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Carbs:</span>
                    <span className="font-medium text-primary">{recipe.carbs_g || '-'}g</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Grasas:</span>
                    <span className="font-medium text-primary">{recipe.fats_g || '-'}g</span>
                  </div>
                </div>
                <div className="mt-auto flex items-center justify-between">
                  <a href={`/coach/recipes/${recipe.id}`} className="text-sm text-primary hover:underline font-medium">
                    Ver detalles →
                  </a>
                  {recipe.source_api !== 'edamam' && (
                    <RecipeModal coachId={coachId} recipe={recipe} />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 border rounded-xl border-dashed">
          <p className="text-muted-foreground">No se encontraron recetas que coincidan con los filtros.</p>
          {(searchTerm || categoryFilter !== "Todas") && (
            <Button 
                variant="link" 
                onClick={() => {setSearchTerm(""); setCategoryFilter("Todas")}}
                className="mt-2"
            >
                Limpiar filtros
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
