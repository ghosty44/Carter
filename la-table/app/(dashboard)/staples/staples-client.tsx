'use client'

import { useState } from 'react'
import { PlusCircle, ShoppingCart } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import StapleItem from '@/components/staples/staple-item'
import StapleForm from '@/components/staples/staple-form'
import type { Staple, StapleFormValues } from '@/lib/types'

export default function StaplesClient({ initialStaples }: { initialStaples: Staple[] }) {
  const [staples, setStaples] = useState<Staple[]>(initialStaples)
  const [showForm, setShowForm] = useState(false)
  const supabase = createClient()

  async function addStaple(values: StapleFormValues) {
    const { data, error } = await supabase
      .from('staples')
      .insert({
        name: values.name,
        brand: values.brand || null,
        quantity: values.quantity || null,
        unit: values.unit || null,
        substitute: values.substitute || null,
        always_add: values.always_add,
        sort_order: staples.length,
      })
      .select()
      .single()

    if (error) { toast.error('Erreur lors de l\'ajout'); return }
    setStaples([...staples, data as Staple])
    setShowForm(false)
    toast.success(`${values.name} ajouté`)
  }

  async function deleteStaple(id: string) {
    await supabase.from('staples').delete().eq('id', id)
    setStaples(staples.filter((s) => s.id !== id))
    toast.success('Produit supprimé')
  }

  async function updateStaple(id: string, updates: Partial<Staple>) {
    const { error } = await supabase.from('staples').update(updates).eq('id', id)
    if (error) { toast.error('Erreur'); return }
    setStaples(staples.map((s) => (s.id === id ? { ...s, ...updates } : s)))
  }

  async function addAllToCart() {
    const alwaysAdd = staples.filter((s) => s.always_add)
    if (!alwaysAdd.length) { toast('Aucun incontournable marqué « toujours ajouter »'); return }

    const { data: cartData } = await supabase
      .from('cart_sessions')
      .select('id, items')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    const cartItems = cartData?.items ?? []
    const newItems = [
      ...cartItems,
      ...alwaysAdd.map((s) => ({
        id: crypto.randomUUID(),
        name: s.brand ? `${s.name} (${s.brand})` : s.name,
        qty: s.quantity,
        unit: s.unit,
        price: null,
        checked: false,
        source: 'staple',
      })),
    ]

    if (cartData) {
      await supabase.from('cart_sessions').update({ items: newItems }).eq('id', cartData.id)
    } else {
      await supabase.from('cart_sessions').insert({ items: newItems })
    }

    toast.success(`${alwaysAdd.length} produit(s) ajouté(s) au panier`)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 text-white font-medium px-4 py-2.5 rounded-xl transition-colors text-sm"
        >
          <PlusCircle className="h-4 w-4" />
          Ajouter
        </button>
        {staples.some((s) => s.always_add) && (
          <button
            onClick={addAllToCart}
            className="flex items-center gap-2 border border-terracotta-300 text-terracotta-600 hover:bg-terracotta-50 font-medium px-4 py-2.5 rounded-xl transition-colors text-sm"
          >
            <ShoppingCart className="h-4 w-4" />
            Tout ajouter au panier
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white rounded-2xl border border-cream-200 p-5">
          <h3
            className="font-display font-semibold text-warm-700 mb-4"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Nouveau produit
          </h3>
          <StapleForm onSubmit={addStaple} onCancel={() => setShowForm(false)} />
        </div>
      )}

      {staples.length === 0 && !showForm ? (
        <div className="text-center py-16 text-warm-400">
          <div className="text-5xl mb-3">🧺</div>
          <p className="font-display text-xl text-warm-600 mb-1"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
            Liste vide
          </p>
          <p className="text-sm">Ajoute tes produits incontournables</p>
        </div>
      ) : (
        <div className="space-y-2">
          {staples.map((staple) => (
            <StapleItem
              key={staple.id}
              staple={staple}
              onDelete={deleteStaple}
              onUpdate={updateStaple}
            />
          ))}
        </div>
      )}
    </div>
  )
}
