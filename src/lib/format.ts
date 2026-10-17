const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Date du jour en heure locale, format AAAA-MM-JJ. */
export function isoJour(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const j = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${j}`
}

export function depuisIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function ajouterJours(s: string, n: number): string {
  const d = depuisIso(s)
  d.setDate(d.getDate() + n)
  return isoJour(d)
}

/** Lundi de la semaine contenant la date. */
export function lundi(s: string = isoJour()): string {
  const d = depuisIso(s)
  const decal = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - decal)
  return isoJour(d)
}

export function dateCourte(s: string | null | undefined): string {
  if (!s) return '—'
  const d = depuisIso(s.slice(0, 10))
  const court = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
  return `${d.getDate()} ${court[d.getMonth()]}`
}

export function dateLongue(s: string): string {
  const d = depuisIso(s)
  return `${JOURS[d.getDay()]} ${d.getDate()} ${MOIS[d.getMonth()]}`
}

export function jourCourt(s: string): string {
  const d = depuisIso(s)
  return `${JOURS[d.getDay()].slice(0, 3)}. ${d.getDate()}`
}

export function moisAnnee(s: string): string {
  const d = depuisIso(s)
  return `${MOIS[d.getMonth()]} ${d.getFullYear()}`
}

export function heureMaintenant(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function minutes(h: string | null): number | null {
  if (!h) return null
  const [a, b] = h.split(':').map(Number)
  return a * 60 + b
}

/** Heures travaillées dépôt à dépôt, pause déduite. */
export function heuresJournee(depart: string | null, retour: string | null, pauseMin: number): number {
  const a = minutes(depart)
  const b = minutes(retour)
  if (a === null || b === null || b <= a) return 0
  return Math.max(0, (b - a - pauseMin) / 60)
}

export function hFormat(h: number): string {
  if (!h) return '0 h'
  const ent = Math.floor(h)
  const min = Math.round((h - ent) * 60)
  return min ? `${ent} h ${String(min).padStart(2, '0')}` : `${ent} h`
}

export function hhmm(t: string | null): string {
  return t ? t.slice(0, 5) : '—'
}

/** Normalise un numéro français en 0XXXXXXXXX. */
export function normaliserTel(t: string): string {
  let d = t.replace(/[^\d+]/g, '')
  if (d.startsWith('+33')) d = '0' + d.slice(3)
  if (d.startsWith('0033')) d = '0' + d.slice(4)
  return d.replace(/\D/g, '')
}

export function telAffiche(t: string): string {
  return t.replace(/(\d{2})(?=\d)/g, '$1 ')
}

export function slugNom(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toUpperCase()
}
