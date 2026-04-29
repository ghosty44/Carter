import { createClient } from '@/lib/supabase/server'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import { Star } from 'lucide-react'
import type { MealHistory } from '@/lib/types'

export const revalidate = 0

function groupByWeek(entries: MealHistory[]) {
  const groups: Record<string, MealHistory[]> = {}
  for (const entry of entries) {
    const date = parseISO(entry.cooked_at)
    const weekLabel = format(date, "'Semaine du' d MMMM yyyy", { locale: fr })
    if (!groups[weekLabel]) groups[weekLabel] = []
    groups[weekLabel].push(entry)
  }
  return groups
}

export default async function HistoryPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('meal_history')
    .select('*')
    .order('cooked_at', { ascending: false })
    .limit(100)

  const entries = (data ?? []) as MealHistory[]
  const groups = groupByWeek(entries)

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl font-display font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Historique
        </h1>
        <p className="text-warm-400 text-sm mt-1">
          Tes repas passés
        </p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-20 text-warm-400">
          <div className="text-5xl mb-3">📖</div>
          <p
            className="font-display text-xl text-warm-600 mb-1"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Aucun historique
          </p>
          <p className="text-sm">Les repas planifiés et cuisinés apparaîtront ici</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(groups).map(([week, meals]) => (
            <div key={week}>
              <h2
                className="text-sm font-semibold text-warm-500 uppercase tracking-wide mb-3"
              >
                {week}
              </h2>
              <div className="space-y-2">
                {meals.map((entry) => (
                  <div
                    key={entry.id}
                    className="bg-white rounded-xl border border-cream-200 p-4 flex items-start gap-3"
                  >
                    <span className="text-2xl">{entry.recipe_emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-medium text-warm-800 truncate">
                          {entry.recipe_name}
                        </span>
                        {entry.meal_type && (
                          <span className="text-xs bg-cream-100 text-warm-500 px-2 py-0.5 rounded-full">
                            {entry.meal_type === 'lunch' ? 'Déjeuner' : entry.meal_type === 'dinner' ? 'Dîner' : 'Autre'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-warm-400">
                        <span>
                          {format(parseISO(entry.cooked_at), 'EEEE d MMM', { locale: fr })}
                        </span>
                        {entry.rating && (
                          <span className="flex items-center gap-0.5">
                            {Array.from({ length: entry.rating }).map((_, i) => (
                              <Star key={i} className="h-3 w-3 fill-amber-400 text-amber-400" />
                            ))}
                          </span>
                        )}
                      </div>
                      {entry.note && (
                        <p className="text-xs text-warm-500 mt-1 italic">{entry.note}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
