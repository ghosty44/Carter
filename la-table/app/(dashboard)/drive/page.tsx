import { createClient } from '@/lib/supabase/server'
import { getWeekStart, formatWeekStart } from '@/lib/utils'
import DriveClient from './drive-client'
import type { WeeklyPlanning, Staple, CartSession } from '@/lib/types'

export const revalidate = 0

export default async function DrivePage() {
  const supabase  = await createClient()
  const weekStart = formatWeekStart(getWeekStart())

  const [planningRes, staplesRes, cartRes] = await Promise.all([
    supabase
      .from('weekly_planning')
      .select('*, recipe:recipes(id, name, emoji, ingredients(id, name, quantity, unit, price_estimate))')
      .eq('week_start', weekStart),
    supabase
      .from('staples')
      .select('*')
      .order('sort_order'),
    supabase
      .from('cart_sessions')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return (
    <>
      <div className="topbar">
        <h2>Drive Intermarché</h2>
      </div>
      <div className="page">
        <DriveClient
          planning={(planningRes.data ?? []) as WeeklyPlanning[]}
          staples={(staplesRes.data ?? []) as Staple[]}
          cart={cartRes.data as CartSession | null}
        />
      </div>
    </>
  )
}
