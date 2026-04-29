-- ============================================================
-- La Table — Supabase PostgreSQL Schema
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- Enable UUID extension (already enabled on Supabase by default)
create extension if not exists "uuid-ossp";

-- ============================================================
-- RECIPES
-- ============================================================
create table if not exists recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  emoji         text not null default '🍽️',
  prep_time     int,  -- minutes
  cook_time     int,  -- minutes
  servings      int default 4,
  tags          text[] default '{}',
  note          text,
  rating        int check (rating between 1 and 5),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- INGREDIENTS (linked to recipes)
-- ============================================================
create table if not exists ingredients (
  id              uuid primary key default gen_random_uuid(),
  recipe_id       uuid references recipes(id) on delete cascade not null,
  name            text not null,
  quantity        numeric,
  unit            text,
  price_estimate  numeric,  -- estimated price in euros
  sort_order      int default 0,
  created_at      timestamptz default now()
);

-- ============================================================
-- WEEKLY PLANNING
-- ============================================================
create table if not exists weekly_planning (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  week_start    date not null,  -- always the Monday of the week
  day_of_week   int not null check (day_of_week between 0 and 6),  -- 0=Mon … 6=Sun
  meal_type     text not null check (meal_type in ('lunch', 'dinner')),
  recipe_id     uuid references recipes(id) on delete set null,
  custom_meal   text,  -- free-text when recipe not in DB
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (user_id, week_start, day_of_week, meal_type)
);

-- ============================================================
-- STAPLES (recurring / always-buy products)
-- ============================================================
create table if not exists staples (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text not null,
  brand         text,
  quantity      numeric,
  unit          text,
  substitute    text,
  always_add    boolean default false,
  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ============================================================
-- MEAL HISTORY
-- ============================================================
create table if not exists meal_history (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  recipe_id     uuid references recipes(id) on delete set null,
  recipe_name   text not null,
  recipe_emoji  text default '🍽️',
  cooked_at     date not null default current_date,
  meal_type     text check (meal_type in ('lunch', 'dinner', 'other')),
  note          text,
  rating        int check (rating between 1 and 5),
  created_at    timestamptz default now()
);

-- ============================================================
-- CART SESSIONS
-- ============================================================
create table if not exists cart_sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade not null,
  name          text default 'Courses',
  week_start    date,
  -- items = array of {id, name, qty, unit, price, checked, source: 'recipe'|'staple'|'extra', recipe_name?}
  items         jsonb default '[]'::jsonb,
  status        text default 'active' check (status in ('active', 'completed')),
  created_at    timestamptz default now(),
  completed_at  timestamptz
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Each user can only access their own data
-- ============================================================

alter table recipes        enable row level security;
alter table ingredients    enable row level security;
alter table weekly_planning enable row level security;
alter table staples        enable row level security;
alter table meal_history   enable row level security;
alter table cart_sessions  enable row level security;

-- Recipes
create policy "Users manage own recipes"
  on recipes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Ingredients (access via recipe ownership)
create policy "Users manage ingredients of own recipes"
  on ingredients for all
  using (exists (
    select 1 from recipes r
    where r.id = ingredients.recipe_id and r.user_id = auth.uid()
  ))
  with check (exists (
    select 1 from recipes r
    where r.id = ingredients.recipe_id and r.user_id = auth.uid()
  ));

-- Weekly planning
create policy "Users manage own planning"
  on weekly_planning for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Staples
create policy "Users manage own staples"
  on staples for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Meal history
create policy "Users manage own history"
  on meal_history for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Cart sessions
create policy "Users manage own cart"
  on cart_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ============================================================
-- HELPER: auto-update updated_at
-- ============================================================
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_updated_at
  before update on recipes
  for each row execute procedure handle_updated_at();

create trigger planning_updated_at
  before update on weekly_planning
  for each row execute procedure handle_updated_at();

create trigger staples_updated_at
  before update on staples
  for each row execute procedure handle_updated_at();

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists idx_recipes_user         on recipes(user_id);
create index if not exists idx_ingredients_recipe   on ingredients(recipe_id);
create index if not exists idx_planning_user_week   on weekly_planning(user_id, week_start);
create index if not exists idx_staples_user         on staples(user_id);
create index if not exists idx_history_user_date    on meal_history(user_id, cooked_at desc);
create index if not exists idx_cart_user_status     on cart_sessions(user_id, status);
