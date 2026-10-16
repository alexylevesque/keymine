-- Table d'enchantement (fonctionnalité ajoutée) : enchantements définitifs des pièces d'armure,
-- nouvelle case « enchant » de l'inventaire, et graine secrète des trois choix de la table.
alter table inventory_items add column enchants jsonb;

alter table inventory_items drop constraint inventory_items_area_check;
alter table inventory_items add constraint inventory_items_area_check
  check (area in ('bag', 'armor', 'craft', 'furnace_in', 'furnace_fuel', 'furnace_out', 'enchant'));

alter table users add column enchant_seed int not null default floor(random() * 2000000000)::int;
