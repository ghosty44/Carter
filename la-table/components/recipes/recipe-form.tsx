'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { PlusCircle, Trash2, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import type { Recipe } from '@/lib/types'

const EMOJI_OPTIONS = ['🍝','🍜','🍲','🥘','🍛','🥗','🍖','🍗','🐟','🥩','🍳','🥞','🥙','🌮','🌯','🥪','🍕','🫕','🥣','🫔']
const UNIT_OPTIONS = ['g','kg','ml','L','c. à s.','c. à c.','pièce(s)','tranche(s)','boîte(s)','sachet(s)','poignée(s)','']

interface IngredientField {
  id: string
  name: string
  quantity: string
  unit: string
  price_estimate: string
}

interface RecipeFormProps {
  recipe?: Recipe
}

export default function RecipeForm({ recipe }: RecipeFormProps) {
  const router = useRouter()
  const supabase = createClient()

  const [name, setName] = useState(recipe?.name ?? '')
  const [emoji, setEmoji] = useState(recipe?.emoji ?? '🍽️')
  const [customEmoji, setCustomEmoji] = useState('')
  const [prepTime, setPrepTime] = useState(String(recipe?.prep_time ?? ''))
  const [cookTime, setCookTime] = useState(String(recipe?.cook_time ?? ''))
  const [servings, setServings] = useState(String(recipe?.servings ?? '4'))
  const [tags, setTags] = useState(recipe?.tags?.join(', ') ?? '')
  const [note, setNote] = useState(recipe?.note ?? '')
  const [rating, setRating] = useState(String(recipe?.rating ?? ''))
  const [saving, setSaving] = useState(false)

  const [ingredients, setIngredients] = useState<IngredientField[]>(
    recipe?.ingredients?.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: String(i.quantity ?? ''),
      unit: i.unit ?? '',
      price_estimate: String(i.price_estimate ?? ''),
    })) ?? [{ id: crypto.randomUUID(), name: '', quantity: '', unit: '', price_estimate: '' }]
  )

  function addIngredient() {
    setIngredients((prev) => [
      ...prev,
      { id: crypto.randomUUID(), name: '', quantity: '', unit: '', price_estimate: '' },
    ])
  }

  function removeIngredient(id: string) {
    setIngredients((prev) => prev.filter((i) => i.id !== id))
  }

  function updateIngredient(id: string, field: keyof IngredientField, value: string) {
    setIngredients((prev) =>
      prev.map((i) => (i.id === id ? { ...i, [field]: value } : i))
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Le nom est obligatoire'); return }

    setSaving(true)
    const finalEmoji = customEmoji.trim() || emoji

    const recipePayload = {
      name: name.trim(),
      emoji: finalEmoji,
      prep_time: prepTime ? parseInt(prepTime) : null,
      cook_time: cookTime ? parseInt(cookTime) : null,
      servings: servings ? parseInt(servings) : 4,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
      note: note.trim() || null,
      rating: rating ? parseInt(rating) : null,
    }

    try {
      let recipeId = recipe?.id

      if (recipe) {
        const { error } = await supabase
          .from('recipes')
          .update(recipePayload)
          .eq('id', recipe.id)
        if (error) throw error

        // Delete old ingredients and re-insert
        await supabase.from('ingredients').delete().eq('recipe_id', recipe.id)
      } else {
        const { data, error } = await supabase
          .from('recipes')
          .insert(recipePayload)
          .select()
          .single()
        if (error) throw error
        recipeId = data.id
      }

      const validIngredients = ingredients.filter((i) => i.name.trim())
      if (validIngredients.length && recipeId) {
        const { error } = await supabase.from('ingredients').insert(
          validIngredients.map((i, idx) => ({
            recipe_id: recipeId,
            name: i.name.trim(),
            quantity: i.quantity ? parseFloat(i.quantity) : null,
            unit: i.unit || null,
            price_estimate: i.price_estimate ? parseFloat(i.price_estimate) : null,
            sort_order: idx,
          }))
        )
        if (error) throw error
      }

      toast.success(recipe ? 'Recette mise à jour !' : 'Recette créée !')
      router.push(recipeId ? `/recipes/${recipeId}` : '/recipes')
      router.refresh()
    } catch {
      toast.error('Erreur lors de l\'enregistrement')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!recipe) return
    if (!confirm('Supprimer cette recette ?')) return

    await supabase.from('recipes').delete().eq('id', recipe.id)
    toast.success('Recette supprimée')
    router.push('/recipes')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      {/* Name + Emoji */}
      <div className="bg-white rounded-2xl border border-cream-200 p-6 space-y-4">
        <h2
          className="font-display font-semibold text-warm-700"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Informations générales
        </h2>

        <div>
          <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
            Nom de la recette *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Poulet rôti aux herbes"
            className="w-full px-4 py-2.5 border border-cream-200 rounded-xl bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400 transition-colors"
            required
          />
        </div>

        {/* Emoji picker */}
        <div>
          <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
            Emoji
          </label>
          <div className="flex flex-wrap gap-2 mb-2">
            {EMOJI_OPTIONS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => { setEmoji(e); setCustomEmoji('') }}
                className={`text-xl p-1.5 rounded-lg border-2 transition-colors ${
                  emoji === e && !customEmoji
                    ? 'border-terracotta-400 bg-terracotta-50'
                    : 'border-transparent hover:border-cream-200'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={customEmoji}
            onChange={(e) => setCustomEmoji(e.target.value)}
            placeholder="Ou colle un emoji personnalisé…"
            className="w-48 px-3 py-1.5 border border-cream-200 rounded-lg text-sm focus:outline-none focus:border-terracotta-400"
          />
        </div>

        {/* Times + servings */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
              Prépa (min)
            </label>
            <input
              type="number"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
              min="0"
              className="w-full px-3 py-2 border border-cream-200 rounded-xl bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
              Cuisson (min)
            </label>
            <input
              type="number"
              value={cookTime}
              onChange={(e) => setCookTime(e.target.value)}
              min="0"
              className="w-full px-3 py-2 border border-cream-200 rounded-xl bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
              Personnes
            </label>
            <input
              type="number"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
              min="1"
              className="w-full px-3 py-2 border border-cream-200 rounded-xl bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
            />
          </div>
        </div>

        {/* Tags + Rating */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
              Tags (séparés par virgule)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="Ex: rapide, bébé, sans gluten"
              className="w-full px-3 py-2 border border-cream-200 rounded-xl bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
              Note (1–5)
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(String(rating) === String(n) ? '' : String(n))}
                  className={`text-xl transition-opacity ${
                    parseInt(rating) >= n ? 'opacity-100' : 'opacity-25 hover:opacity-60'
                  }`}
                >
                  ⭐
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="block text-xs font-semibold text-warm-500 uppercase tracking-wide mb-1.5">
            Notes / Astuces
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Conseils de préparation, variantes…"
            className="w-full px-4 py-2.5 border border-cream-200 rounded-xl bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400 resize-none"
          />
        </div>
      </div>

      {/* Ingredients */}
      <div className="bg-white rounded-2xl border border-cream-200 p-6 space-y-4">
        <h2
          className="font-display font-semibold text-warm-700"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Ingrédients
        </h2>

        <div className="space-y-2">
          {ingredients.map((ing, idx) => (
            <div key={ing.id} className="flex items-center gap-2">
              <span className="text-xs text-warm-300 w-5 text-right flex-shrink-0">{idx + 1}</span>
              <input
                type="text"
                value={ing.name}
                onChange={(e) => updateIngredient(ing.id, 'name', e.target.value)}
                placeholder="Nom de l'ingrédient"
                className="flex-1 px-3 py-2 border border-cream-200 rounded-lg bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
              />
              <input
                type="number"
                value={ing.quantity}
                onChange={(e) => updateIngredient(ing.id, 'quantity', e.target.value)}
                placeholder="Qté"
                className="w-16 px-2 py-2 border border-cream-200 rounded-lg bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
                min="0"
                step="any"
              />
              <select
                value={ing.unit}
                onChange={(e) => updateIngredient(ing.id, 'unit', e.target.value)}
                className="w-24 px-2 py-2 border border-cream-200 rounded-lg bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
              >
                {UNIT_OPTIONS.map((u) => (
                  <option key={u} value={u}>{u || '—'}</option>
                ))}
              </select>
              <input
                type="number"
                value={ing.price_estimate}
                onChange={(e) => updateIngredient(ing.id, 'price_estimate', e.target.value)}
                placeholder="€/u"
                className="w-16 px-2 py-2 border border-cream-200 rounded-lg bg-cream-50 text-sm focus:outline-none focus:border-terracotta-400"
                min="0"
                step="0.01"
              />
              <button
                type="button"
                onClick={() => removeIngredient(ing.id)}
                className="text-warm-300 hover:text-red-400 transition-colors p-1 flex-shrink-0"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addIngredient}
          className="flex items-center gap-2 text-terracotta-600 hover:text-terracotta-700 text-sm font-medium transition-colors"
        >
          <PlusCircle className="h-4 w-4" />
          Ajouter un ingrédient
        </button>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 bg-terracotta-500 hover:bg-terracotta-600 disabled:bg-warm-200 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {saving ? (
            <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {recipe ? 'Mettre à jour' : 'Créer la recette'}
        </button>

        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-3 text-warm-500 hover:text-warm-700 text-sm transition-colors"
        >
          Annuler
        </button>

        {recipe && (
          <button
            type="button"
            onClick={handleDelete}
            className="ml-auto flex items-center gap-2 text-red-400 hover:text-red-600 text-sm transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Supprimer
          </button>
        )}
      </div>
    </form>
  )
}
