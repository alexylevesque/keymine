-- CONF-01 : temps maximal « aucun » (0) ou entre 30 secondes et 10 minutes.
-- Les salles existantes hors de ces bornes sont ramenées dans l'intervalle.
update lobbies
set duration_seconds = least(greatest(duration_seconds, 30), 600)
where duration_seconds <> 0;

alter table lobbies drop constraint if exists lobbies_duration_seconds_check;
alter table lobbies
  add constraint lobbies_duration_seconds_check
  check (duration_seconds = 0 or duration_seconds between 30 and 600);
