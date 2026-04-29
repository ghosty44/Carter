'use client'

import Link from 'next/link'
import CartModal from './cart-modal'
import type { Recipe } from '@/lib/types'

interface RecipeCardProps {
  recipe: Recipe
  inCart?: boolean
  onCartChange?: (id: string, inCart: boolean) => void
}

export default function RecipeCard({ recipe, inCart = false, onCartChange }: RecipeCardProps) {
  const totalTime = (recipe.prep_time ?? 0) + (recipe.cook_time ?? 0)

  return (
    <div className="recipe-card">
      {/* Floating cart button */}
      <CartModal
        recipe={recipe}
        inCart={inCart}
        onCartChange={onCartChange}
      />

      <Link href={`/recipes/${recipe.id}`}>
        <div className="recipe-emoji-box">{recipe.emoji}</div>
        <div className="recipe-body">
          <div className="recipe-name-text">{recipe.name}</div>
          <div className="recipe-tags">
            {recipe.tags?.map(t => (
              <span key={t} className={`tag ${t === 'végé' ? 'tag-vege' : t === 'bébé' ? 'tag-bebe' : t === 'rapide' ? 'tag-time' : 'tag-budget'}`}>
                {t === 'bébé' ? '👶' : t}
              </span>
            ))}
          </div>
          <div className="recipe-footer">
            {totalTime > 0 && <span className="recipe-time-text">⏱ {totalTime}min</span>}
            {recipe.rating && <span style={{ fontSize: 14 }}>{'⭐'.repeat(recipe.rating)}</span>}
          </div>
          {recipe.note && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--ink-light)', fontStyle: 'italic' }}>
              💬 {recipe.note}
            </div>
          )}
        </div>
      </Link>
    </div>
  )
}
