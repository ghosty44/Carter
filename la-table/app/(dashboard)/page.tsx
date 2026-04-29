import { createClient } from '@/lib/supabase/server'
import { getWeekStart, formatWeekStart } from '@/lib/utils'
import WeekCalendar from '@/components/planning/week-calendar'
import type { WeeklyPlanning, Recipe } from '@/lib/types'

export const revalidate = 0

export default async function PlanningPage() {
  const supabase = await createClient()
  const weekStart = formatWeekStart(getWeekStart())

  const [planningRes, recipesRes] = await Promise.all([
    supabase
      .from('weekly_planning')
      .select('*, recipe:recipes(id, name, emoji, prep_time, cook_time, tags, rating)')
      .eq('week_start', weekStart)
      .order('day_of_week'),
    supabase
      .from('recipes')
      .select('id, name, emoji, prep_time, cook_time, tags, rating')
      .order('name'),
  ])

  const planning = (planningRes.data ?? []) as WeeklyPlanning[]
  const recipes = (recipesRes.data ?? []) as Recipe[]

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl font-display font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Planning de la semaine
        </h1>
        <p className="text-warm-400 text-sm mt-1">
          Organise tes repas du lundi au dimanche
        </p>
      </div>

      <WeekCalendar
        weekStart={weekStart}
        planning={planning}
        recipes={recipes}
      />
    </div>
  )
}
