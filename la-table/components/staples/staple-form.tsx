'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
import type { StapleFormValues } from '@/lib/types'

interface StapleFormProps {
  onSubmit: (values: StapleFormValues) => void
  onCancel: () => void
}

export default function StapleForm({ onSubmit, onCancel }: StapleFormProps) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [substitute, setSubstitute] = useState('')
  const [alwaysAdd, setAlwaysAdd] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({
      name: name.trim(),
      brand: brand.trim(),
      quantity: quantity ? parseFloat(quantity) : '',
      unit: unit.trim(),
      substitute: substitute.trim(),
      always_add: alwaysAdd,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du produit *"
          required
          autoFocus
          className="col-span-2 px-3 py-2 border border-cream-200 rounded-lg text-sm focus:outline-none focus:border-terracotta-400"
        />
        <input
          type="text"
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          placeholder="Marque (optionnel)"
          className="px-3 py-2 border border-cream-200 rounded-lg text-sm focus:outline-none focus:border-terracotta-400"
        />
        <div className="flex gap-1.5">
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            placeholder="Qté"
            className="w-20 px-2 py-2 border border-cream-200 rounded-lg text-sm focus:outline-none focus:border-terracotta-400"
            min="0"
            step="any"
          />
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder="Unité"
            className="flex-1 px-2 py-2 border border-cream-200 rounded-lg text-sm focus:outline-none focus:border-terracotta-400"
          />
        </div>
        <input
          type="text"
          value={substitute}
          onChange={(e) => setSubstitute(e.target.value)}
          placeholder="Substitut si rupture"
          className="col-span-2 px-3 py-2 border border-cream-200 rounded-lg text-sm focus:outline-none focus:border-terracotta-400"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-warm-600 cursor-pointer">
        <input
          type="checkbox"
          checked={alwaysAdd}
          onChange={(e) => setAlwaysAdd(e.target.checked)}
          className="rounded accent-terracotta-500"
        />
        Toujours ajouter automatiquement au panier
      </label>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          className="flex items-center gap-1.5 bg-terracotta-500 hover:bg-terracotta-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition-colors"
        >
          <Save className="h-3.5 w-3.5" />
          Ajouter
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-warm-400 hover:text-warm-600 px-3 py-2 transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  )
}
