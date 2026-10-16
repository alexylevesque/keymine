-- Expérience et niveaux (fonctionnalité ajoutée) : XP totale du compte, XP gagnée ou perdue par
-- course, et raison d'un abandon (volontaire : perte d'un niveau ; déconnexion : aucune perte).
alter table users add column xp_total int not null default 0 check (xp_total >= 0);

alter table race_participants add column xp_gained int;
alter table race_participants
  add column abandon_reason text check (abandon_reason in ('player', 'disconnected'));
