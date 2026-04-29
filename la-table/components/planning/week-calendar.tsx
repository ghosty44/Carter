'use client'

import { useState } from 'react'
import { addWeeks, subWeeks } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getWeekDays, formatDay, formatWeekStart } from '@/lib/utils'
import MealSlot from './meal-slot'
import type { WeeklyPlanning, Recipe } from '@/lib/types'

interface WeekCalendarProps {
  weekStart: string
  planning: WeeklyPlanning[]
  recipes: Recipe[]
}

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

export default function WeekCalendar({ weekStart: initialWeekStart, planning: initialPlanning, recipes }: WeekCalendarProps) {
  const [weekStart, setWeekStart] = useState(new Date(initialWeekStart + 'T00:00:00'))
  const [planning, setPlanning] = useState<WeeklyPlanning[]>(initialPlanning)
  const [loading, setLoading] = useState(false)

  const days = getWeekDays(weekStart)
  const weekStartStr = formatWeekStart(weekStart)

  function getSlot(dayIdx: number, mealType: 'lunch' | 'dinner') {
    return planning.find(
      (p) => p.week_start === weekStartStr && p.day_of_week === dayIdx && p.meal_type === mealType
    )
  }

  async function navigateWeek(direction: 'prev' | 'next') {
    setLoading(true)
    const newWeek = direction === 'next' ? addWeeks(weekStart, 1) : subWeeks(weekStart, 1)
    const newWeekStr = formatWeekStart(newWeek)
    setWeekStart(newWeek)

    try {
      const res = await fetch(`/api/planning?week=${newWeekStr}`)
      const data = await res.json()
      setPlanning(data)
    } catch {
      // keep current planning on error
    } finally {
      setLoading(false)
    }
  }

  function updateSlot(slot: WeeklyPlanning | null, dayIdx: number, mealType: 'lunch' | 'dinner') {
    setPlanning((prev) => {
      const filtered = prev.filter(
        (p) => !(p.week_start === weekStartStr && p.day_of_week === dayIdx && p.meal_type === mealType)
      )
      return slot ? [...filtered, slot] : filtered
    })
  }

  // Format week range label
  const start = days[0]
  const end = days[6]
  const weekLabel = `${start.getDate()} – ${end.getDate()} ${end.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-5">
        <button
          onClick={() => navigateWeek('prev')}
          disabled={loading}
          className="p-2 rounded-xl border border-cream-200 hover:bg-cream-100 transition-colors disabled:opacity-50"
        >
          <ChevronLeft className="h-4 w-4 text-warm-600" />
        </button>
        <span
          className="text-sm font-medium text-warm-600"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          {weekLabel}
        </span>
        <button
          onClick={() => navigateWeek('next')}
          disabled={loading}
          className="p-2 rounded-xl border border-cream-200 hover:bg-cream-100 transition-colors disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4 text-warm-600" />
        </button>
      </div>

      {/* Calendar grid */}
      <div className={`space-y-3 transition-opacity ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
        {days.map((day, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-cream-200 overflow-hidden">
            {/* Day header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-cream-50 border-b border-cream-100">
              <span
                className="font-display font-semibold text-warm-700 text-sm capitalize"
                style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              >
                {DAYS_FR[idx]}
              </span>
              <span className="text-xs text-warm-400">{formatDay(day)}</span>
            </div>

            {/* Meals */}
            <div className="divide-y divide-cream-100">
              <MealSlot
                label="Déjeuner"
                dayIdx={idx}
                mealType="lunch"
                weekStart={weekStartStr}
                slot={getSlot(idx, 'lunch')}
                recipes={recipes}
                onUpdate={(slot) => updateSlot(slot, idx, 'lunch')}
              />
              <MealSlot
                label="Dîner"
                dayIdx={idx}
                mealType="dinner"
                weekStart={weekStartStr}
                slot={getSlot(idx, 'dinner')}
                recipes={recipes}
                onUpdate={(slot) => updateSlot(slot, idx, 'dinner')}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
