-- Lieu de chaque demi-journée : chantier, dépôt ou intempéries.
-- Permet « chantier le matin, dépôt l'après-midi » (le dépôt n'est plus forcément une journée entière).
-- Les heures de chantier restent dans journee_chantiers (avec periode). Le motif de la journée est déduit :
-- intempéries si une demi-journée l'est, sinon chantier si une demi-journée est sur chantier, sinon dépôt.
alter table public.journees
  add column if not exists matin text check (matin is null or matin in ('chantier', 'depot', 'intemperies')),
  add column if not exists apres_midi text check (apres_midi is null or apres_midi in ('chantier', 'depot', 'intemperies'));
comment on column public.journees.matin is 'Lieu du matin : chantier (voir journee_chantiers), depot ou intemperies. Null = ancienne saisie.';
comment on column public.journees.apres_midi is 'Lieu de l''après-midi : chantier (voir journee_chantiers), depot ou intemperies. Null = ancienne saisie.';
