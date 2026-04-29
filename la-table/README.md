# 🍽️ La Table — Planificateur de repas familial

Application web Next.js 14 pour planifier les repas, gérer les recettes et générer la liste de courses.

## Stack

| Couche | Technologie |
|---|---|
| Framework | Next.js 14 (App Router) |
| Langage | TypeScript |
| Style | Tailwind CSS + tokens crème/terra cotta |
| Composants | shadcn/ui + Radix UI |
| Backend / Auth | Supabase (PostgreSQL + Auth Google) |
| Déploiement | Vercel |

## Fonctionnalités

- **Auth Google** via Supabase (multi-utilisateurs, accès partagé)
- **CRUD recettes** : nom, emoji, ingrédients+quantités+prix, temps, tags, note, note /5
- **Planning calendrier 7j** (déjeuner + dîner) avec navigation semaine précédente/suivante
- **Incontournables** : produits récurrents avec marque, quantité, substitut et ajout auto au panier
- **Bouton 🛒** sur chaque recette → pop-up sélection des ingrédients → ajout au panier
- **Articles extra** : liste libre envoyable au panier
- **Panier** : session active, cochetage des articles, estimation du total, marquage "terminé"
- **Historique** : repas cuisinés avec notes et étoiles, groupés par semaine
- **PWA** : manifest + mode hors-ligne partiel

## Structure des fichiers

```
la-table/
├── app/
│   ├── (auth)/login/          # Page de connexion Google
│   ├── (dashboard)/           # Zone protégée (layout sidebar + bottom nav)
│   │   ├── page.tsx           # Planning 7 jours
│   │   ├── recipes/           # Liste + détail + création + édition
│   │   ├── staples/           # Incontournables
│   │   ├── cart/              # Panier actif
│   │   ├── extras/            # Articles ponctuels
│   │   └── history/           # Historique des repas
│   └── api/planning/          # Route API (navigation entre semaines)
├── components/
│   ├── layout/                # Sidebar (desktop) + BottomNav (mobile)
│   ├── recipes/               # RecipeCard, RecipeForm, CartModal
│   ├── planning/              # WeekCalendar, MealSlot
│   ├── staples/               # StapleItem, StapleForm
│   └── cart/                  # CartItemRow
├── lib/
│   ├── supabase/              # client.ts (browser) + server.ts (RSC)
│   ├── types.ts               # Toutes les interfaces TypeScript
│   └── utils.ts               # cn(), formatDate, totalTime…
├── middleware.ts              # Protection des routes + refresh session
└── supabase/schema.sql        # Schéma complet + RLS + index
```

## Installation

### 1. Cloner et installer

```bash
cd la-table
npm install
```

### 2. Configurer Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Dans **SQL Editor**, coller et exécuter `supabase/schema.sql`
3. Dans **Authentication → Providers**, activer **Google** et renseigner les credentials OAuth

### 3. Variables d'environnement

```bash
cp .env.example .env.local
```

Remplir `.env.local` :
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### 4. Lancer en développement

```bash
npm run dev
# → http://localhost:3000
```

## Déploiement Vercel

1. Pousser le dossier `la-table/` (ou le repo entier) sur GitHub
2. Dans Vercel, importer le projet en précisant **Root Directory = `la-table`**
3. Ajouter les variables d'environnement (avec `NEXT_PUBLIC_SITE_URL` = ton domaine Vercel)
4. Dans Supabase → Auth → URL Configuration, ajouter l'URL Vercel comme **Site URL** et `https://ton-domaine.vercel.app/auth/callback` comme **Redirect URL**

## Schéma Supabase

| Table | Rôle |
|---|---|
| `recipes` | Recettes avec emoji, temps, tags, note |
| `ingredients` | Ingrédients liés à une recette (qté, unité, prix/u) |
| `weekly_planning` | Slot jour × type de repas → recette |
| `staples` | Produits incontournables avec substitut |
| `meal_history` | Historique des repas cuisinés |
| `cart_sessions` | Panier actif (items JSONB) |

Toutes les tables ont **RLS activé** : chaque utilisateur ne voit que ses propres données.
