-- Classement (fonctionnalité ajoutée) : prix de la semaine (courses gagnées, meilleur MPM), attribués
-- une seule fois par semaine, puis récupérés par chaque gagnant ; bonus d'XP de 7 jours.
create table weekly_settlements (
  week_start date primary key,
  settled_at timestamptz not null default now()
);

create table weekly_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  week_start date not null,
  kind text not null check (kind in ('wins', 'wpm')),
  rank int not null check (rank >= 1),
  xp int not null default 0 check (xp >= 0),
  items jsonb not null default '[]',
  boost real not null default 0 check (boost >= 0 and boost <= 1),
  claimed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, week_start, kind)
);

create index weekly_rewards_week_idx on weekly_rewards (week_start, kind, rank);

alter table users add column xp_boost real not null default 0;
alter table users add column xp_boost_until timestamptz;

-- Les victoires et les classements de la semaine filtrent sur la date d'arrivée.
create index race_participants_wins_idx on race_participants (user_id, finished_at)
  where status = 'finished' and rank = 1 and role = 'participant';

-- Classes (bronze 0, argent 1, or 2, diamant 3, netherite 4) : chacun est classé contre sa classe.
alter table users add column league smallint not null default 0 check (league between 0 and 4);
alter table weekly_rewards add column league smallint not null default 0;

-- Résultat de chaque semaine pour chaque joueur actif : place dans sa classe, montée ou descente.
create table league_history (
  user_id uuid not null references users(id) on delete cascade,
  week_start date not null,
  from_league smallint not null,
  to_league smallint not null,
  position int not null,
  wins int not null,
  primary key (user_id, week_start)
);
