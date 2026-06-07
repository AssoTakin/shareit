-- ==========================================
-- SCRIPT DE CONFIGURATION DE LA BASE SUPABASE
-- Copiez ce script dans l'éditeur SQL de votre console Supabase.
-- ==========================================

-- 1. Table des foyers (households)
create table if not exists households (
  id text primary key, -- ex: 'PEROUS' (code à 6 lettres)
  name text not null,
  partner1_name text not null,
  partner2_name text not null,
  partner1_salary_default numeric not null,
  partner2_salary_default numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Table des catégories de charges (categories)
create table if not exists categories (
  id text primary key,
  household_id text references households(id) on delete cascade, -- null pour les catégories système globales
  name text not null,
  display_order integer default 0 not null,
  is_default boolean default false not null
);

-- 3. Table des mois de relevés (months)
create table if not exists months (
  id text primary key, -- ex: 'PEROUS_2026_5'
  household_id text references households(id) on delete cascade not null,
  year integer not null,
  month integer not null,
  salary_user1 numeric not null,
  salary_user2 numeric not null,
  status text default 'draft'::text not null, -- 'draft', 'pending_close', 'closed', 'reopened'
  close_requested_by text, -- 'partner1' or 'partner2'
  close_requested_at timestamp with time zone,
  closed_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (household_id, year, month)
);

-- 4. Table des charges (charges)
create table if not exists charges (
  id uuid primary key default gen_random_uuid(),
  month_id text references months(id) on delete cascade not null,
  category_id text references categories(id) on delete cascade not null,
  label text not null,
  amount numeric not null,
  split_method text not null, -- 'proportional', '50_50', 'user1_only', 'user2_only'
  is_recurring boolean default false not null,
  added_by text not null, -- 'partner1' or 'partner2'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. Table des avances (advances)
create table if not exists advances (
  id uuid primary key default gen_random_uuid(),
  month_id text references months(id) on delete cascade not null,
  assigned_to text not null, -- 'partner1' or 'partner2' (qui a avancé l'argent)
  amount numeric not null,
  label text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Table des modèles de charges récurrentes (templates)
create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  household_id text references households(id) on delete cascade not null,
  category_id text references categories(id) on delete cascade not null,
  label text not null,
  default_amount numeric not null,
  split_method text not null, -- 'proportional', '50_50', 'user1_only', 'user2_only'
  is_active boolean default true not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Index pour accélérer les requêtes
create index if not exists idx_months_household on months(household_id);
create index if not exists idx_categories_household on categories(household_id);
create index if not exists idx_charges_month on charges(month_id);
create index if not exists idx_advances_month on advances(month_id);
create index if not exists idx_templates_household on templates(household_id);

-- Seeding des catégories système par défaut (basiques, enfant, autres)
insert into categories (id, household_id, name, display_order, is_default)
values 
  ('basiques', null, 'Charges basiques', 10, true),
  ('maia', null, 'Charges Enfant (Maïa)', 20, true),
  ('autres', null, 'Autres charges', 30, true)
on conflict (id) do update set 
  name = excluded.name, 
  display_order = excluded.display_order;

-- ==========================================
-- ACTIVATION DE SUPABASE REALTIME (TEMPS RÉEL)
-- ==========================================
begin;
  -- Supprimer les tables de la publication si déjà existantes pour éviter des erreurs
  alter publication supabase_realtime drop table if exists households, months, categories, charges, advances, templates;
  
  -- Ajouter les tables à la publication temps réel
  alter publication supabase_realtime add table households;
  alter publication supabase_realtime add table months;
  alter publication supabase_realtime add table categories;
  alter publication supabase_realtime add table charges;
  alter publication supabase_realtime add table advances;
  alter publication supabase_realtime add table templates;
commit;
