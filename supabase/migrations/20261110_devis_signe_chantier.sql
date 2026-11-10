-- Un devis qui passe « Signé » dans le Pilotage (synchro de nuit vers finances_pieces)
-- crée tout seul un chantier « À planifier » (sans date), relié par chantiers.pilotage_id = dossier_id.
-- Rien n'est créé si le dossier a déjà un chantier ou s'il est déjà entièrement facturé.
-- Pas de prix dans chantiers.bon : les gars le lisent.
create or replace function prive.devis_signe_vers_chantier() returns trigger
language plpgsql security definer set search_path = public, prive as $$
declare
  signe numeric; facture numeric; prochain int; ref text;
begin
  if new.genre <> 'devis' or new.statut not ilike 'sign%' or new.dossier_id is null then return new; end if;
  if exists (select 1 from chantiers where pilotage_id = new.dossier_id) then return new; end if;
  select coalesce(sum(total_ht),0) into signe from finances_pieces where genre='devis' and statut ilike 'sign%' and dossier_id = new.dossier_id;
  select coalesce(sum(total_ht),0) into facture from finances_pieces where genre='facture' and dossier_id = new.dossier_id;
  if facture >= signe then return new; end if;
  select coalesce(max((regexp_match(reference, '^CH-(?:\d{4}-)?(\d+)$'))[1]::int), 0) + 1 into prochain from chantiers where reference ~ '^CH-';
  ref := 'CH-' || lpad(prochain::text, 3, '0');
  insert into chantiers (reference, client_nom, statut, pilotage_id, bon)
  values (ref, coalesce(nullif(trim(new.client),''),'Client'), 'a_venir', new.dossier_id,
          jsonb_strip_nulls(jsonb_build_object('devis', new.num, 'objet', nullif(trim(new.objet),''), 'auto', true)));
  return new;
end $$;

drop trigger if exists devis_signe_chantier on public.finances_pieces;
create trigger devis_signe_chantier after insert or update of statut on public.finances_pieces
for each row execute function prive.devis_signe_vers_chantier();
