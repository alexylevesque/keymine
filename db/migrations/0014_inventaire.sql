-- Inventaire, boutique, craft et four (fonctionnalité ajoutée, hors cahier des charges).
-- Les objets sont identifiés par un code (lib/items.ts) ; la base garde seulement les cases.

-- Une ligne par case occupée. Zones : sac (27 cases), armure (4), table de craft (9), four (3).
create table inventory_items (
  user_id uuid not null references users(id) on delete cascade,
  area text not null check (area in ('bag', 'armor', 'craft', 'furnace_in', 'furnace_fuel', 'furnace_out')),
  slot smallint not null check (slot >= 0 and slot < 27),
  item text not null,
  count int not null check (count between 1 and 64),
  durability int check (durability > 0),
  primary key (user_id, area, slot)
);

-- Four : la cuisson continue page fermée ; le serveur rattrape le temps écoulé depuis updated_at.
create table furnaces (
  user_id uuid primary key references users(id) on delete cascade,
  burn_left smallint not null default 0 check (burn_left between 0 and 8),
  progress_ms int not null default 0 check (progress_ms >= 0),
  updated_at timestamptz not null default now()
);

-- Offres du jour de la boutique (une par case), tirées au premier passage de la journée.
create table shop_offers (
  user_id uuid not null references users(id) on delete cascade,
  day date not null,
  slot smallint not null check (slot between 0 and 5),
  item text not null,
  count int not null check (count > 0),
  price int not null check (price > 0),
  rarity text not null check (rarity in ('common', 'uncommon', 'rare', 'epic')),
  stock int not null check (stock > 0),
  bought int not null default 0 check (bought >= 0 and bought <= stock),
  primary key (user_id, day, slot)
);

-- Objet à usage unique activé pour la prochaine course (pomme, totem…), au plus un.
alter table users add column active_item text;

-- Effets figés au départ de la course (armure + objet) et charbon gagné au podium.
alter table race_participants add column loadout jsonb;
alter table race_participants add column coal_gained int;
