import { createClient } from '@/lib/supabase/server'
import CartClient from './cart-client'
import type { CartSession } from '@/lib/types'

export const revalidate = 0

export default async function CartPage() {
  const supabase = await createClient()

  const { data } = await supabase
    .from('cart_sessions')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl font-display font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Mon panier
        </h1>
        <p className="text-warm-400 text-sm mt-1">
          Articles pour tes courses
        </p>
      </div>

      <CartClient initialCart={data as CartSession | null} />
    </div>
  )
}
