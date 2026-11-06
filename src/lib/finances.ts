import { supabase } from './supabase'
import { isoJour } from './format'

/** Devis et factures du Pilotage, recopiés chaque nuit (gérant uniquement). */
export interface Piece {
  id: string
  genre: 'devis' | 'facture'
  num: string | null
  client: string | null
  objet: string | null
  dossier_id: string | null
  date: string | null
  echeance: string | null
  statut: string | null
  type_facture: string | null
  total_ht: number
  total_ttc: number
  paye_ttc: number
  paye_le: string | null
  synchro_le: string
}

export const eur = (n: number) => {
  const a = Math.abs(n)
  if (a >= 100000) return `${Math.round(n / 1000)} k€`
  if (a >= 10000) return `${(n / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} k€`
  return `${Math.round(n).toLocaleString('fr-FR')} €`
}

const s = (x: string | null) => (x ?? '').toLowerCase()
export const estSigne = (p: Piece) => /sign|accept/.test(s(p.statut))
export const estPerdu = (p: Piece) => /refus|perdu|sans suite|annul/.test(s(p.statut))
export const estEnvoye = (p: Piece) => /envoy|attente|relanc/.test(s(p.statut))
export const estBrouillon = (p: Piece) => /brouillon/.test(s(p.statut)) || !p.statut
const factureValide = (p: Piece) => p.genre === 'facture' && !/brouillon|annul/.test(s(p.statut))

const jours = (a: string, b: string) => Math.round((new Date(b + 'T12:00').getTime() - new Date(a + 'T12:00').getTime()) / 864e5)

export function calculer(pieces: Piece[], objectif: number | null, auj = isoJour()) {
  const an = auj.slice(0, 4)
  const mois = auj.slice(0, 7)
  const factures = pieces.filter(factureValide)
  const devis = pieces.filter((p) => p.genre === 'devis')

  const caAnnee = factures.filter((f) => f.date?.startsWith(an)).reduce((t, f) => t + Number(f.total_ht), 0)
  const memeDateN1 = `${Number(an) - 1}${auj.slice(4)}`
  const caN1 = factures.filter((f) => f.date && f.date.startsWith(String(Number(an) - 1)) && f.date <= memeDateN1).reduce((t, f) => t + Number(f.total_ht), 0)
  const caMois = factures.filter((f) => f.date?.startsWith(mois)).reduce((t, f) => t + Number(f.total_ht), 0)

  // Moyenne mensuelle sur les mois de l'année qui ont des factures (l'historique démarre avec le Pilotage).
  const premier = factures.filter((f) => f.date?.startsWith(an)).map((f) => f.date!.slice(0, 7)).sort()[0]
  const nbMois = premier ? Number(mois.slice(5, 7)) - Number(premier.slice(5, 7)) + (Number(auj.slice(8, 10)) / 30) : 0
  const moyMois = nbMois > 0 ? caAnnee / nbMois : 0
  const dossiers = new Set(factures.filter((f) => f.date?.startsWith(an)).map((f) => f.dossier_id ?? f.id))
  const panier = dossiers.size ? caAnnee / dossiers.size : 0

  // 12 mois glissants, avec l'année précédente.
  const barres = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Number(an), Number(mois.slice(5, 7)) - 12 + i, 1)
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const mN1 = `${d.getFullYear() - 1}-${m.slice(5)}`
    const somme = (k: string) => factures.filter((f) => f.date?.startsWith(k)).reduce((t, f) => t + Number(f.total_ht), 0)
    return { mois: m, ca: somme(m), n1: somme(mN1), courant: m === mois }
  })

  // Trésorerie clients (TTC : ce que le client paie).
  const ouvertes = factures.map((f) => ({ f, reste: Number(f.total_ttc) - Number(f.paye_ttc) })).filter((x) => x.reste > 1)
  const retard = ouvertes.filter((x) => x.f.echeance && x.f.echeance < auj).map((x) => ({ ...x, jours: jours(x.f.echeance!, auj) })).sort((a, b) => b.jours - a.jours)
  const aEncaisser = ouvertes.filter((x) => !x.f.echeance || x.f.echeance >= auj)
  const encaisseMois = factures.filter((f) => f.paye_le?.startsWith(mois)).reduce((t, f) => t + Number(f.paye_ttc), 0)

  // Devant nous : signé pas encore facturé, devis en attente.
  const factureParDossier = new Map<string, number>()
  for (const f of factures) if (f.dossier_id) factureParDossier.set(f.dossier_id, (factureParDossier.get(f.dossier_id) ?? 0) + Number(f.total_ht))
  const carnet = devis.filter(estSigne).reduce((t, d) => t + Math.max(0, Number(d.total_ht) - (d.dossier_id ? factureParDossier.get(d.dossier_id) ?? 0 : 0)), 0)
  const semaines = moyMois > 0 ? carnet / (moyMois / 4.33) : null
  const attente = devis.filter(estEnvoye)
  const attenteVieux = attente.filter((d) => d.date && jours(d.date, auj) > 30)
  const brouillons = devis.filter((d) => estBrouillon(d))

  // Signature sur 6 mois : en montant et en nombre, parmi les devis tranchés.
  const depuis = new Date(Date.now() - 183 * 864e5).toISOString().slice(0, 10)
  const tranches = devis.filter((d) => d.date && d.date >= depuis && (estSigne(d) || estPerdu(d)))
  const signesEur = tranches.filter(estSigne).reduce((t, d) => t + Number(d.total_ht), 0)
  const totalEur = tranches.reduce((t, d) => t + Number(d.total_ht), 0)
  const tauxEur = totalEur ? signesEur / totalEur : null
  const tauxNb = tranches.length ? tranches.filter(estSigne).length / tranches.length : null

  const avancement = objectif ? caAnnee / objectif : null
  const debutAn = `${an}-01-01`
  const rythme = objectif ? (jours(debutAn, auj) + 1) / (Number(an) % 4 === 0 ? 366 : 365) : null
  const semainesRestantes = Math.max(0, Math.round(jours(auj, `${an}-12-31`) / 7))

  return {
    an, caAnnee, caN1, evolution: caN1 > 0 ? caAnnee / caN1 - 1 : null, caMois, moyMois, panier,
    barres, retard, aEncaisser, encaisseMois, nbPaiementsMois: factures.filter((f) => f.paye_le?.startsWith(mois)).length,
    carnet, semaines, attente, attenteVieux, brouillons,
    tauxEur, tauxNb, nbTranches: tranches.length,
    objectif, avancement, rythme, semainesRestantes, premier,
    derniereSynchro: pieces.map((p) => p.synchro_le).sort().pop() ?? null
  }
}

export async function chargerFinances() {
  const [p, r] = await Promise.all([
    supabase.from('finances_pieces').select('*'),
    supabase.from('reglages_gerant').select('valeur').eq('cle', `objectif_ca_${isoJour().slice(0, 4)}`).maybeSingle()
  ])
  const v = r.data?.valeur as { montant?: number } | null
  return { pieces: (p.data ?? []) as Piece[], objectif: v?.montant ?? null, erreur: p.error?.message ?? null }
}

export async function enregistrerObjectif(montant: number) {
  return supabase.from('reglages_gerant').upsert({ cle: `objectif_ca_${isoJour().slice(0, 4)}`, valeur: { montant }, maj_le: new Date().toISOString() })
}
