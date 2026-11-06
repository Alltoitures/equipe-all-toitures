-- Heures par demi-journée (matin / après-midi) et notification de validation au gérant.
alter table public.journee_chantiers
  add column if not exists periode text
  check (periode is null or periode in ('matin', 'apres_midi', 'journee'));
comment on column public.journee_chantiers.periode is 'Demi-journée sur ce chantier : matin, apres_midi ou journee (null = ancienne saisie libre).';

-- Vendredi 18 h et lundi 8 h (heure de Paris, vérifiée dans la fonction notifier).
select cron.schedule('notif-heures-a-valider-vendredi', '0 16,17 * * 5', $$ select prive.appeler_notifier(jsonb_build_object('cron', 'heures_a_valider')) $$);
select cron.schedule('notif-heures-a-valider-lundi', '0 6,7 * * 1', $$ select prive.appeler_notifier(jsonb_build_object('cron', 'heures_a_valider')) $$);
