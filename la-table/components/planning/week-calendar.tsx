'use client'

import { useState } from 'react'
import { addWeeks, subWeeks, format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { getWeekDays, formatWeekStart } from '@/lib/utils'
import MealSlot from './meal-slot'
import type { WeeklyPlanning, Recipe } from '@/lib/types'

const DAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']

interface WeekCalendarProps {
  weekStart: string
  planning: WeeklyPlanning[]
  recipes: Recipe[]
}

export default function WeekCalendar({ weekStart: initialWeekStart, planning: initialPlanning, recipes }: WeekCalendarProps) {
  const [weekStart, setWeekStart]   = useState(new Date(initialWeekStart + 'T00:00:00'))
  const [planning, setPlanning]     = useState<WeeklyPlanning[]>(initialPlanning)
  const [loading, setLoading]       = useState(false)
  const [addToDay, setAddToDay]     = useState<{ dayIdx: number; mealType: 'lunch' | 'dinner' } | null>(null)

  const days       = getWeekDays(weekStart)
  const weekStr    = formatWeekStart(weekStart)
  const today      = new Date()
  const todayStr   = formatWeekStart(today)

  // Budget from this week's planned recipes
  const weekRecipes = planning
    .filter(p => p.week_start === weekStr && p.recipe)
    .map(p => p.recipe as Recipe)
  const totalBudget = weekRecipes.reduce((sum, r) => {
    const cost = r.ingredients?.reduce((s, i) => s + (i.price_estimate ?? 0) * (i.quantity ?? 1), 0) ?? 0
    return sum + cost
  }, 0)
  const BUDGET_TARGET = 150
  const budgetPct = Math.min((totalBudget / BUDGET_TARGET) * 100, 100)

  function getSlot(dayIdx: number, mealType: 'lunch' | 'dinner') {
    return planning.find(p => p.week_start === weekStr && p.day_of_week === dayIdx && p.meal_type === mealType)
  }

  function updateSlot(slot: WeeklyPlanning | null, dayIdx: number, mealType: 'lunch' | 'dinner') {
    setPlanning(prev => {
      const filtered = prev.filter(p => !(p.week_start === weekStr && p.day_of_week === dayIdx && p.meal_type === mealType))
      return slot ? [...filtered, slot] : filtered
    })
  }

  async function navigateWeek(dir: 'prev' | 'next') {
    setLoading(true)
    const next    = dir === 'next' ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1)
    const nextStr = formatWeekStart(next)
    setWeekStart(next)
    try {
      const res  = await fetch(`/api/planning?week=${nextStr}`)
      const data = await res.json()
      setPlanning(data)
    } finally {
      setLoading(false)
    }
  }

  function addRecipe(recipe: Recipe, dayIdx: number, mealType: 'lunch' | 'dinner') {
    // Optimistic update — server upsert happens in MealSlot
    setAddToDay(null)
  }

  return (
    <>
      {/* Budget banner */}
      <div className="budget-banner">
        <div>
          <h3>Budget estimé</h3>
          <div className="budget-amount">{totalBudget.toFixed(0)}€</div>
          <div className="budget-sub">sur {BUDGET_TARGET}€ / semaine</div>
        </div>
        <div className="budget-bar-wrap">
          <div className="budget-bar-label"><span>0€</span><span>{BUDGET_TARGET}€</span></div>
          <div className="budget-bar"><div className="budget-fill" style={{ width: `${budgetPct}%` }} /></div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, opacity: 0.8 }}>{weekRecipes.length} repas planifiés</div>
          <div style={{ fontSize: 26 }}>{weekRecipes.length >= 5 ? '✅' : '⚠️'}</div>
        </div>
      </div>

      {/* Week navigation */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 18 }} onClick={() => navigateWeek('prev')} disabled={loading}>‹</button>
        <span style={{ fontSize: 13, color: 'var(--ink-light)', fontWeight: 500 }}>
          {format(days[0], 'd MMM', { locale: fr })} – {format(days[6], 'd MMM yyyy', { locale: fr })}
        </span>
        <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 18 }} onClick={() => navigateWeek('next')} disabled={loading}>›</button>
      </div>

      {/* Calendar grid */}
      <div className={`calendar-grid${loading ? ' opacity-50 pointer-events-none' : ''}`}>
        {days.map((day, idx) => {
          const isToday  = formatWeekStart(day) === todayStr
          const lunch    = getSlot(idx, 'lunch')
          const dinner   = getSlot(idx, 'dinner')
          return (
            <div key={idx} className="day-col">
              <div className="day-header">
                <div className="day-name">{DAYS_SHORT[idx]}</div>
                <div className={`day-num${isToday ? ' today' : ''}`}>{day.getDate()}</div>
              </div>
              <div className="day-body">
                <MealSlot
                  label="Déj"
                  dayIdx={idx}
                  mealType="lunch"
                  weekStart={weekStr}
                  slot={lunch}
                  recipes={recipes}
                  onUpdate={slot => updateSlot(slot, idx, 'lunch')}
                />
                <MealSlot
                  label="Dîner"
                  dayIdx={idx}
                  mealType="dinner"
                  weekStart={weekStr}
                  slot={dinner}
                  recipes={recipes}
                  onUpdate={slot => updateSlot(slot, idx, 'dinner')}
                />
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
