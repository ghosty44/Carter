'use client'

import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CartItem } from '@/lib/types'

const SOURCE_LABELS: Record<string, string> = {
  recipe: '🍽️',
  staple: '⭐',
  extra: '📝',
}

interface CartItemProps {
  item: CartItem
  onToggle: (id: string) => void
  onRemove: (id: string) => void
}

export default function CartItemRow({ item, onToggle, onRemove }: CartItemProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 transition-colors',
        item.checked && 'bg-cream-50'
      )}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item.id)}
        className={`h-5 w-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          item.checked
            ? 'border-green-500 bg-green-500'
            : 'border-warm-200 hover:border-terracotta-300'
        }`}
      >
        {item.checked && (
          <svg className="h-3 w-3 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Source icon */}
      <span className="text-sm flex-shrink-0" title={item.source}>
        {SOURCE_LABELS[item.source] ?? ''}
      </span>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <span className={cn('text-sm', item.checked ? 'line-through text-warm-400' : 'text-warm-800')}>
          {item.name}
        </span>
        {item.recipe_name && (
          <p className="text-xs text-warm-400 mt-0.5">{item.recipe_name}</p>
        )}
      </div>

      {/* Qty */}
      {item.qty && (
        <span className="text-xs text-warm-400 flex-shrink-0">
          {item.qty} {item.unit}
        </span>
      )}

      {/* Delete */}
      <button
        onClick={() => onRemove(item.id)}
        className="text-warm-200 hover:text-red-400 transition-colors p-1 flex-shrink-0"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
