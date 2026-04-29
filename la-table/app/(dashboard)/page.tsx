import { createClient } from '@/lib/supabase/server'
import { getWeekStart, formatWeekStart } from '@/lib/utils'
import WeekCalendar from '@/components/planning/week-calendar'
import type { WeeklyPlanning, Recipe } from '@/lib/types'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

export const revalidate = 0

export default async function PlanningPage() {
  const supabase   = await createClient()
  const weekStart  = getWeekStart()
  const weekStr    = formatWeekStart(weekStart)
  const weekLabel  = format(weekStart, "'Semaine du' d MMMM", { locale: fr })

  const [planningRes, recipesRes] = await Promise.all([
    supabase
      .from('weekly_planning')
      .select('*, recipe:recipes(id, name, emoji, prep_time, cook_time, tags, rating, ingredients(*))')
      .eq('week_start', weekStr)
      .order('day_of_week'),
    supabase
      .from('recipes')
      .select('id, name, emoji, prep_time, cook_time, tags, rating, ingredients(*)')
      .order('name'),
  ])

  const planning = (planningRes.data ?? []) as WeeklyPlanning[]
  const recipes  = (recipesRes.data ?? []) as Recipe[]

  return (
    <>
      <div className="topbar">
        <h2>{weekLabel}</h2>
        <div className="topbar-actions">
          <a href="/drive" className="btn btn-outline">🛒 <span className="btn-text">Drive</span></a>
          <a href="/recipes/new" className="btn btn-primary">+ <span className="btn-text">Recette</span></a>
        </div>
      </div>
      <div className="page">
        <WeekCalendar
          weekStart={weekStr}
          planning={planning}
          recipes={recipes}
        />
      </div>
    </>
  )
}
