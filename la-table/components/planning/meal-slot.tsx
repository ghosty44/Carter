'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
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
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const recipe   = slot?.recipe as Recipe | undefined
  const filtered = recipes.filter(r => r.name.toLowerCase().includes(search.toLowerCase()))

  async function selectRecipe(r: Recipe) {
    setLoading(true)
    const { data, error } = await supabase
      .from('weekly_planning')
      .upsert(
        { week_start: weekStart, day_of_week: dayIdx, meal_type: mealType, recipe_id: r.id, custom_meal: null },
        { onConflict: 'user_id,week_start,day_of_week,meal_type' }
      )
      .select('*, recipe:recipes(id, name, emoji, prep_time, cook_time, tags, rating, ingredients(*))')
      .single()
    setLoading(false)
    if (error) { toast.error('Erreur'); return }
    onUpdate({ ...data, week_start: weekStart } as WeeklyPlanning)
    setOpen(false)
    setSearch('')
  }

  async function clearSlot() {
    if (!slot) return
    await supabase.from('weekly_planning').delete().eq('id', slot.id)
    onUpdate(null)
  }

  if (recipe) {
    return (
      <div className="meal-card" style={{ position: 'relative' }}>
        <div className="meal-label">{label}</div>
        <div style={{ fontSize: 18, marginBottom: 2 }}>{recipe.emoji}</div>
        <div className="meal-name">{recipe.name}</div>
        <div className="meal-meta">
          {(recipe.prep_time || recipe.cook_time) && (
            <span className="tag tag-time">⏱{(recipe.prep_time ?? 0) + (recipe.cook_time ?? 0)}m</span>
          )}
          {recipe.tags?.includes('bébé')  && <span className="tag tag-bebe">👶</span>}
          {recipe.tags?.includes('végé')  && <span className="tag tag-vege">🥦</span>}
        </div>
        <button
          onClick={clearSlot}
          style={{ position: 'absolute', top: 4, right: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--ink-light)', lineHeight: 1 }}
        >
          ✕
        </button>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 6 }}>
      {open ? (
        <div style={{ background: 'var(--white)', borderRadius: 8, border: '1.5px solid var(--creme2)', overflow: 'hidden' }}>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Chercher…"
            style={{ width: '100%', padding: '5px 8px', border: 'none', borderBottom: '1px solid var(--creme2)', fontSize: 11, fontFamily: 'DM Sans', outline: 'none', background: 'var(--creme)' }}
          />
          <div style={{ maxHeight: 120, overflowY: 'auto' }}>
            {filtered.map(r => (
              <button
                key={r.id}
                onClick={() => selectRecipe(r)}
                disabled={loading}
                style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '5px 8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'DM Sans', color: 'var(--ink)', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--creme)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <span>{r.emoji}</span> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
              </button>
            ))}
          </div>
          <button onClick={() => { setOpen(false); setSearch('') }} style={{ width: '100%', padding: '4px', background: 'none', border: 'none', fontSize: 10, color: 'var(--ink-light)', cursor: 'pointer', borderTop: '1px solid var(--creme2)' }}>
            Annuler
          </button>
        </div>
      ) : (
        <button className="add-meal-btn" style={{ fontSize: 13, gap: 3 }} onClick={() => setOpen(true)}>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--ink-light)' }}>{label}</span>
          <span>+</span>
        </button>
      )}
    </div>
  )
}
