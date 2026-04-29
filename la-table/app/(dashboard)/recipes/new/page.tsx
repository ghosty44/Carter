import RecipeForm from '@/components/recipes/recipe-form'

export default function NewRecipePage() {
  return (
    <div>
      <div className="mb-6">
        <h1
          className="text-3xl font-display font-bold text-warm-800"
          style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
        >
          Nouvelle recette
        </h1>
        <p className="text-warm-400 text-sm mt-1">
          Ajoute une recette à ton carnet
        </p>
      </div>

      <RecipeForm />
    </div>
  )
}
