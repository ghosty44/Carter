import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PlusCircle } from 'lucide-react'
import RecipeCard from '@/components/recipes/recipe-card'
import type { Recipe } from '@/lib/types'

export const revalidate = 0

export default async function RecipesPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('recipes')
    .select('*, ingredients(*)')
    .order('name')

  const recipes = (data ?? []) as Recipe[]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1
            className="text-3xl font-display font-bold text-warm-800"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Mes recettes
          </h1>
          <p className="text-warm-400 text-sm mt-1">
            {recipes.length} recette{recipes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link
          href="/recipes/new"
          className="flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm"
        >
          <PlusCircle className="h-4 w-4" />
          Nouvelle recette
        </Link>
      </div>

      {recipes.length === 0 ? (
        <div className="text-center py-20 text-warm-400">
          <div className="text-5xl mb-4">🍳</div>
          <p className="font-display text-xl text-warm-600 mb-2"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Aucune recette pour l'instant
          </p>
          <p className="text-sm mb-6">Ajoute ta première recette pour commencer</p>
          <Link
            href="/recipes/new"
            className="inline-flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white font-medium px-5 py-2.5 rounded-xl transition-colors"
          >
            <PlusCircle className="h-4 w-4" />
            Créer une recette
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  )
}
