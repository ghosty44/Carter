'use client'

import Link from 'next/link'
import { Clock, Users, Star, ShoppingCart } from 'lucide-react'
import { totalTime } from '@/lib/utils'
import CartModal from './cart-modal'
import type { Recipe } from '@/lib/types'

export default function RecipeCard({ recipe }: { recipe: Recipe }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-200 overflow-hidden hover:shadow-md transition-shadow group">
      {/* Top: emoji + cart button */}
      <div className="relative bg-cream-50 flex items-center justify-center h-24 border-b border-cream-100">
        <span className="text-5xl">{recipe.emoji}</span>
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <CartModal recipe={recipe} compact />
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <Link href={`/recipes/${recipe.id}`} className="block mb-2">
          <h3
            className="font-display font-semibold text-warm-800 hover:text-terracotta-600 transition-colors line-clamp-1"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            {recipe.name}
          </h3>
        </Link>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-warm-400 mb-3">
          {totalTime(recipe.prep_time, recipe.cook_time) && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {totalTime(recipe.prep_time, recipe.cook_time)}
            </span>
          )}
          {recipe.servings && (
            <span className="flex items-center gap-1">
              <Users className="h-3 w-3" />
              {recipe.servings}p
            </span>
          )}
          {recipe.rating && (
            <span className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {recipe.rating}
            </span>
          )}
        </div>

        {/* Tags */}
        {recipe.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] bg-cream-100 text-warm-500 px-2 py-0.5 rounded-full"
              >
                {tag}
              </span>
            ))}
            {recipe.tags.length > 3 && (
              <span className="text-[10px] text-warm-400">+{recipe.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* Footer: cart button (always visible on mobile) */}
      <div className="px-4 pb-4 lg:hidden">
        <CartModal recipe={recipe} compact />
      </div>
    </div>
  )
}
