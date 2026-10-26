import { isoJour, lundi } from './format'

/** Contrôle du vendredi : nettoyage et points de sécurité, chaque semaine. */
export const POINTS_VENDREDI = [
  'Cabine nettoyée et rangée',
  'Benne / caisse vidée et balayée',
  'Carrosserie et vitres propres',
  'Outillage rangé et attaché',
  'Pneus : pas de crevaison ni d\'usure visible',
  'Éclairage, clignotants, aucun voyant allumé',
  'Papiers et carte carburant dans le camion'
]

/** Contrôle des niveaux, une fois par mois. */
export const NIVEAUX = ['Huile moteur', 'Liquide de refroidissement', 'Lave-glace', 'AdBlue'] as const
export type EtatNiveau = 'ok' | 'appoint' | 'manque'
export const ETATS_NIVEAU: { v: EtatNiveau; label: string }[] = [
  { v: 'ok', label: 'Niveau OK' },
  { v: 'appoint', label: 'Appoint fait' },
  { v: 'manque', label: 'Manque de produit' }
]

export interface ControleV {
  id: string
  vehicule_id: string
  type: 'hebdo' | 'mensuel'
  jour: string
  km: number | null
  points: Record<string, boolean | string>
  anomalie: string | null
  anomalie_traitee: boolean
  membres: { prenom: string } | null
}

export const debutSemaine = () => lundi(isoJour())
export const debutMois = () => isoJour().slice(0, 8) + '01'

/** Premier vendredi du mois en cours : à partir de là, les niveaux du mois sont attendus. */
export function premierVendredi(): string {
  const d = new Date()
  d.setDate(1)
  while (d.getDay() !== 5) d.setDate(d.getDate() + 1)
  return isoJour(d)
}

export const moisLabel = () => new Date().toLocaleDateString('fr-FR', { month: 'long' })

/** Dernier contrôle de chaque type pour un véhicule, et s'il est à jour. */
export function etatVehicule(vid: string, ctrls: ControleV[]) {
  const hebdo = ctrls.find((c) => c.vehicule_id === vid && c.type === 'hebdo')
  const mensuel = ctrls.find((c) => c.vehicule_id === vid && c.type === 'mensuel')
  return {
    hebdo,
    mensuel,
    vendrediFait: !!hebdo && hebdo.jour >= debutSemaine(),
    niveauxFaits: !!mensuel && mensuel.jour >= debutMois(),
    niveauxDus: isoJour() >= premierVendredi()
  }
}
