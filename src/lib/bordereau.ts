// Structure du bordereau : titres (niveau 1) > sous-titres (niveau 2) > ouvrages.
// Les déplacements emmènent toujours le contenu du groupe, et la numérotation suit.

export type LigneBordereau = {
  id?: string
  categorie: 'travaux' | 'bordereau'
  numero: string
  est_groupe: boolean
  niveau: 1 | 2
  libelle: string
  quantite: string
  unite: string
}

type Sous = { g: LigneBordereau; lignes: LigneBordereau[] }
type Titre = { g: LigneBordereau; lignes: LigneBordereau[]; sous: Sous[] }
type Arbre = { lignes: LigneBordereau[]; titres: Titre[] }

const PREFIXE = /^\s*(\d+(?:\.\d+)*)\s*[·•]\s*(.*)$/

/** « 1.2 · Charpente » → numéro 1.2, niveau 2, libellé « Charpente ». */
export function lireGroupe(libelle: string): { numero: string; niveau: 1 | 2; libelle: string } {
  const m = libelle.match(PREFIXE)
  if (!m) return { numero: '', niveau: 1, libelle }
  return { numero: m[1], niveau: m[1].includes('.') ? 2 : 1, libelle: m[2] }
}

/** Libellé enregistré pour un groupe : le numéro reste dans le texte, comme aujourd'hui. */
export function ecrireGroupe(l: LigneBordereau): string {
  const t = l.libelle.trim()
  return l.numero.trim() ? `${l.numero.trim()} · ${t}` : t
}

function versArbre(liste: LigneBordereau[]): Arbre {
  const a: Arbre = { lignes: [], titres: [] }
  let t: Titre | null = null
  let s: Sous | null = null
  for (const x of liste) {
    if (x.est_groupe && (x.niveau === 1 || !t)) {
      x.niveau = 1
      t = { g: x, lignes: [], sous: [] }
      a.titres.push(t)
      s = null
    } else if (x.est_groupe) {
      s = { g: x, lignes: [] }
      t!.sous.push(s)
    } else (s ? s.lignes : t ? t.lignes : a.lignes).push(x)
  }
  return a
}

function aplatir(a: Arbre): LigneBordereau[] {
  const r = [...a.lignes]
  for (const t of a.titres) {
    r.push(t.g, ...t.lignes)
    for (const s of t.sous) r.push(s.g, ...s.lignes)
  }
  return r
}

const garde = (n: string) => /^[—–-]$/.test(n.trim())

function numeroter(a: Arbre) {
  let n = 0
  const ligne = (x: LigneBordereau, base: string, k: () => number) => { if (!garde(x.numero)) x.numero = base + k() }
  for (const x of a.lignes) ligne(x, '', () => ++n)
  for (const t of a.titres) {
    const nt = String(++n)
    t.g.numero = nt
    let m = 0
    for (const x of t.lignes) ligne(x, nt + '.', () => ++m)
    for (const s of t.sous) {
      const ns = `${nt}.${++m}`
      s.g.numero = ns
      let k = 0
      for (const x of s.lignes) ligne(x, ns + '.', () => ++k)
    }
  }
}

/** Applique une opération sur une copie de la liste, puis renumérote si demandé. */
function operer(liste: LigneBordereau[], i: number, auto: boolean, op: (a: Arbre, cible: LigneBordereau) => void): LigneBordereau[] {
  const copie = liste.map((x) => ({ ...x }))
  const a = versArbre(copie)
  op(a, copie[i])
  if (auto) numeroter(a)
  return aplatir(a)
}

export function renumeroter(liste: LigneBordereau[]): LigneBordereau[] {
  return operer(liste, -1, true, () => {})
}

/** Monte (-1) ou descend (+1) un ouvrage ; en bout de groupe, il passe dans le groupe voisin. */
export function deplacerLigne(liste: LigneBordereau[], i: number, sens: -1 | 1, auto: boolean) {
  return operer(liste, i, auto, (a, x) => {
    const boites = [a.lignes, ...a.titres.flatMap((t) => [t.lignes, ...t.sous.map((s) => s.lignes)])]
    const bi = boites.findIndex((b) => b.includes(x))
    const b = boites[bi]
    const p = b.indexOf(x)
    if (sens < 0 && p > 0) [b[p - 1], b[p]] = [b[p], b[p - 1]]
    else if (sens > 0 && p < b.length - 1) [b[p + 1], b[p]] = [b[p], b[p + 1]]
    else if (sens < 0 && bi > 0) { b.splice(p, 1); boites[bi - 1].push(x) }
    else if (sens > 0 && bi < boites.length - 1) { b.splice(p, 1); boites[bi + 1].unshift(x) }
  })
}

/** Monte ou descend un titre ou un sous-titre avec tout son contenu. */
export function deplacerGroupe(liste: LigneBordereau[], i: number, sens: -1 | 1, auto: boolean) {
  return operer(liste, i, auto, (a, g) => {
    const ti = a.titres.findIndex((t) => t.g === g)
    if (ti >= 0) {
      const j = ti + sens
      if (j >= 0 && j < a.titres.length) [a.titres[ti], a.titres[j]] = [a.titres[j], a.titres[ti]]
      return
    }
    const pi = a.titres.findIndex((t) => t.sous.some((s) => s.g === g))
    if (pi < 0) return
    const sous = a.titres[pi].sous
    const si = sous.findIndex((s) => s.g === g)
    const j = si + sens
    if (j >= 0 && j < sous.length) [sous[si], sous[j]] = [sous[j], sous[si]]
    else if (sens < 0 && pi > 0) a.titres[pi - 1].sous.push(...sous.splice(si, 1))
    else if (sens > 0 && pi < a.titres.length - 1) a.titres[pi + 1].sous.unshift(...sous.splice(si, 1))
  })
}

/** Titre → sous-titre du titre précédent, ou sous-titre → titre (sans changer l'ordre affiché). */
export function changerNiveau(liste: LigneBordereau[], i: number, auto: boolean) {
  return operer(liste, i, auto, (a, g) => {
    const ti = a.titres.findIndex((t) => t.g === g)
    if (ti > 0) {
      const [t] = a.titres.splice(ti, 1)
      g.niveau = 2
      a.titres[ti - 1].sous.push({ g, lignes: t.lignes }, ...t.sous)
      return
    }
    const pi = a.titres.findIndex((t) => t.sous.some((s) => s.g === g))
    if (pi < 0) return
    const sous = a.titres[pi].sous
    const si = sous.findIndex((s) => s.g === g)
    const [s] = sous.splice(si, 1)
    g.niveau = 1
    a.titres.splice(pi + 1, 0, { g, lignes: s.lignes, sous: sous.splice(si) })
  })
}

/** Le titre peut-il devenir sous-titre ? (il faut un titre au-dessus) */
export function peutDescendreNiveau(liste: LigneBordereau[], i: number) {
  return liste.slice(0, i).some((x) => x.est_groupe)
}

/** Supprime une ligne ; un groupe supprimé laisse ses ouvrages au groupe précédent. */
export function retirer(liste: LigneBordereau[], i: number, auto: boolean) {
  const r = liste.filter((_, k) => k !== i)
  return auto ? renumeroter(r) : r
}

export function ajouter(liste: LigneBordereau[], l: LigneBordereau, auto: boolean) {
  const r = [...liste, l]
  return auto ? renumeroter(r) : r
}

/** Numérotation automatique proposée si les numéros existants sont du type 1, 1.2, 1.2.3 (ou vides). */
export function numerotationStandard(liste: LigneBordereau[]) {
  return liste.every((x) => !x.numero.trim() || /^\d+(\.\d+)*$/.test(x.numero.trim()) || garde(x.numero))
}
