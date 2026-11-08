import type { Journee, Motif } from './supabase'

/** Lieu d'une demi-journée : id du chantier, « depot », « intemperies » ou '' (non renseigné). */
export type Lieu = string
export const DEPOT = 'depot'
export const INTEMPERIES = 'intemperies'

/** Couleurs des chantiers : foncées, texte blanc lisible, bien distinctes entre elles. */
const PALETTE = ['#2e7d32', '#c2410c', '#7c3aed', '#0e7490', '#b45309', '#be185d', '#1d4ed8', '#4d7c0f', '#9f1239', '#0f766e', '#6d28d9', '#a16207']
export const COULEUR_DEPOT = '#6b7780'
export const COULEUR_INTEMPERIES = '#4b6b8a'

/** Couleur fixe d'un chantier (toujours la même pour un même chantier, partout dans l'application). */
export function couleurChantier(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

export function couleurLieu(l: Lieu): string {
  if (l === DEPOT) return COULEUR_DEPOT
  if (l === INTEMPERIES) return COULEUR_INTEMPERIES
  return l ? couleurChantier(l) : '#c9d2da'
}

export const estChantier = (l: Lieu) => !!l && l !== DEPOT && l !== INTEMPERIES
const versColonne = (l: Lieu) => (!l ? null : l === DEPOT ? 'depot' : l === INTEMPERIES ? 'intemperies' : 'chantier')

/** Lieux du matin et de l'après-midi d'une journée enregistrée (y compris les anciennes saisies). */
export function lieuxJournee(j: Journee): { matin: Lieu; aprem: Lieu } {
  const l = j.journee_chantiers ?? []
  const avecPeriode = l.some((r) => r.periode)
  const rm = avecPeriode ? l.find((r) => r.periode === 'matin' || r.periode === 'journee') : l[0]
  const ra = avecPeriode ? l.find((r) => r.periode === 'apres_midi' || r.periode === 'journee') : (l[1] ?? l[0])
  const parDefaut: Lieu = j.motif === 'depot' ? DEPOT : j.motif === 'intemperies_commencee' ? INTEMPERIES : ''
  const lieu = (r: typeof rm, col: string | null | undefined): Lieu =>
    r?.chantier_id ?? (col === 'depot' ? DEPOT : col === 'intemperies' ? INTEMPERIES : col ? '' : parDefaut)
  return { matin: lieu(rm, j.matin), aprem: lieu(ra, j.apres_midi) }
}

/** Motif de la journée déduit des deux demi-journées (une journée travaillée). */
export function motifDesLieux(matin: Lieu, aprem: Lieu): Motif {
  if (matin === INTEMPERIES || aprem === INTEMPERIES) return 'intemperies_commencee'
  if (estChantier(matin) || estChantier(aprem)) return 'chantier'
  return 'depot'
}

export function colonnesLieux(matin: Lieu, aprem: Lieu) {
  return { matin: versColonne(matin), apres_midi: versColonne(aprem) }
}
