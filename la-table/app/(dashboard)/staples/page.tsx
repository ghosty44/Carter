import { createClient } from '@/lib/supabase/server'
import StaplesClient from './staples-client'
import type { Staple } from '@/lib/types'

export const revalidate = 0

export default async function StaplesPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('staples')
    .select('*')
    .order('sort_order')
    .order('name')

  const staples = (data ?? []) as Staple[]

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl font-display font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Incontournables
        </h1>
        <p className="text-warm-400 text-sm mt-1">
          Produits récurrents à toujours avoir
        </p>
      </div>

      <StaplesClient initialStaples={staples} />
    </div>
  )
}
