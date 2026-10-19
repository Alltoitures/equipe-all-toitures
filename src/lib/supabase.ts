import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_KEY as string,
  { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'at-equipe-session' } }
)

export type Role = 'gerant' | 'assistante' | 'chef' | 'ouvrier' | 'apprenti'

export interface Membre {
  id: string
  user_id: string | null
  prenom: string
  nom: string
  telephone: string
  role: Role
  actif: boolean
  invitation_code: string | null
  invitation_expire: string | null
  derniere_connexion: string | null
}

export type Statut = 'a_venir' | 'en_cours' | 'termine'

export interface Chantier {
  id: string
  reference: string | null
  client_nom: string
  adresse: string | null
  code_postal: string | null
  ville: string | null
  date_debut: string | null
  date_fin: string | null
  duree_jours: number | null
  nb_intervenants: number | null
  statut: Statut
  acces: string | null
  consignes: string | null
  vigilance: string | null
  materiaux: string | null
  materiel: string | null
  onedrive_dossier: string | null
  onedrive_item_id?: string | null
  termine_le: string | null
  bon?: Bon | null
}

export type EtatMateriau = 'À prendre' | 'Sur place' | 'Livré' | 'Dépôt'

/** Contenu du bon d'intervention (même structure que le PDF), jamais de prix. */
export interface Bon {
  devis?: string
  emise_le?: string
  sur_place?: string
  sur_place_note?: string
  duree?: string
  duree_note?: string
  intervenants?: string
  intervenants_note?: string
  client_nom?: string
  acces?: string
  objet?: string
  materiaux?: { nom: string; qte?: string; source?: string; etat?: EtatMateriau | string }[]
  materiaux_note?: string
  materiel?: string[]
  vigilance?: string[]
}

export interface Tache {
  id: string
  chantier_id: string
  ordre: number
  libelle: string
  unite: string | null
  quantite: number | null
  fait: boolean
  fait_par: string | null
  fait_le: string | null
  categorie: 'travaux' | 'bordereau'
  numero: string | null
  est_groupe: boolean
}

export type Phase = 'avant' | 'pendant' | 'apres' | 'imprevu'

export interface Photo {
  id: string
  chantier_id: string
  membre_id: string
  phase: Phase
  storage_path: string | null
  nom_fichier: string
  prise_le: string
  onedrive_statut: 'en_attente' | 'envoye' | 'erreur'
}

export type Motif = 'chantier' | 'depot' | 'intemperies_commencee' | 'intemperies_annulee' | 'ecole' | 'absence'

export interface Journee {
  id: string
  membre_id: string
  jour: string
  motif: Motif
  depart: string | null
  retour: string | null
  pause_min: number
  panier: boolean
  panier_manuel: boolean
  commentaire: string | null
  valide: boolean
  journee_chantiers?: { chantier_id: string; heures: number; chantiers?: { client_nom: string } | null }[]
}

export const ROLES: Record<Role, string> = {
  gerant: 'Gérant',
  assistante: 'Assistante',
  chef: 'Chef de chantier',
  ouvrier: 'Ouvrier',
  apprenti: 'Apprenti'
}

export const STATUTS: Record<Statut, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  termine: 'Terminé'
}

export const MOTIFS: Record<Motif, string> = {
  chantier: 'Chantier',
  depot: 'Dépôt (chargement, entretien)',
  intemperies_commencee: 'Intempéries (journée commencée)',
  intemperies_annulee: 'Intempéries (annulée avant départ)',
  ecole: 'École / formation',
  absence: 'Absence / congé'
}

/** Motifs pour lesquels des heures sont payées. */
export const MOTIF_PAYE: Record<Motif, boolean> = {
  chantier: true,
  depot: true,
  intemperies_commencee: true,
  intemperies_annulee: true,
  ecole: true,
  absence: false
}

export function erreurLisible(e: unknown): string {
  const m = (e as { message?: string })?.message ?? String(e)
  if (/Invalid login credentials/i.test(m)) return 'Numéro ou code incorrect.'
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Pas de connexion internet. Réessayez quand le réseau revient.'
  if (/already registered/i.test(m)) return 'Ce compte existe déjà. Demandez une nouvelle invitation au gérant.'
  return m
}
