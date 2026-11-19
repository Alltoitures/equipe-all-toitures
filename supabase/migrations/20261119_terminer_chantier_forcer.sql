-- « Chantier terminé » : le gérant (ou l'assistante) peut forcer la clôture sans photo « après »
-- (ex. client absent en fin de chantier). Les compagnons restent bloqués avec un message clair.
drop function if exists public.terminer_chantier(uuid);

create or replace function public.terminer_chantier(c uuid, forcer boolean default false)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  r text;
begin
  if not public.voit_chantier(c) then raise exception 'Accès refusé'; end if;
  if not exists (select 1 from public.photos where chantier_id = c and phase = 'apres') then
    select m.role into r from public.membres m where m.id = public.moi();
    if not (forcer and r in ('gerant', 'assistante')) then
      raise exception 'Ajoutez au moins une photo « après » avant de terminer le chantier';
    end if;
  end if;
  update public.chantiers set statut = 'termine', termine_le = now(), termine_par = public.moi() where id = c;
end $function$;

revoke execute on function public.terminer_chantier(uuid, boolean) from public, anon;
grant execute on function public.terminer_chantier(uuid, boolean) to authenticated;
notify pgrst, 'reload schema';
