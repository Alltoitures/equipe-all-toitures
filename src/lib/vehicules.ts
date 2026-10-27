import { isoJour, lundi } from './format'

/** Contrôle du vendredi : nettoyage et points de sécurité, chaque semaine. */
export const POINTS_VENDREDI = [
  'Cabine nettoyée et rangée',
  'Benne / caisse vidée et balayée',
  'Carrosserie et vitres propres',
  'Outillage rangé et attaché',
  'Pneus : pas de crevaison ni de choc',
  'Éclairage, clignotants, aucun voyant allumé',
  'Papiers et carte carburant dans le camion'
]

/** Au-delà de ce délai sans vérification, un point d'entretien repasse « à vérifier ». */
export const DELAI_ENTRETIEN = 30

export type Gravite = 'bon' | 'moyen' | 'mauvais'
export interface EtatPoint { v: string; label: string; gravite: Gravite }
export interface PointEntretien { nom: string; aide?: string; etats: EtatPoint[] }

const OK: EtatPoint = { v: 'ok', label: 'OK', gravite: 'bon' }
const A_FAIRE: EtatPoint = { v: 'a_faire', label: 'À faire', gravite: 'mauvais' }
const SURVEILLER: EtatPoint = { v: 'surveiller', label: 'À surveiller', gravite: 'moyen' }

/** Niveaux : OK ou à faire. */
export const NIVEAUX: PointEntretien[] = ['Huile moteur', 'Liquide de refroidissement', 'Lave-glace', 'AdBlue'].map((nom) => ({ nom, etats: [OK, A_FAIRE] }))

/** Usure : plusieurs niveaux. */
export const USURES: PointEntretien[] = [
  { nom: 'Pneus', aide: 'Usure de l\'ensemble des pneus', etats: [{ v: 'neuf', label: 'Neuf', gravite: 'bon' }, { v: 'correct', label: 'Correct', gravite: 'bon' }, SURVEILLER, { v: 'changer', label: 'À changer', gravite: 'mauvais' }] },
  { nom: 'Essuie-glaces', etats: [{ v: 'bon', label: 'Bon', gravite: 'bon' }, SURVEILLER, { v: 'changer', label: 'À changer', gravite: 'mauvais' }] },
  { nom: 'Freins', aide: 'Ressenti au freinage', etats: [{ v: 'bon', label: 'Bon', gravite: 'bon' }, SURVEILLER, { v: 'garage', label: 'À contrôler au garage', gravite: 'mauvais' }] }
]

export const POINTS_ENTRETIEN = [...NIVEAUX, ...USURES]

/** Anciennes valeurs des niveaux (avant octobre 2026). */
const ANCIENS: Record<string, EtatPoint> = {
  appoint: { v: 'appoint', label: 'OK (appoint fait)', gravite: 'bon' },
  manque: { v: 'manque', label: 'À faire', gravite: 'mauvais' }
}

export function etatDe(p: PointEntretien, v: string | undefined): EtatPoint | undefined {
  if (!v) return undefined
  return p.etats.find((e) => e.v === v) ?? ANCIENS[v]
}

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

export interface Releve { etat: EtatPoint; jour: string; prenom: string; age: number; aJour: boolean }

export const debutSemaine = () => lundi(isoJour())
export const ilYaJours = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10)
const age = (jour: string) => Math.round((new Date(isoJour() + 'T12:00').getTime() - new Date(jour + 'T12:00').getTime()) / 864e5)

/** Dernier relevé de chaque point d'entretien (les contrôles doivent être triés du plus récent au plus ancien). */
export function derniersReleves(vid: string, ctrls: ControleV[]): Record<string, Releve> {
  const r: Record<string, Releve> = {}
  for (const c of ctrls) {
    if (c.vehicule_id !== vid || c.type !== 'mensuel') continue
    for (const p of POINTS_ENTRETIEN) {
      if (r[p.nom]) continue
      const etat = etatDe(p, c.points?.[p.nom] as string | undefined)
      if (etat) {
        const a = age(c.jour)
        r[p.nom] = { etat, jour: c.jour, prenom: c.membres?.prenom ?? '—', age: a, aJour: a <= DELAI_ENTRETIEN }
      }
    }
  }
  return r
}

/** État d'un camion : nettoyage de la semaine et entretien (niveaux + usure) de moins de 30 jours. */
export function etatVehicule(vid: string, ctrls: ControleV[]) {
  const hebdo = ctrls.find((c) => c.vehicule_id === vid && c.type === 'hebdo')
  const releves = derniersReleves(vid, ctrls)
  const aVerifier = POINTS_ENTRETIEN.filter((p) => !releves[p.nom]?.aJour).map((p) => p.nom)
  const aReprendre = POINTS_ENTRETIEN.filter((p) => releves[p.nom]?.etat.gravite === 'mauvais').map((p) => p.nom)
  const aSurveiller = POINTS_ENTRETIEN.filter((p) => releves[p.nom]?.etat.gravite === 'moyen').map((p) => p.nom)
  return {
    hebdo,
    vendrediFait: !!hebdo && hebdo.jour >= debutSemaine(),
    releves,
    aVerifier,
    aReprendre,
    aSurveiller,
    entretienAJour: aVerifier.length === 0
  }
}

/** Texte court d'un relevé : « OK · 21/10 · Kevin ». */
export function texteReleve(r: Releve | undefined, dateCourte: (d: string) => string): string {
  if (!r) return 'jamais vérifié'
  return `${r.etat.label} · ${dateCourte(r.jour)} · ${r.prenom}${r.aJour ? '' : ` (il y a ${r.age} j)`}`
}
