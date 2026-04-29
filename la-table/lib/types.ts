export type MealType = 'lunch' | 'dinner'
export type CartSource = 'recipe' | 'staple' | 'extra'
export type CartStatus = 'active' | 'completed'

// ── Recipes ──────────────────────────────────────────────────
export interface Recipe {
  id: string
  user_id: string
  name: string
  emoji: string
  prep_time: number | null
  cook_time: number | null
  servings: number
  tags: string[]
  note: string | null
  rating: number | null
  created_at: string
  updated_at: string
  ingredients?: Ingredient[]
}

export interface Ingredient {
  id: string
  recipe_id: string
  name: string
  quantity: number | null
  unit: string | null
  price_estimate: number | null
  sort_order: number
}

// ── Planning ─────────────────────────────────────────────────
export interface WeeklyPlanning {
  id: string
  user_id: string
  week_start: string  // YYYY-MM-DD (Monday)
  day_of_week: number // 0=Mon … 6=Sun
  meal_type: MealType
  recipe_id: string | null
  custom_meal: string | null
  recipe?: Recipe
}

// ── Staples ───────────────────────────────────────────────────
export interface Staple {
  id: string
  user_id: string
  name: string
  brand: string | null
  quantity: number | null
  unit: string | null
  substitute: string | null
  always_add: boolean
  sort_order: number
}

// ── Meal history ─────────────────────────────────────────────
export interface MealHistory {
  id: string
  user_id: string
  recipe_id: string | null
  recipe_name: string
  recipe_emoji: string
  cooked_at: string  // YYYY-MM-DD
  meal_type: MealType | 'other' | null
  note: string | null
  rating: number | null
  created_at: string
}

// ── Cart ─────────────────────────────────────────────────────
export interface CartItem {
  id: string           // local uuid
  name: string
  qty: number | null
  unit: string | null
  price: number | null
  checked: boolean
  source: CartSource
  recipe_name?: string
}

export interface CartSession {
  id: string
  user_id: string
  name: string
  week_start: string | null
  items: CartItem[]
  status: CartStatus
  created_at: string
  completed_at: string | null
}

// ── Forms ─────────────────────────────────────────────────────
export interface RecipeFormValues {
  name: string
  emoji: string
  prep_time: number | ''
  cook_time: number | ''
  servings: number
  tags: string
  note: string
  rating: number | ''
  ingredients: {
    name: string
    quantity: number | ''
    unit: string
    price_estimate: number | ''
  }[]
}

export interface StapleFormValues {
  name: string
  brand: string
  quantity: number | ''
  unit: string
  substitute: string
  always_add: boolean
}
