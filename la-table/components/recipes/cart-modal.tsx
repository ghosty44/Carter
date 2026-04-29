'use client'

import { useState } from 'react'
import { ShoppingCart, X, Plus, Minus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Recipe, Ingredient } from '@/lib/types'

interface CartModalProps {
  recipe: Recipe
  compact?: boolean
}

export default function CartModal({ recipe, compact = false }: CartModalProps) {
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(
    new Set(recipe.ingredients?.map((i) => i.id) ?? [])
  )
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    const allIds = recipe.ingredients?.map((i) => i.id) ?? []
    if (selected.size === allIds.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allIds))
    }
  }

  async function addToCart() {
    const ingredients = (recipe.ingredients ?? []).filter((i) => selected.has(i.id))
    if (!ingredients.length) { toast('Sélectionne au moins un ingrédient'); return }

    setLoading(true)
    try {
      const { data: cartData } = await supabase
        .from('cart_sessions')
        .select('id, items')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const existing = cartData?.items ?? []
      const newItems = [
        ...existing,
        ...ingredients.map((ing) => ({
          id: crypto.randomUUID(),
          name: ing.name,
          qty: ing.quantity,
          unit: ing.unit,
          price: ing.price_estimate != null && ing.quantity != null
            ? ing.price_estimate * ing.quantity
            : null,
          checked: false,
          source: 'recipe',
          recipe_name: recipe.name,
        })),
      ]

      if (cartData) {
        await supabase.from('cart_sessions').update({ items: newItems }).eq('id', cartData.id)
      } else {
        await supabase.from('cart_sessions').insert({ items: newItems })
      }

      toast.success(`${ingredients.length} ingrédient(s) ajouté(s) au panier`)
      setOpen(false)
    } catch {
      toast.error('Erreur lors de l\'ajout au panier')
    } finally {
      setLoading(false)
    }
  }

  const buttonClass = compact
    ? 'flex items-center gap-1.5 text-xs bg-terracotta-50 hover:bg-terracotta-100 text-terracotta-600 px-2.5 py-1.5 rounded-lg transition-colors font-medium'
    : 'flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm'

  return (
    <>
      <button onClick={() => setOpen(true)} className={buttonClass}>
        <ShoppingCart className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        {compact ? 'Ajouter' : '🛒 Ajouter au panier'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[85dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-cream-100">
              <div>
                <h2
                  className="font-display font-semibold text-warm-800"
                  style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
                >
                  {recipe.emoji} {recipe.name}
                </h2>
                <p className="text-xs text-warm-400 mt-0.5">
                  Sélectionne les ingrédients à ajouter
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="text-warm-300 hover:text-warm-600 transition-colors p-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Toggle all */}
            <div className="px-5 py-2.5 border-b border-cream-100">
              <button
                onClick={toggleAll}
                className="text-xs text-terracotta-600 font-medium hover:underline"
              >
                {selected.size === (recipe.ingredients?.length ?? 0)
                  ? 'Tout désélectionner'
                  : 'Tout sélectionner'}
              </button>
            </div>

            {/* Ingredients list */}
            <div className="overflow-y-auto flex-1">
              {(recipe.ingredients ?? []).length === 0 ? (
                <p className="text-center text-warm-400 text-sm py-10">
                  Aucun ingrédient renseigné
                </p>
              ) : (
                <ul className="divide-y divide-cream-100">
                  {(recipe.ingredients ?? []).map((ing) => (
                    <li
                      key={ing.id}
                      onClick={() => toggle(ing.id)}
                      className="flex items-center gap-3 px-5 py-3 hover:bg-cream-50 cursor-pointer transition-colors"
                    >
                      <span
                        className={`h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                          selected.has(ing.id)
                            ? 'border-terracotta-500 bg-terracotta-500'
                            : 'border-warm-200'
                        }`}
                      >
                        {selected.has(ing.id) && (
                          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </span>
                      <span className="flex-1 text-sm text-warm-700">{ing.name}</span>
                      {ing.quantity && (
                        <span className="text-xs text-warm-400">
                          {ing.quantity} {ing.unit}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-cream-100">
              <button
                onClick={addToCart}
                disabled={loading || selected.size === 0}
                className="w-full flex items-center justify-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 disabled:bg-warm-200 disabled:text-warm-400 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {loading ? (
                  <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ShoppingCart className="h-4 w-4" />
                )}
                Ajouter {selected.size > 0 ? `(${selected.size})` : ''} au panier
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
