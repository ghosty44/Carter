import { createClient } from '@/lib/supabase/server'
import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'
import type { MealHistory } from '@/lib/types'

export const revalidate = 0

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('meal_history')
    .select('*')
    .order('cooked_at', { ascending: false })
    .limit(100)

  const entries = (data ?? []) as MealHistory[]

  return (
    <>
      <div className="topbar">
        <h2>Historique des repas</h2>
      </div>
      <div className="page">
        {entries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--ink-light)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📖</div>
            <h3 style={{ fontSize: 20, marginBottom: 6 }}>Aucun historique</h3>
            <p style={{ fontSize: 13 }}>Les repas planifiés et cuisinés apparaîtront ici</p>
          </div>
        ) : (
          <div style={{ background: 'var(--white)', borderRadius: 14, border: '1.5px solid var(--creme2)', overflow: 'hidden' }}>
            {entries.map((entry, i) => (
              <div
                key={entry.id}
                style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderBottom: i < entries.length - 1 ? '1px solid var(--creme2)' : 'none', gap: 12 }}
              >
                <div style={{ width: 70, fontSize: 12, color: 'var(--ink-light)', flexShrink: 0 }}>
                  {format(parseISO(entry.cooked_at), 'EEE d MMM', { locale: fr })}
                </div>
                <div style={{ fontSize: 22, flexShrink: 0 }}>{entry.recipe_emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{entry.recipe_name}</div>
                  {entry.meal_type && (
                    <div style={{ fontSize: 11, color: 'var(--ink-light)', marginTop: 1 }}>
                      {entry.meal_type === 'lunch' ? 'Déjeuner' : entry.meal_type === 'dinner' ? 'Dîner' : 'Autre'}
                    </div>
                  )}
                  {entry.note && (
                    <div style={{ fontSize: 11, color: 'var(--ink-light)', fontStyle: 'italic', marginTop: 2 }}>
                      💬 {entry.note}
                    </div>
                  )}
                </div>
                {entry.rating && (
                  <div style={{ fontSize: 16, flexShrink: 0 }}>
                    {'⭐'.repeat(entry.rating)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
