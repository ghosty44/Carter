import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import RecipeForm from '@/components/recipes/recipe-form'
import type { Recipe } from '@/lib/types'

export const revalidate = 0

export default async function EditRecipePage({
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

  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl font-display font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Modifier la recette
        </h1>
      </div>
      <RecipeForm recipe={data as Recipe} />
    </div>
  )
}
