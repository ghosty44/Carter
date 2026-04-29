'use client'

import { useState } from 'react'
import { PlusCircle, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

interface ExtraItem {
  id: string
  text: string
}

export default function ExtrasPage() {
  const [items, setItems] = useState<ExtraItem[]>([])
  const [input, setInput] = useState('')

  function addItem() {
    const text = input.trim()
    if (!text) return
    setItems((prev) => [...prev, { id: crypto.randomUUID(), text }])
    setInput('')
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id))
  }

  async function sendToCart() {
    if (!items.length) return
    const supabase = createClient()

    const { data: cartData } = await supabase
      .from('cart_sessions')
      .select('id, items')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const existing = cartData?.items ?? []
    const newItems = [
      ...existing,
      ...items.map((i) => ({
        id: crypto.randomUUID(),
        name: i.text,
        qty: null,
        unit: null,
        price: null,
        checked: false,
        source: 'extra',
      })),
    ]

    if (cartData) {
      await supabase.from('cart_sessions').update({ items: newItems }).eq('id', cartData.id)
    } else {
      await supabase.from('cart_sessions').insert({ items: newItems })
    }

    setItems([])
    toast.success(`${items.length} article(s) ajouté(s) au panier`)
  }

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl font-display font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Articles extra
        </h1>
        <p className="text-warm-400 text-sm mt-1">
          Liste libre pour tes achats ponctuels
        </p>
      </div>

      <div className="space-y-4 max-w-lg">
        {/* Input */}
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addItem()}
            placeholder="Ex: Papier cadeau, huile de coco…"
            className="flex-1 px-4 py-2.5 border border-cream-200 rounded-xl bg-white text-sm focus:outline-none focus:border-terracotta-400 transition-colors"
          />
          <button
            onClick={addItem}
            className="flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white px-4 py-2.5 rounded-xl transition-colors text-sm font-medium"
          >
            <PlusCircle className="h-4 w-4" />
            Ajouter
          </button>
        </div>

        {/* List */}
        {items.length > 0 && (
          <div className="bg-white rounded-2xl border border-cream-200 divide-y divide-cream-100 overflow-hidden">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-warm-700 text-sm">📝 {item.text}</span>
                <button
                  onClick={() => removeItem(item.id)}
                  className="text-warm-300 hover:text-red-400 transition-colors p-1"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Send to cart */}
        {items.length > 0 && (
          <button
            onClick={sendToCart}
            className="w-full flex items-center justify-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white font-medium py-3 rounded-xl transition-colors"
          >
            🛒 Envoyer au panier ({items.length})
          </button>
        )}

        {items.length === 0 && (
          <div className="text-center py-14 text-warm-400">
            <div className="text-4xl mb-3">📝</div>
            <p className="text-sm">Écris tes articles ponctuels ici, puis envoie-les au panier</p>
          </div>
        )}
      </div>
    </div>
  )
}
