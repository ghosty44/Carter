import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Pencil, Clock, Users, Star } from 'lucide-react'
import CartModal from '@/components/recipes/cart-modal'
import { totalTime, formatPrice } from '@/lib/utils'
import type { Recipe } from '@/lib/types'

export const revalidate = 0

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('recipes')
    .select('*, ingredients(*)')
    .eq('id', id)
    .single()

  if (!data) notFound()

  const recipe = data as Recipe

  const estimatedTotal = recipe.ingredients
    ?.reduce((sum, ing) => sum + (ing.price_estimate ?? 0) * (ing.quantity ?? 1), 0) ?? 0

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-4xl">{recipe.emoji}</span>
            <h1
              className="text-3xl font-display font-bold text-warm-800"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
            >
              {recipe.name}
            </h1>
          </div>
          <div className="flex items-center gap-4 text-warm-400 text-sm">
            {totalTime(recipe.prep_time, recipe.cook_time) && (
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {totalTime(recipe.prep_time, recipe.cook_time)}
              </span>
            )}
            {recipe.servings && (
              <span className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {recipe.servings} pers.
              </span>
            )}
            {recipe.rating && (
              <span className="flex items-center gap-1">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {recipe.rating}/5
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <CartModal recipe={recipe} />
          <Link
            href={`/recipes/${id}/edit`}
            className="flex items-center gap-2 border border-cream-200 hover:border-terracotta-300 text-warm-600 hover:text-terracotta-600 px-3 py-2 rounded-xl transition-colors text-sm"
          >
            <Pencil className="h-4 w-4" />
            Modifier
          </Link>
        </div>
      </div>

      {/* Tags */}
      {recipe.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {recipe.tags.map((tag) => (
            <span
              key={tag}
              className="bg-cream-100 text-warm-600 text-xs font-medium px-3 py-1 rounded-full border border-cream-200"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Ingredients */}
      <div className="bg-white rounded-2xl border border-cream-200 p-6 mb-4">
        <h2
          className="font-display font-semibold text-warm-700 mb-4"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ingrédients
          {recipe.servings && (
            <span className="font-sans font-normal text-sm text-warm-400 ml-2">
              pour {recipe.servings} personnes
            </span>
          )}
        </h2>
        {recipe.ingredients && recipe.ingredients.length > 0 ? (
          <ul className="space-y-2">
            {recipe.ingredients.map((ing) => (
              <li key={ing.id} className="flex items-center justify-between py-1.5 border-b border-cream-100 last:border-0">
                <span className="text-warm-700">{ing.name}</span>
                <div className="flex items-center gap-3 text-sm">
                  {ing.quantity && (
                    <span className="text-warm-500">
                      {ing.quantity} {ing.unit}
                    </span>
                  )}
                  {ing.price_estimate && (
                    <span className="text-warm-400 text-xs">
                      ~{formatPrice(ing.price_estimate * (ing.quantity ?? 1))}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-warm-400 text-sm">Aucun ingrédient renseigné</p>
        )}

        {estimatedTotal > 0 && (
          <div className="mt-4 pt-3 border-t border-cream-200 flex justify-between text-sm">
            <span className="text-warm-500">Coût estimé</span>
            <span className="font-semibold text-terracotta-600">
              ~{formatPrice(estimatedTotal)}
            </span>
          </div>
        )}
      </div>

      {/* Note */}
      {recipe.note && (
        <div className="bg-white rounded-2xl border border-cream-200 p-6">
          <h2
            className="font-display font-semibold text-warm-700 mb-3"
            style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
          >
            Notes
          </h2>
          <p className="text-warm-600 text-sm leading-relaxed whitespace-pre-wrap">
            {recipe.note}
          </p>
        </div>
      )}
    </div>
  )
}
