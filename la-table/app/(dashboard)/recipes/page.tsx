'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import RecipeCard from '@/components/recipes/recipe-card'
import { createClient } from '@/lib/supabase/client'
import type { Recipe } from '@/lib/types'

const FILTERS = [
  { id: 'rapide',  label: '⚡ Rapide'  },
  { id: 'végé',    label: '🥦 Végé'    },
  { id: 'bébé',    label: '👶 Bébé'    },
  { id: 'budget',  label: '💰 Budget'  },
  { id: 'favoris', label: '❤️ Favoris' },
]

export default function RecipesPage() {
  const [recipes, setRecipes]   = useState<Recipe[]>([])
  const [filters, setFilters]   = useState<string[]>([])
  const [cartIds, setCartIds]   = useState<Set<string>>(new Set())
  const [loading, setLoading]   = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const [{ data: r }, { data: cart }] = await Promise.all([
        supabase.from('recipes').select('*, ingredients(*)').order('name'),
        supabase.from('cart_sessions').select('items').eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      setRecipes((r ?? []) as Recipe[])
      const ids = new Set<string>()
      for (const item of (cart?.items ?? [])) {
        if (item.source === 'recipe' && item.recipe_name) {
          const match = (r ?? []).find((rec: Recipe) => rec.name === item.recipe_name)
          if (match) ids.add(match.id)
        }
      }
      setCartIds(ids)
      setLoading(false)
    }
    load()
  }, [])

  function toggleFilter(f: string) {
    setFilters(fs => fs.includes(f) ? fs.filter(x => x !== f) : [...fs, f])
  }

  const filtered = recipes.filter(r => {
    if (!filters.length) return true
    return filters.every(f => {
      if (f === 'rapide')  return (r.prep_time ?? 0) + (r.cook_time ?? 0) <= 25
      if (f === 'végé')    return r.tags?.includes('végé')
      if (f === 'bébé')    return r.tags?.includes('bébé')
      if (f === 'budget')  return (r.ingredients?.reduce((s, i) => s + (i.price_estimate ?? 0) * (i.quantity ?? 1), 0) ?? 0) <= 8
      if (f === 'favoris') return (r.rating ?? 0) >= 4
      return true
    })
  })

  return (
    <>
      <div className="topbar">
        <h2>
          Recettes{' '}
          <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--ink-light)' }}>
            ({filtered.length})
          </span>
        </h2>
        <div className="topbar-actions">
          <Link href="/recipes/new" className="btn btn-primary">
            + <span className="btn-text">Nouvelle</span>
          </Link>
        </div>
      </div>

      <div className="page">
        <div className="filters-row">
          {FILTERS.map(f => (
            <button
              key={f.id}
              className={`filter-chip ${filters.includes(f.id) ? 'active' : ''}`}
              onClick={() => toggleFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-light)' }}>
            Chargement…
          </div>
        ) : (
          <div className="recipes-grid">
            {filtered.map(r => (
              <RecipeCard
                key={r.id}
                recipe={r}
                inCart={cartIds.has(r.id)}
                onCartChange={(id, val) => setCartIds(prev => {
                  const next = new Set(prev)
                  val ? next.add(id) : next.delete(id)
                  return next
                })}
              />
            ))}

            {/* Add card */}
            <div
              className="recipe-card"
              style={{ border: '1.5px dashed var(--creme2)', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 150, cursor: 'pointer' }}
              onClick={() => window.location.href = '/recipes/new'}
            >
              <div style={{ textAlign: 'center', color: 'var(--ink-light)' }}>
                <div style={{ fontSize: 30, marginBottom: 4 }}>+</div>
                <div style={{ fontSize: 12 }}>Ajouter</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
