export type PhotoReal = {
  id: string
  nom?: string
  alt?: string
  sujet?: string
  retenue?: boolean
  principale?: boolean
  wp_media_id?: number
  wp_url?: string
}
export type GroupeIntervention = { titre: string; points: string[] }
export type Realisation = {
  id: string
  chantier_id: string
  statut: 'demandee' | 'brouillon' | 'publication' | 'publiee' | 'erreur'
  note: string | null
  temoignage: string | null
  temoin: string | null
  titre: string | null
  slug: string | null
  extrait: string | null
  intro: string | null
  projet: string | null
  contraintes: string | null
  intervention: GroupeIntervention[]
  resultat: string | null
  fiche: { lieu?: string; departement?: string; annee?: string; type_client?: string; materiau?: string; surface?: string; particularite?: string }
  metiers: string[]
  ville: string | null
  photos: PhotoReal[]
  wp_id: number | null
  url: string | null
  erreur: string | null
  demandee_le: string
  brouillon_le: string | null
  publiee_le: string | null
}

export const METIERS_SITE: [string, string][] = [
  ['charpente', 'Charpente'],
  ['couverture', 'Couverture'],
  ['zinguerie', 'Zinguerie'],
  ['fenetres-de-toit', 'Fenêtres de toit'],
  ['ossature-bois', 'Ossature bois'],
  ['entretien', 'Entretien']
]

export const ETATS_REAL: Record<Realisation['statut'], string> = {
  demandee: 'Brouillon en préparation',
  brouillon: 'À valider',
  publication: 'Publication en cours…',
  publiee: 'En ligne',
  erreur: 'Erreur de publication'
}
