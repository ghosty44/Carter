'use client'

import { useState } from 'react'
import { Plus, X, ChevronDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import CartModal from '@/components/recipes/cart-modal'
import type { WeeklyPlanning, Recipe } from '@/lib/types'

interface MealSlotProps {
  label: string
  dayIdx: number
  mealType: 'lunch' | 'dinner'
  weekStart: string
  slot?: WeeklyPlanning
  recipes: Recipe[]
  onUpdate: (slot: WeeklyPlanning | null) => void
}

export default function MealSlot({ label, dayIdx, mealType, weekStart, slot, recipes, onUpdate }: MealSlotProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const filtered = recipes.filter((r) =>
    r.name.toLowerCase().includes(search.toLowerCase())
  )

  const recipeForCart = slot?.recipe_id
    ? recipes.find((r) => r.id === slot.recipe_id)
    : undefined

  async function selectRecipe(recipe: Recipe) {
    setLoading(true)
    const payload = {
      week_start: weekStart,
      day_of_week: dayIdx,
      meal_type: mealType,
      recipe_id: recipe.id,
      custom_meal: null,
    }

    const { data, error } = await supabase
      .from('weekly_planning')
      .upsert(payload, { onConflict: 'user_id,week_start,day_of_week,meal_type' })
      .select('*, recipe:recipes(id, name, emoji, prep_time, cook_time, tags, rating, ingredients(*))')
      .single()

    if (error) { toast.error('Erreur'); setLoading(false); return }

    onUpdate({ ...data, week_start: weekStart } as WeeklyPlanning)
    setOpen(false)
    setSearch('')
    setLoading(false)
  }

  async function clearSlot() {
    if (!slot) return
    setLoading(true)
    await supabase.from('weekly_planning').delete().eq('id', slot.id)
    onUpdate(null)
    setLoading(false)
  }

  const recipe = slot?.recipe as Recipe | undefined

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xs text-warm-400 w-16 flex-shrink-0">{label}</span>

        {recipe ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-lg">{recipe.emoji}</span>
            <span className="text-sm text-warm-700 font-medium truncate flex-1">{recipe.name}</span>
            <div className="flex items-center gap-1 flex-shrink-0">
              {/* Cart button */}
              {recipeForCart && (
                <CartModal recipe={recipeForCart} compact />
              )}
              {/* Clear */}
              <button
                onClick={clearSlot}
                disabled={loading}
                className="text-warm-300 hover:text-red-400 transition-colors p-1"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : slot?.custom_meal ? (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="text-sm text-warm-700 truncate flex-1 italic">{slot.custom_meal}</span>
            <button
              onClick={clearSlot}
              disabled={loading}
              className="text-warm-300 hover:text-red-400 transition-colors p-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-warm-400 hover:text-terracotta-500 transition-colors group"
          >
            <Plus className="h-3.5 w-3.5 group-hover:text-terracotta-500" />
            Ajouter
            <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      {/* Recipe picker */}
      {open && (
        <div className="mt-2 ml-20 bg-white border border-cream-200 rounded-xl shadow-lg overflow-hidden z-10">
          <div className="p-2 border-b border-cream-100">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher une recette…"
              autoFocus
              className="w-full px-3 py-1.5 text-sm bg-cream-50 rounded-lg border border-cream-200 focus:outline-none focus:border-terracotta-400"
            />
          </div>
          <ul className="max-h-48 overflow-y-auto">
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-xs text-warm-400 text-center">Aucune recette trouvée</li>
            )}
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => selectRecipe(r)}
                  disabled={loading}
                  className="flex items-center gap-2.5 w-full px-4 py-2 text-sm text-warm-700 hover:bg-cream-50 transition-colors text-left"
                >
                  <span>{r.emoji}</span>
                  <span className="truncate">{r.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="p-2 border-t border-cream-100">
            <button
              onClick={() => setOpen(false)}
              className="w-full text-xs text-warm-400 hover:text-warm-600 transition-colors py-1"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
