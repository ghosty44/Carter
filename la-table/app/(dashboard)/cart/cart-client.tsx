'use client'

import { useState } from 'react'
import { CheckCircle2, PlusCircle, Trash2, ShoppingBag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import CartItemRow from '@/components/cart/cart-item'
import { formatPrice, cartTotal } from '@/lib/utils'
import type { CartItem, CartSession } from '@/lib/types'

export default function CartClient({ initialCart }: { initialCart: CartSession | null }) {
  const [cart, setCart] = useState<CartSession | null>(initialCart)
  const [newItem, setNewItem] = useState('')
  const supabase = createClient()

  const items = cart?.items ?? []
  const checked = items.filter((i) => i.checked)
  const unchecked = items.filter((i) => !i.checked)

  async function persistItems(updated: CartItem[]) {
    if (cart) {
      await supabase.from('cart_sessions').update({ items: updated }).eq('id', cart.id)
    } else {
      const { data } = await supabase
        .from('cart_sessions')
        .insert({ items: updated })
        .select()
        .single()
      if (data) setCart(data as CartSession)
    }
  }

  async function addExtraItem() {
    const name = newItem.trim()
    if (!name) return
    const item: CartItem = {
      id: crypto.randomUUID(),
      name,
      qty: null,
      unit: null,
      price: null,
      checked: false,
      source: 'extra',
    }
    const updated = [...items, item]
    setCart((c) => c ? { ...c, items: updated } : null)
    setNewItem('')
    await persistItems(updated)
  }

  async function toggleItem(id: string) {
    const updated = items.map((i) => i.id === id ? { ...i, checked: !i.checked } : i)
    setCart((c) => c ? { ...c, items: updated } : null)
    await persistItems(updated)
  }

  async function removeItem(id: string) {
    const updated = items.filter((i) => i.id !== id)
    setCart((c) => c ? { ...c, items: updated } : null)
    await persistItems(updated)
  }

  async function clearChecked() {
    const updated = items.filter((i) => !i.checked)
    setCart((c) => c ? { ...c, items: updated } : null)
    await persistItems(updated)
    toast.success('Articles cochés supprimés')
  }

  async function completeCart() {
    if (!cart) return
    await supabase
      .from('cart_sessions')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', cart.id)
    setCart(null)
    toast.success('Courses terminées ! 🎉')
  }

  const total = cartTotal(items.filter((i) => i.price != null && i.qty != null))

  return (
    <div className="space-y-4">
      {/* Stats bar */}
      {items.length > 0 && (
        <div className="flex items-center justify-between bg-white rounded-xl border border-cream-200 px-5 py-3 text-sm">
          <span className="text-warm-500">
            {checked.length}/{items.length} article{items.length !== 1 ? 's' : ''} coché{checked.length !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-3">
            {total > 0 && (
              <span className="font-semibold text-terracotta-600">~{formatPrice(total)}</span>
            )}
            {checked.length > 0 && (
              <button
                onClick={clearChecked}
                className="flex items-center gap-1 text-warm-400 hover:text-red-500 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Supprimer cochés
              </button>
            )}
          </div>
        </div>
      )}

      {/* Unchecked items */}
      {unchecked.length > 0 && (
        <div className="bg-white rounded-2xl border border-cream-200 divide-y divide-cream-100 overflow-hidden">
          {unchecked.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              onToggle={toggleItem}
              onRemove={removeItem}
            />
          ))}
        </div>
      )}

      {/* Checked items */}
      {checked.length > 0 && (
        <div className="bg-cream-50 rounded-2xl border border-cream-200 divide-y divide-cream-100 overflow-hidden opacity-60">
          {checked.map((item) => (
            <CartItemRow
              key={item.id}
              item={item}
              onToggle={toggleItem}
              onRemove={removeItem}
            />
          ))}
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🛒</div>
          <p
            className="font-display text-xl text-warm-600 mb-1"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Panier vide
          </p>
          <p className="text-sm text-warm-400">
            Ajoute des recettes depuis le planning ou les recettes
          </p>
        </div>
      )}

      {/* Add extra item */}
      <div className="flex gap-2">
        <input
          type="text"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addExtraItem()}
          placeholder="Ajouter un article libre…"
          className="flex-1 px-4 py-2.5 border border-cream-200 rounded-xl bg-white text-sm focus:outline-none focus:border-terracotta-400 transition-colors"
        />
        <button
          onClick={addExtraItem}
          className="flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white px-4 py-2.5 rounded-xl transition-colors text-sm font-medium"
        >
          <PlusCircle className="h-4 w-4" />
          Ajouter
        </button>
      </div>

      {/* Complete button */}
      {items.length > 0 && checked.length === items.length && (
        <button
          onClick={completeCart}
          className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-xl transition-colors"
        >
          <CheckCircle2 className="h-5 w-5" />
          Courses terminées !
        </button>
      )}
    </div>
  )
}
