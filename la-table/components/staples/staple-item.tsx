'use client'

import { useState } from 'react'
import { Trash2, Pencil, Check, X } from 'lucide-react'
import type { Staple } from '@/lib/types'

interface StapleItemProps {
  staple: Staple
  onDelete: (id: string) => void
  onUpdate: (id: string, updates: Partial<Staple>) => void
}

export default function StapleItem({ staple, onDelete, onUpdate }: StapleItemProps) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(staple.name)
  const [brand, setBrand] = useState(staple.brand ?? '')
  const [quantity, setQuantity] = useState(String(staple.quantity ?? ''))
  const [unit, setUnit] = useState(staple.unit ?? '')
  const [substitute, setSubstitute] = useState(staple.substitute ?? '')

  function saveEdit() {
    onUpdate(staple.id, {
      name: name.trim() || staple.name,
      brand: brand.trim() || null,
      quantity: quantity ? parseFloat(quantity) : null,
      unit: unit.trim() || null,
      substitute: substitute.trim() || null,
    })
    setEditing(false)
  }

  function cancelEdit() {
    setName(staple.name)
    setBrand(staple.brand ?? '')
    setQuantity(String(staple.quantity ?? ''))
    setUnit(staple.unit ?? '')
    setSubstitute(staple.substitute ?? '')
    setEditing(false)
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border border-terracotta-200 p-4 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom du produit"
            className="col-span-2 px-3 py-2 border border-cream-200 rounded-lg text-sm focus:outline-none focus:border-terracotta-400"
            autoFocus
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
        <div className="flex gap-2 pt-1">
          <button
            onClick={saveEdit}
            className="flex items-center gap-1.5 bg-terracotta-500 hover:bg-terracotta-600 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Check className="h-3.5 w-3.5" />
            Sauvegarder
          </button>
          <button
            onClick={cancelEdit}
            className="flex items-center gap-1.5 text-warm-400 hover:text-warm-600 text-xs px-3 py-1.5 rounded-lg border border-cream-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            Annuler
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-cream-200 px-4 py-3 flex items-center gap-3 group">
      {/* Always-add toggle */}
      <button
        onClick={() => onUpdate(staple.id, { always_add: !staple.always_add })}
        className={`h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          staple.always_add
            ? 'border-terracotta-500 bg-terracotta-500'
            : 'border-warm-200 hover:border-terracotta-300'
        }`}
        title={staple.always_add ? 'Retirer des incontournables auto' : 'Toujours ajouter au panier'}
      >
        {staple.always_add && (
          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-warm-800 text-sm">{staple.name}</span>
          {staple.brand && (
            <span className="text-xs text-warm-400">{staple.brand}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-warm-400 mt-0.5">
          {staple.quantity && (
            <span>{staple.quantity} {staple.unit}</span>
          )}
          {staple.substitute && (
            <span className="italic">→ {staple.substitute} si rupture</span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="text-warm-300 hover:text-warm-600 transition-colors p-1.5"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() => onDelete(staple.id)}
          className="text-warm-300 hover:text-red-400 transition-colors p-1.5"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
