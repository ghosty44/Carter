import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const week = searchParams.get('week')

  if (!week) return NextResponse.json([], { status: 400 })

  const supabase = await createClient()
  const { data } = await supabase
    .from('weekly_planning')
    .select('*, recipe:recipes(id, name, emoji, prep_time, cook_time, tags, rating, ingredients(*))')
    .eq('week_start', week)
    .order('day_of_week')

  return NextResponse.json(data ?? [])
}
