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
  modified_by text, -- 'partner1' or 'partner2' (indique qui a modifié le montant en dernier si différent du créateur)
  is_validated boolean default true not null,
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
  modified_by text, -- 'partner1' or 'partner2' (indique qui a modifié le montant en dernier si différent de l'auteur)
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
  ('maia', null, 'Charges Enfant', 20, true),
  ('autres', null, 'Autres charges', 30, true)
on conflict (id) do update set 
  name = excluded.name, 
  display_order = excluded.display_order;

-- ==========================================
-- ACTIVATION DE SUPABASE REALTIME (TEMPS RÉEL)
-- ==========================================
do $$
begin
  begin
    alter publication supabase_realtime add table households;
  exception when others then null;
  end;

  begin
    alter publication supabase_realtime add table months;
  exception when others then null;
  end;

  begin
    alter publication supabase_realtime add table categories;
  exception when others then null;
  end;

  begin
    alter publication supabase_realtime add table charges;
  exception when others then null;
  end;

  begin
    alter publication supabase_realtime add table advances;
  exception when others then null;
  end;

  begin
    alter publication supabase_realtime add table templates;
  exception when others then null;
  end;

  begin
    alter publication supabase_realtime add table activity_logs;
  exception when others then null;
  end;

  begin
    alter publication supabase_realtime add table charge_comments;
  exception when others then null;
  end;
end;
$$;

-- 7. Table des logs d'activités (activity_logs) pour les notifications hors-ligne
create table if not exists activity_logs (
  id uuid primary key default gen_random_uuid(),
  household_id text references households(id) on delete cascade not null,
  actor text not null, -- 'partner1' or 'partner2'
  action_type text not null, -- 'create', 'update', 'delete', 'validate', 'propose_close', 'close', 'reject_close', 'reopen', 'rename_household'
  item_type text not null, -- 'charge', 'advance', 'month', 'category', 'household'
  item_label text not null,
  details text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_activity_logs_household on activity_logs(household_id);

-- 8. Table des commentaires et questions sur les charges (charge_comments)
create table if not exists charge_comments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid references charges(id) on delete cascade not null,
  author text not null, -- 'partner1' or 'partner2'
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_charge_comments_charge on charge_comments(charge_id);

-- 9. Sécurité RLS et Politiques d'Accès Public (Résolution de l'alerte de sécurité Supabase)
alter table households enable row level security;
alter table categories enable row level security;
alter table months enable row level security;
alter table charges enable row level security;
alter table advances enable row level security;
alter table templates enable row level security;
alter table activity_logs enable row level security;
alter table charge_comments enable row level security;

create policy "Allow public access" on households for all using (true) with check (true);
create policy "Allow public access" on categories for all using (true) with check (true);
create policy "Allow public access" on months for all using (true) with check (true);
create policy "Allow public access" on charges for all using (true) with check (true);
create policy "Allow public access" on advances for all using (true) with check (true);
create policy "Allow public access" on templates for all using (true) with check (true);
create policy "Allow public access" on activity_logs for all using (true) with check (true);
create policy "Allow public access" on charge_comments for all using (true) with check (true);

