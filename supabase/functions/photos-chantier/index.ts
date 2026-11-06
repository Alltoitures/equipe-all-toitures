// Photos d'un chantier et PV de réception.
//  - { chantier, action: 'liste' }            -> photos du chantier (miniature + grande image), classées par phase
//  - { chantier, action: 'pv', reception }    -> fabrique le PV de réception PDF (photos en annexe),
//                                                le range dans « F - Suivi chantier » et le renvoie (base64)
//  - { chantier, action: 'pv-apercu' }      -> même PV, non signé (« PROJET - À SIGNER »), lu par le client avant signature
//  - { visite, action: 'visite-photos' }    -> photos d'une visite (miniatures, légende, commentaire)
//  - { chantier, action: 'pv-lien' }          -> lien de téléchargement du PV déjà rangé dans OneDrive
// Droits : la personne connectée doit voir le chantier (règles de la base).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFImage, type PDFPage } from 'npm:pdf-lib@1.17.1'

const DRIVE = Deno.env.get('ONEDRIVE_DRIVE_ID') ?? 'b!4efKqbnV-EKC_9Z0oks90n3mvlMiPLJFjdsjFcMnwiyAgT6m5zLnSriFuukUJq2m'
const TENANT = Deno.env.get('MS_TENANT_ID') ?? 'f7c2d61b-b7b9-4c0c-ac90-3ed776b9b9de'
const CLIENT = Deno.env.get('MS_CLIENT_ID') ?? 'a43c4593-1b29-4ec5-a006-444054222d62'
const SECRET = Deno.env.get('MS_CLIENT_SECRET')
const GRAPH = 'https://graph.microsoft.com/v1.0'
const LOGO = 'https://equipe-all-toitures.netlify.app/logo-couleur.png'
const MAX_ANNEXE = 24

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const rep = (corps: unknown, statut = 200) => Response.json(corps, { status: statut, headers: CORS })
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

let jetonCache: { v: string; exp: number } | null = null
async function jeton(): Promise<string> {
  if (jetonCache && jetonCache.exp > Date.now() + 60_000) return jetonCache.v
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT, client_secret: SECRET!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' })
  })
  const j = await r.json()
  if (!r.ok) throw new Error('Connexion Microsoft impossible')
  jetonCache = { v: j.access_token, exp: Date.now() + j.expires_in * 1000 }
  return j.access_token
}

type Ligne = { id: string; phase: string; prise_le: string; onedrive_id: string | null; storage_path: string | null; onedrive_statut: string; membres: { prenom: string } | null }
type Photo = { id: string; phase: string; prise_le: string; prenom: string | null; miniature: string | null; grande: string | null; attente: boolean }

/** Miniatures OneDrive par lots de 20 (requête groupée Microsoft Graph). */
async function miniatures(t: string, ids: string[]): Promise<Map<string, { m: string | null; g: string | null }>> {
  const res = new Map<string, { m: string | null; g: string | null }>()
  for (let i = 0; i < ids.length; i += 20) {
    const lot = ids.slice(i, i + 20)
    const r = await fetch(`${GRAPH}/$batch`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests: lot.map((id, n) => ({ id: String(n), method: 'GET', url: `/drives/${DRIVE}/items/${id}/thumbnails?select=medium,large` })) })
    })
    if (!r.ok) continue
    const j = await r.json()
    for (const x of j.responses ?? []) {
      const th = x.body?.value?.[0]
      res.set(lot[Number(x.id)], { m: th?.medium?.url ?? null, g: th?.large?.url ?? null })
    }
  }
  return res
}

async function listerPhotos(chantier: string, t: string | null): Promise<Photo[]> {
  const { data } = await admin
    .from('photos')
    .select('id, phase, prise_le, onedrive_id, storage_path, onedrive_statut, membres(prenom)')
    .eq('chantier_id', chantier)
    .in('phase', ['avant', 'pendant', 'apres', 'imprevu'])
    .order('prise_le')
  const lignes = (data ?? []) as unknown as Ligne[]
  const ids = lignes.filter((l) => l.onedrive_id).map((l) => l.onedrive_id!)
  const th = t && ids.length ? await miniatures(t, ids) : new Map()
  const sortie: Photo[] = []
  for (const l of lignes) {
    let m: string | null = null
    let g: string | null = null
    if (l.onedrive_id && th.has(l.onedrive_id)) ({ m, g } = th.get(l.onedrive_id))
    else if (l.storage_path) {
      const s = await admin.storage.from('photos').createSignedUrl(l.storage_path, 3600)
      m = g = s.data?.signedUrl ?? null
    }
    if (!m && !g) continue
    sortie.push({ id: l.id, phase: l.phase, prise_le: l.prise_le, prenom: l.membres?.prenom ?? null, miniature: m, grande: g, attente: l.onedrive_statut !== 'envoye' })
  }
  return sortie
}

// ---------------------------------------------------------------- PDF
const BLEU = rgb(0.004, 0.45, 0.6)
const NUIT = rgb(0.043, 0.098, 0.13)
const GRIS = rgb(0.42, 0.48, 0.53)
const LIGNE = rgb(0.86, 0.89, 0.92)

/** Les polices standard du PDF ne connaissent que l'alphabet occidental : on remplace le reste. */
function propre(s: string): string {
  return (s ?? '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/\u2026/g, '...').replace(/[\u2013\u2014]/g, '-')
    .replace(/\u00A0|\u202F/g, ' ').replace(/\u00B2/g, '2').replace(/\u00B3/g, '3').replace(/[\u2192]/g, '->')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\u00A0-\u00FF\u0152\u0153\u20AC]/g, '')
}

function couper(texte: string, police: PDFFont, taille: number, largeur: number): string[] {
  const res: string[] = []
  for (const para of propre(texte).split('\n')) {
    let ligne = ''
    for (const mot of para.split(/\s+/)) {
      const essai = ligne ? `${ligne} ${mot}` : mot
      if (police.widthOfTextAtSize(essai, taille) > largeur && ligne) { res.push(ligne); ligne = mot } else ligne = essai
    }
    res.push(ligne)
  }
  return res
}

const dateFr = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' })
const heureFr = (iso: string) => new Date(iso).toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' })
const PHASE: Record<string, string> = { avant: 'Avant travaux', pendant: 'Pendant les travaux', apres: 'Après travaux', imprevu: 'Imprévu' }

async function image(doc: PDFDocument, octets: ArrayBuffer): Promise<PDFImage | null> {
  const u = new Uint8Array(octets)
  try {
    if (u[0] === 0x89 && u[1] === 0x50) return await doc.embedPng(u)
    return await doc.embedJpg(u)
  } catch {
    return null
  }
}

async function telecharger(url: string | null): Promise<ArrayBuffer | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    return r.ok ? await r.arrayBuffer() : null
  } catch {
    return null
  }
}

type Rec = { id: string; signataire: string; sans_reserve: boolean; reserves: string | null; signature_path: string; signe_le: string; membres: { prenom: string; nom: string } | null }
type Ch = { id: string; reference: string | null; client_nom: string; adresse: string | null; code_postal: string | null; ville: string | null; date_debut: string | null; bon: Record<string, unknown> | null; onedrive_item_id: string | null }

const FOND = rgb(0.957, 0.965, 0.976)
const BLEU_CLAIR = rgb(0.004, 0.663, 0.882)
const BLEU_PALE = rgb(0.89, 0.96, 0.99)
const BLANC = rgb(1, 1, 1)
const GRIS_CLAIR = rgb(0.62, 0.7, 0.76)
const LOGO_BLANC = 'https://equipe-all-toitures.netlify.app/logo-blanc.png'
const ENTREPRISE = ['ALL TOITURES - SARL', 'SIREN 910 250 521 - RCS Lyon', '5 ch. du Favier, 69230 Saint-Genis-Laval', 'Entreprise qualifiée QUALIBAT - alltoitures.com']
const MENTION_TOITURE = 'La toiture n\'étant pas accessible au maître d\'ouvrage, la réception est prononcée au vu des photos jointes en annexe, qui font partie intégrante du présent procès-verbal.'

/** Rectangle aux coins arrondis ; (x, haut) = coin supérieur gauche. */
function carte(p: PDFPage, x: number, haut: number, w: number, h: number, o: { fond?: ReturnType<typeof rgb>; bord?: ReturnType<typeof rgb>; r?: number; epaisseur?: number } = {}) {
  const r = Math.min(o.r ?? 8, w / 2, h / 2)
  const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`
  p.drawSvgPath(d, { x, y: haut, color: o.fond, borderColor: o.bord, borderWidth: o.bord ? (o.epaisseur ?? 1) : 0 })
}

/** PV de réception. Sans `r` : aperçu « PROJET - À SIGNER » que le client lit avant de signer. */
async function fabriquerPv(c: Ch, r: Rec | null, photos: Photo[]): Promise<Uint8Array> {
  const apercu = !r
  const date = r?.signe_le ?? new Date().toISOString()
  const doc = await PDFDocument.create()
  doc.setTitle(`PV de réception - ${c.client_nom}`)
  doc.setAuthor('ALL TOITURES')
  const f = await doc.embedFont(StandardFonts.Helvetica)
  const fb = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 44
  const larg = W - 2 * M
  let page: PDFPage = doc.addPage([W, H])
  let y = 0

  const logoB = await telecharger(LOGO_BLANC)
  const logo = (logoB ? await image(doc, logoB) : null) ?? (await (async () => { const o = await telecharger(LOGO); return o ? await image(doc, o) : null })())
  const filigrane = (p: PDFPage) => {
    if (!apercu) return
    const t = 'PROJET - A SIGNER', taille = 58, w = fb.widthOfTextAtSize(t, taille), a = (35 * Math.PI) / 180
    p.drawText(t, { x: W / 2 - (Math.cos(a) * w) / 2 + Math.sin(a) * taille * 0.35, y: H / 2 - (Math.sin(a) * w) / 2 - Math.cos(a) * taille * 0.35, size: taille, font: fb, color: rgb(0.86, 0.9, 0.93), rotate: degrees(35), opacity: 0.5 })
  }
  // Bandeau sombre : grand sur la 1re page, réduit ensuite.
  const bandeau = (p: PDFPage, grand: boolean) => {
    const h = grand ? 118 : 58
    p.drawRectangle({ x: 0, y: H - h, width: W, height: h, color: NUIT })
    p.drawRectangle({ x: 0, y: H - h - 4, width: W, height: 4, color: BLEU_CLAIR })
    if (logo) {
      const lh = grand ? 40 : 24, lw = (logo.width / logo.height) * lh
      p.drawImage(logo, { x: M, y: H - (grand ? 30 : 17) - lh, width: lw, height: lh })
    }
    if (grand) {
      ENTREPRISE.forEach((l, i) => {
        const t = propre(l), police = i ? f : fb, taille = i ? 8 : 9
        p.drawText(t, { x: W - M - police.widthOfTextAtSize(t, taille), y: H - 34 - i * 11.5, size: taille, font: police, color: i ? GRIS_CLAIR : BLANC })
      })
      const sl = propre('« Bâtir votre présent, protéger votre avenir. »')
      p.drawText(sl, { x: M, y: H - 100, size: 8.5, font: f, color: GRIS_CLAIR })
    } else {
      const t = propre(`PV de réception - ${c.client_nom}`)
      p.drawText(t, { x: W - M - f.widthOfTextAtSize(t, 8.5), y: H - 33, size: 8.5, font: f, color: GRIS_CLAIR })
    }
    filigrane(p)
  }
  const nouvellePage = () => { page = doc.addPage([W, H]); bandeau(page, false); y = H - 90 }
  const place = (h: number) => { if (y - h < 64) nouvellePage() }
  const texte = (s: string, o: { taille?: number; gras?: boolean; couleur?: ReturnType<typeof rgb>; x?: number; largeur?: number; interligne?: number } = {}) => {
    const taille = o.taille ?? 10.5, police = o.gras ? fb : f, x = o.x ?? M, lg = o.largeur ?? larg, il = o.interligne ?? taille * 1.42
    for (const l of couper(s, police, taille, lg)) { place(il); page.drawText(l, { x, y: y - taille, size: taille, font: police, color: o.couleur ?? NUIT }); y -= il }
  }
  let nSection = 0
  const titreSection = (s: string, garder = 40) => {
    y -= 18; place(garder)
    nSection++
    const n = String(nSection).padStart(2, '0')
    page.drawText(n, { x: M, y: y - 12, size: 12, font: fb, color: BLEU_CLAIR })
    page.drawText(propre(s.toUpperCase()), { x: M + 24, y: y - 11.5, size: 10, font: fb, color: NUIT })
    page.drawRectangle({ x: M + 24, y: y - 20, width: 28, height: 2, color: BLEU_CLAIR })
    y -= 32
  }

  // ---------- Page 1
  bandeau(page, true)
  y = H - 150
  page.drawText(propre('PROCÈS-VERBAL'), { x: M, y: y - 12, size: 11, font: fb, color: BLEU })
  page.drawText(propre('de réception des travaux'), { x: M, y: y - 38, size: 24, font: fb, color: NUIT })
  page.drawText(propre('Établi conformément à l\'article 1792-6 du Code civil'), { x: M, y: y - 54, size: 9, font: f, color: GRIS })
  y -= 74

  // Cartouche de références
  const refs: [string, string][] = [['N° de chantier', c.reference ?? '-'], ['Devis', c.bon?.devis ? String(c.bon.devis) : '-'], ['Date de réception', dateFr(date)]]
  const lc = (larg - 20) / 3
  refs.forEach(([lib, val], i) => {
    const x = M + i * (lc + 10)
    carte(page, x, y, lc, 46, { fond: FOND })
    page.drawRectangle({ x, y: y - 46, width: 3, height: 46, color: BLEU_CLAIR })
    page.drawText(propre(lib.toUpperCase()), { x: x + 14, y: y - 17, size: 7, font: fb, color: GRIS })
    page.drawText(propre(val), { x: x + 14, y: y - 34, size: 12, font: fb, color: NUIT })
  })
  y -= 46

  // Les parties : deux cartes côte à côte
  titreSection('Les parties')
  const adresse = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const lp = (larg - 12) / 2
  const blocs: [string, string[]][] = [
    ['ENTREPRISE', ['ALL TOITURES', 'Charpente, couverture, zinguerie,', 'ossature bois']],
    ['MAÎTRE D\'OUVRAGE', [c.client_nom, ...couper(adresse || '-', f, 9.5, lp - 28)]]
  ]
  const hp = 22 + Math.max(...blocs.map((b) => b[1].length)) * 13 + 10
  blocs.forEach(([lib, lignes], i) => {
    const x = M + i * (lp + 12)
    carte(page, x, y, lp, hp, { bord: LIGNE })
    page.drawText(propre(lib), { x: x + 14, y: y - 18, size: 7.5, font: fb, color: BLEU })
    lignes.forEach((l, k) => page.drawText(propre(l), { x: x + 14, y: y - 33 - k * 13, size: k ? 9.5 : 11, font: k ? f : fb, color: NUIT }))
  })
  y -= hp + 10
  const objet = (c.bon?.objet as string | undefined) ?? ''
  const infos: [string, string][] = []
  if (objet) infos.push(['Objet des travaux', objet])
  if (c.date_debut) infos.push(['Période des travaux', `du ${dateFr(c.date_debut)} au ${dateFr(date)}`])
  for (const [lib, val] of infos) {
    place(16)
    page.drawText(propre(lib), { x: M, y: y - 10, size: 9, font: fb, color: GRIS })
    const ls = couper(val, f, 10, larg - 120)
    ls.forEach((l, i) => { if (i) place(14); page.drawText(l, { x: M + 120, y: y - 10, size: 10, font: f, color: NUIT }); y -= 14 })
    y -= 2
  }

  // Travaux réalisés : tableau
  const { data: taches } = await admin.from('taches').select('libelle, quantite, unite, categorie, est_groupe, numero, fait').eq('chantier_id', c.id).order('ordre')
  const lignes = ((taches ?? []) as { libelle: string; quantite: number | null; unite: string | null; categorie: string; est_groupe: boolean; numero: string | null; fait: boolean }[])
  const bordereau = lignes.filter((t) => t.categorie === 'bordereau')
  const travaux = bordereau.length ? bordereau : lignes.filter((t) => t.categorie === 'travaux')
  if (travaux.length) {
    titreSection('Travaux réalisés')
    place(22)
    carte(page, M, y, larg, 20, { fond: NUIT, r: 5 })
    page.drawText('DÉSIGNATION', { x: M + 10, y: y - 13.5, size: 7.5, font: fb, color: BLANC })
    page.drawText(propre('QUANTITÉ'), { x: W - M - 10 - fb.widthOfTextAtSize('QUANTITÉ', 7.5), y: y - 13.5, size: 7.5, font: fb, color: BLANC })
    y -= 22
    let pair = false
    for (const t of travaux) {
      if (t.est_groupe) {
        place(22); y -= 4
        page.drawText(propre(t.libelle.toUpperCase()), { x: M + 10, y: y - 11, size: 8.5, font: fb, color: BLEU })
        y -= 18; pair = false
        continue
      }
      const ls = couper(`${t.numero ? t.numero + '   ' : ''}${t.libelle}`, f, 9.5, larg - 110)
      const h = ls.length * 12.5 + 8
      place(h)
      if (pair) page.drawRectangle({ x: M, y: y - h, width: larg, height: h, color: FOND })
      ls.forEach((l, i) => page.drawText(l, { x: M + 10, y: y - 12 - i * 12.5, size: 9.5, font: f, color: NUIT }))
      if (t.quantite != null) {
        const q = propre(`${String(t.quantite).replace('.', ',')} ${t.unite ?? ''}`.trim())
        page.drawText(q, { x: W - M - 10 - fb.widthOfTextAtSize(q, 9.5), y: y - 12, size: 9.5, font: fb, color: NUIT })
      }
      y -= h; pair = !pair
    }
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: LIGNE })
  }

  // ---------- Décision (gardée avec les signatures sur la même page)
  titreSection('Constat et décision du maître d\'ouvrage', 440)
  const hm = couper(MENTION_TOITURE, f, 9.5, larg - 40).length * 13 + 20
  carte(page, M, y, larg, hm, { fond: BLEU_PALE })
  page.drawRectangle({ x: M, y: y - hm, width: 3, height: hm, color: BLEU_CLAIR })
  page.drawText('i', { x: M + 16, y: y - 22, size: 13, font: fb, color: BLEU })
  couper(MENTION_TOITURE, f, 9.5, larg - 40).forEach((l, i) => page.drawText(l, { x: M + 30, y: y - 20 - i * 13, size: 9.5, font: f, color: NUIT }))
  y -= hm + 12

  const lo = (larg - 12) / 2
  const options: [boolean, string, string][] = [
    [!!r && r.sans_reserve, 'SANS RÉSERVE', 'Les travaux sont acceptés en l\'état.'],
    [!!r && !r.sans_reserve, 'AVEC RÉSERVES', 'Réserves détaillées ci-dessous.']
  ]
  options.forEach(([ok, titre, sous], i) => {
    const x = M + i * (lo + 12)
    carte(page, x, y, lo, 52, ok ? { fond: NUIT } : { bord: LIGNE, epaisseur: 1.2 })
    carte(page, x + 14, y - 16, 20, 20, ok ? { fond: BLEU_CLAIR, r: 4 } : { bord: GRIS_CLAIR, r: 4, epaisseur: 1.2 })
    if (ok) page.drawSvgPath('M 4 10 L 8.5 14.5 L 16 5.5', { x: x + 14, y: y - 16, borderColor: BLANC, borderWidth: 2.2 })
    page.drawText(propre(`Réception prononcée`), { x: x + 44, y: y - 21, size: 8, font: f, color: ok ? GRIS_CLAIR : GRIS })
    page.drawText(propre(titre), { x: x + 44, y: y - 34, size: 11, font: fb, color: ok ? BLANC : NUIT })
    page.drawText(propre(sous), { x: x + 44, y: y - 45, size: 7.5, font: f, color: ok ? GRIS_CLAIR : GRIS })
  })
  y -= 64
  // Zone des réserves
  const res = r && !r.sans_reserve && r.reserves ? couper(r.reserves, f, 10, larg - 28) : []
  const hr = apercu ? 62 : res.length ? res.length * 14 + 30 : 0
  if (hr) {
    carte(page, M, y, larg, hr, { bord: LIGNE })
    page.drawText(propre('RÉSERVES'), { x: M + 14, y: y - 16, size: 7.5, font: fb, color: GRIS })
    if (apercu) for (let i = 0; i < 2; i++) page.drawLine({ start: { x: M + 14, y: y - 34 - i * 16 }, end: { x: W - M - 14, y: y - 34 - i * 16 }, thickness: 0.5, color: LIGNE, dashArray: [2, 2] })
    res.forEach((l, i) => page.drawText(l, { x: M + 14, y: y - 32 - i * 14, size: 10, font: f, color: NUIT }))
    y -= hr + 10
  }
  texte('La réception est prononcée contradictoirement à la date ci-dessus. Elle marque le point de départ de la garantie de parfait achèvement (1 an), de la garantie de bon fonctionnement des éléments d\'équipement (2 ans) et de la garantie décennale (10 ans).', { taille: 8.5, couleur: GRIS, interligne: 11.5 })

  // Signatures
  titreSection('Signatures', 170)
  texte(`Fait à ${c.ville ?? '...................'}, le ${dateFr(date)}${r ? ` à ${heureFr(date)}` : ''}.`, { taille: 10 })
  y -= 8
  const ls2 = (larg - 12) / 2
  const xs = [M, M + ls2 + 12]
  const hs = 128
  for (const x of xs) carte(page, x, y, ls2, hs, { bord: LIGNE })
  page.drawText('LE MAÎTRE D\'OUVRAGE', { x: xs[0] + 14, y: y - 18, size: 7.5, font: fb, color: BLEU })
  page.drawText('POUR ALL TOITURES', { x: xs[1] + 14, y: y - 18, size: 7.5, font: fb, color: BLEU })
  page.drawText(propre(r?.signataire ?? c.client_nom), { x: xs[0] + 14, y: y - 33, size: 10.5, font: fb, color: NUIT })
  page.drawText(propre(r ? [r.membres?.prenom, r.membres?.nom].filter(Boolean).join(' ') : ''), { x: xs[1] + 14, y: y - 33, size: 10.5, font: fb, color: NUIT })
  page.drawText(propre('« Lu et approuvé, bon pour réception »'), { x: xs[0] + 14, y: y - 45, size: 7.5, font: f, color: GRIS })
  page.drawLine({ start: { x: xs[0] + 14, y: y - hs + 14 }, end: { x: xs[0] + ls2 - 14, y: y - hs + 14 }, thickness: 0.6, color: LIGNE })
  if (r) {
    const sig = await admin.storage.from('photos').download(r.signature_path)
    if (sig.data) {
      const im = await image(doc, await sig.data.arrayBuffer())
      if (im) {
        const k = Math.min((ls2 - 28) / im.width, 56 / im.height)
        page.drawImage(im, { x: xs[0] + 14, y: y - hs + 16, width: im.width * k, height: im.height * k })
      }
    }
    carte(page, xs[1] + 14, y - 58, ls2 - 28, 44, { fond: FOND, r: 6 })
    page.drawText('Signé électroniquement sur place', { x: xs[1] + 24, y: y - 74, size: 8.5, font: fb, color: NUIT })
    page.drawText(propre(`le ${dateFr(date)} à ${heureFr(date)}`), { x: xs[1] + 24, y: y - 87, size: 8.5, font: f, color: GRIS })
  } else {
    page.drawText(propre('Signature après lecture'), { x: xs[0] + 14, y: y - 90, size: 8.5, font: f, color: GRIS_CLAIR })
  }
  y -= hs + 6

  // ---------- Annexe photos : 2 colonnes x 3 lignes par page
  if (photos.length) {
    const cols = 2, rangs = 3, gap = 14
    const cw = (larg - gap) / cols, chh = (H - 110 - 70 - gap * (rangs - 1)) / rangs - 18
    let i = 0
    for (const p of photos) {
      if (i % (cols * rangs) === 0) {
        page = doc.addPage([W, H]); bandeau(page, false)
        page.drawText(propre('ANNEXE'), { x: M, y: H - 88, size: 9, font: fb, color: BLEU_CLAIR })
        page.drawText(propre(`Photos des travaux${i ? ' (suite)' : ''}`), { x: M + 52, y: H - 88, size: 11, font: fb, color: NUIT })
      }
      const k = i % (cols * rangs), cx = M + (k % cols) * (cw + gap), top = H - 104 - Math.floor(k / cols) * (chh + 18 + gap)
      carte(page, cx, top, cw, chh, { fond: FOND })
      const oct = await telecharger(p.grande ?? p.miniature)
      const im = oct ? await image(doc, oct) : null
      if (im) {
        const sc = Math.min((cw - 8) / im.width, (chh - 8) / im.height), w = im.width * sc, h = im.height * sc
        page.drawImage(im, { x: cx + (cw - w) / 2, y: top - chh + (chh - h) / 2, width: w, height: h })
      }
      const etiquette = propre(PHASE[p.phase] ?? p.phase)
      carte(page, cx, top - chh - 4, 18, 14, { fond: NUIT, r: 3 })
      const nb = String(i + 1)
      page.drawText(nb, { x: cx + 9 - fb.widthOfTextAtSize(nb, 7.5) / 2, y: top - chh - 14, size: 7.5, font: fb, color: BLANC })
      page.drawText(etiquette, { x: cx + 24, y: top - chh - 14, size: 8.5, font: fb, color: NUIT })
      page.drawText(propre(`${dateFr(p.prise_le)}${p.prenom ? ` - ${p.prenom}` : ''}`), { x: cx + 28 + fb.widthOfTextAtSize(etiquette, 8.5), y: top - chh - 14, size: 8, font: f, color: GRIS })
      i++
    }
  }

  // Pieds de page
  const pages = doc.getPages()
  pages.forEach((p, n) => {
    p.drawLine({ start: { x: M, y: 40 }, end: { x: W - M, y: 40 }, thickness: 0.5, color: LIGNE })
    p.drawText('ALL TOITURES', { x: M, y: 26, size: 7.5, font: fb, color: NUIT })
    p.drawText(propre(' - SIREN 910 250 521 - alltoitures.com'), { x: M + fb.widthOfTextAtSize('ALL TOITURES', 7.5), y: 26, size: 7.5, font: f, color: GRIS })
    const t = `${n + 1} / ${pages.length}`
    p.drawText(t, { x: W - M - fb.widthOfTextAtSize(t, 8), y: 26, size: 8, font: fb, color: NUIT })
  })
  return await doc.save()
}

/** Photos retenues pour l'annexe : après, puis avant, puis pendant (24 au plus), dans l'ordre chronologique par phase. */
function choixAnnexe(photos: Photo[]): Photo[] {
  const ordre = ['avant', 'pendant', 'apres']
  const prio = ['apres', 'avant', 'pendant']
  const retenues = new Set<string>()
  for (const ph of prio) for (const p of photos.filter((x) => x.phase === ph)) if (retenues.size < MAX_ANNEXE) retenues.add(p.id)
  return photos.filter((p) => retenues.has(p.id)).sort((a, b) => ordre.indexOf(a.phase) - ordre.indexOf(b.phase) || a.prise_le.localeCompare(b.prise_le))
}

async function dossierSuivi(t: string, c: Ch): Promise<string> {
  const h = { Authorization: `Bearer ${t}` }
  const r = await fetch(`${GRAPH}/drives/${DRIVE}/items/${c.onedrive_item_id}/children?$select=id,name,folder&$top=200`, { headers: h })
  if (!r.ok) throw new Error(`Dossier OneDrive inaccessible (${r.status})`)
  const ex = ((await r.json()).value as { id: string; name: string; folder?: unknown }[]).find((e) => e.folder && /^F\s*-/i.test(e.name))
  if (ex) return ex.id
  const cr = await fetch(`${GRAPH}/drives/${DRIVE}/items/${c.onedrive_item_id}/children`, {
    method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'F - Suivi chantier (planning , CR)', folder: {}, '@microsoft.graph.conflictBehavior': 'rename' })
  })
  if (!cr.ok) throw new Error('Création du dossier F impossible')
  return (await cr.json()).id
}

const nomClient = (s: string) => s.replace(/^(mme et m\.?|mr et mme|m\. et mme|madame|monsieur|mme|mlle|mr|m\.)\s+/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toUpperCase() || 'CHANTIER'

function base64(u: Uint8Array): string {
  let s = ''
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000))
  return btoa(s)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  try {
    const { chantier, visite, action = 'liste', reception } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })

    // Photos d'une visite (pour les revoir dans l'appli, avec légende et commentaire).
    if (action === 'visite-photos') {
      const { data: v } = await sb.from('visites').select('id').eq('id', visite).maybeSingle()
      if (!v) return rep({ erreur: 'Visite inaccessible' }, 403)
      const { data } = await admin.from('photos_visite').select('id, legende, commentaire, prise_le, onedrive_id, storage_path').eq('visite_id', v.id).order('prise_le')
      const lignes = (data ?? []) as { id: string; legende: string | null; commentaire: string | null; prise_le: string; onedrive_id: string | null; storage_path: string | null }[]
      const tv = SECRET ? await jeton() : null
      const ids = lignes.filter((l) => l.onedrive_id).map((l) => l.onedrive_id!)
      const th = tv && ids.length ? await miniatures(tv, ids) : new Map()
      const photos = []
      for (const l of lignes) {
        let m: string | null = null, g: string | null = null
        if (l.onedrive_id && th.has(l.onedrive_id)) ({ m, g } = th.get(l.onedrive_id))
        if (!m && l.storage_path) {
          const u = await admin.storage.from('photos').createSignedUrl(l.storage_path, 3600)
          m = g = u.data?.signedUrl ?? null
        }
        photos.push({ id: l.id, legende: l.legende, commentaire: l.commentaire, prise_le: l.prise_le, miniature: m, grande: g })
      }
      return rep({ photos })
    }

    const { data: c } = await sb.from('chantiers').select('id, reference, client_nom, adresse, code_postal, ville, date_debut, bon, onedrive_item_id').eq('id', chantier).maybeSingle()
    if (!c) return rep({ erreur: 'Chantier inaccessible' }, 403)
    const t = SECRET ? await jeton() : null

    if (action === 'liste') return rep({ photos: await listerPhotos(c.id, t) })

    if (action === 'pv-lien') {
      const { data: r } = await sb.from('receptions').select('pv_onedrive_id').eq('chantier_id', c.id).maybeSingle()
      if (!r?.pv_onedrive_id || !t) return rep({ erreur: 'PV pas encore disponible' }, 404)
      const g = await fetch(`${GRAPH}/drives/${DRIVE}/items/${r.pv_onedrive_id}?$select=id,name,@microsoft.graph.downloadUrl`, { headers: { Authorization: `Bearer ${t}` } })
      const j = await g.json()
      return g.ok ? rep({ lien: j['@microsoft.graph.downloadUrl'], nom: j.name }) : rep({ erreur: 'PV introuvable dans OneDrive' }, 404)
    }

    if (action === 'pv-apercu') {
      const photos = choixAnnexe(await listerPhotos(c.id, t))
      const pdf = await fabriquerPv(c as Ch, null, photos)
      return rep({ nom: `PV_reception_${nomClient(c.client_nom)}_a_signer.pdf`, photos: photos.length, pdf: base64(pdf) })
    }

    if (action === 'pv') {
      const { data: r } = await admin.from('receptions').select('id, signataire, sans_reserve, reserves, signature_path, signe_le, membres(prenom, nom)').eq('id', reception).eq('chantier_id', c.id).maybeSingle()
      if (!r) return rep({ erreur: 'Réception introuvable' }, 404)
      const photos = choixAnnexe(await listerPhotos(c.id, t))
      const pdf = await fabriquerPv(c as Ch, r as unknown as Rec, photos)
      const nom = `${new Date(r.signe_le).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })}_${nomClient(c.client_nom)}_PV_reception_${r.sans_reserve ? 'sans_reserve' : 'avec_reserves'}.pdf`
      let range = false
      if (t && c.onedrive_item_id) {
        try {
          const dossier = await dossierSuivi(t, c as Ch)
          const up = await fetch(`${GRAPH}/drives/${DRIVE}/items/${dossier}:/${encodeURIComponent(nom)}:/content?@microsoft.graph.conflictBehavior=replace`, {
            method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/pdf' }, body: pdf
          })
          const j = await up.json()
          if (!up.ok) throw new Error(j.error?.message ?? String(up.status))
          await admin.from('receptions').update({ pv_onedrive_id: j.id, pv_nom: j.name, pv_erreur: null }).eq('id', r.id)
          range = true
        } catch (e) {
          await admin.from('receptions').update({ pv_erreur: String((e as Error).message).slice(0, 300) }).eq('id', r.id)
        }
      }
      return rep({ nom, range, photos: photos.length, pdf: base64(pdf) })
    }
    return rep({ erreur: 'Action inconnue' }, 400)
  } catch (e) {
    return rep({ erreur: String((e as Error).message) }, 500)
  }
})
