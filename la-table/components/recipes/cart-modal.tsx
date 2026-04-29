'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Recipe } from '@/lib/types'

interface CartModalProps {
  recipe: Recipe
  inCart?: boolean
  onCartChange?: (id: string, inCart: boolean) => void
}

export default function CartModal({ recipe, inCart = false, onCartChange }: CartModalProps) {
  const [open, setOpen]       = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const ingredients = recipe.ingredients ?? []

  function toggle(name: string) {
    setExcluded(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  async function confirmAdd() {
    const toAdd = ingredients.filter(i => !excluded.has(i.name))
    if (!toAdd.length) { toast('Sélectionne au moins un ingrédient'); return }
    setLoading(true)
    try {
      const { data: cartData } = await supabase
        .from('cart_sessions').select('id, items').eq('status', 'active')
        .order('created_at', { ascending: false }).limit(1).maybeSingle()

      const newItems = [
        ...(cartData?.items ?? []),
        ...toAdd.map(i => ({
          id: crypto.randomUUID(),
          name: i.name,
          qty: i.quantity,
          unit: i.unit,
          price: i.price_estimate != null && i.quantity != null ? i.price_estimate * i.quantity : null,
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
      toast.success(`🛒 ${toAdd.length} ingrédient(s) ajouté(s) au drive !`)
      onCartChange?.(recipe.id, true)
      setOpen(false)
    } finally {
      setLoading(false)
    }
  }

  const selectedCount = ingredients.length - excluded.size
  const selectedTotal = ingredients
    .filter(i => !excluded.has(i.name))
    .reduce((s, i) => s + (i.price_estimate ?? 0) * (i.quantity ?? 1), 0)

  return (
    <>
      {/* Floating button */}
      <button
        className={`cart-btn ${inCart ? 'in-cart' : ''}`}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        title="Ajouter au drive"
        style={{ color: inCart ? 'white' : 'var(--ink)' }}
      >
        {inCart ? '✓' : '🛒'}
      </button>

      {/* Modal */}
      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <div style={{ fontSize: 36 }}>{recipe.emoji}</div>
              <div>
                <h2 style={{ fontSize: 18 }}>{recipe.name}</h2>
                <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>Sélectionnez les ingrédients à ajouter</div>
              </div>
            </div>

            <div style={{ margin: '14px 0 6px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--creme2)', borderRadius: 20, padding: '3px 10px', fontSize: 12, color: 'var(--ink-light)' }}>
                🛒 {selectedCount} / {ingredients.length} ingrédients sélectionnés
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-light)', marginBottom: 10 }}>
              💡 Décochez ce que vous avez déjà chez vous
            </div>

            {ingredients.length === 0 && (
              <p style={{ color: 'var(--ink-light)', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                Aucun ingrédient renseigné pour cette recette.
              </p>
            )}

            {ingredients.map((ing, i) => {
              const selected = !excluded.has(ing.name)
              return (
                <div
                  key={i}
                  className={`ing-check-row ${selected ? 'selected' : 'deselected'}`}
                  onClick={() => toggle(ing.name)}
                >
                  <div className={`ing-checkbox ${selected ? 'on' : ''}`}>{selected ? '✓' : ''}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{ing.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-light)' }}>{ing.quantity} {ing.unit}</div>
                  </div>
                  {ing.price_estimate != null && (
                    <div style={{ fontSize: 13, color: selected ? 'var(--terra)' : 'var(--ink-light)', fontWeight: 600 }}>
                      {((ing.price_estimate) * (ing.quantity ?? 1)).toFixed(2)}€
                    </div>
                  )}
                </div>
              )
            })}

            <div className="cart-total">
              <div style={{ fontSize: 13, color: 'var(--ink-light)' }}>
                {excluded.size > 0 && <span style={{ color: 'var(--sage)' }}>✓ {excluded.size} déjà chez vous</span>}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                Total : <span style={{ color: 'var(--terra)' }}>{selectedTotal.toFixed(2)}€</span>
              </div>
            </div>

            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-ghost" onClick={() => setOpen(false)}>Annuler</button>
              <button
                className="btn"
                style={{ background: '#E31E24', color: 'white' }}
                disabled={loading || selectedCount === 0}
                onClick={confirmAdd}
              >
                {loading
                  ? <span style={{ display: 'inline-block', width: 14, height: 14, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
                  : '🛒 Ajouter au drive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
