// Photos d'un chantier et PV de réception.
//  - { chantier, action: 'liste' }            -> photos du chantier (miniature + grande image), classées par phase
//  - { chantier, action: 'pv', reception }    -> fabrique le PV de réception PDF (photos en annexe),
//                                                le range dans « F - Suivi chantier » et le renvoie (base64)
//  - { chantier, action: 'pv-apercu' }      -> même PV, non signé (« PROJET - À SIGNER »), lu par le client avant signature
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

const FOND = rgb(0.953, 0.965, 0.976)
const ENTREPRISE = ['ALL TOITURES - SARL', 'SIREN 910 250 521 - RCS Lyon', '5 ch. du Favier, 69230 Saint-Genis-Laval', 'Entreprise qualifiée QUALIBAT - alltoitures.com']
const MENTION_TOITURE = 'La toiture n\'étant pas accessible au maître d\'ouvrage, la réception est prononcée au vu des photos jointes en annexe, qui font partie intégrante du présent procès-verbal.'

/** PV de réception. Sans `r` : aperçu « PROJET - À SIGNER » que le client lit avant de signer. */
async function fabriquerPv(c: Ch, r: Rec | null, photos: Photo[]): Promise<Uint8Array> {
  const apercu = !r
  const date = r?.signe_le ?? new Date().toISOString()
  const doc = await PDFDocument.create()
  doc.setTitle(`PV de réception - ${c.client_nom}`)
  doc.setAuthor('ALL TOITURES')
  const f = await doc.embedFont(StandardFonts.Helvetica)
  const fb = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 48
  let page: PDFPage = doc.addPage([W, H])
  let y = H - M

  const logoOct = await telecharger(LOGO)
  const logo = logoOct ? await image(doc, logoOct) : null
  const droite = (p: PDFPage, s: string, yy: number, taille: number, police = f, couleur = GRIS) =>
    p.drawText(propre(s), { x: W - M - police.widthOfTextAtSize(propre(s), taille), y: yy, size: taille, font: police, color: couleur })
  const entete = (p: PDFPage) => {
    if (logo) {
      const h = 40, w = (logo.width / logo.height) * h
      p.drawImage(logo, { x: M, y: H - M - h + 8, width: w, height: h })
    } else p.drawText('ALL TOITURES', { x: M, y: H - M - 16, size: 16, font: fb, color: BLEU })
    droite(p, ENTREPRISE[0], H - M - 2, 8.5, fb, NUIT)
    ENTREPRISE.slice(1).forEach((l, i) => droite(p, l, H - M - 13 - i * 10.5, 8))
    p.drawRectangle({ x: M, y: H - M - 48, width: W - 2 * M, height: 2, color: BLEU })
    if (apercu) {
      // Filigrane : document non signé.
      const t = 'PROJET - A SIGNER', taille = 58, w = fb.widthOfTextAtSize(t, taille), a = (35 * Math.PI) / 180
      p.drawText(t, { x: W / 2 - (Math.cos(a) * w) / 2 + Math.sin(a) * taille * 0.35, y: H / 2 - (Math.sin(a) * w) / 2 - Math.cos(a) * taille * 0.35, size: taille, font: fb, color: rgb(0.85, 0.89, 0.92), rotate: degrees(35), opacity: 0.5 })
    }
  }
  const nouvellePage = () => { page = doc.addPage([W, H]); entete(page); y = H - M - 70 }
  const place = (h: number) => { if (y - h < 70) nouvellePage() }
  const texte = (s: string, o: { taille?: number; gras?: boolean; couleur?: ReturnType<typeof rgb>; x?: number; largeur?: number; interligne?: number } = {}) => {
    const taille = o.taille ?? 10.5, police = o.gras ? fb : f, x = o.x ?? M, larg = o.largeur ?? W - 2 * M, il = o.interligne ?? taille * 1.4
    for (const l of couper(s, police, taille, larg)) { place(il); page.drawText(l, { x, y: y - taille, size: taille, font: police, color: o.couleur ?? NUIT }); y -= il }
  }
  const titreSection = (s: string, garder = 34) => {
    y -= 12; place(garder)
    page.drawRectangle({ x: M, y: y - 18, width: W - 2 * M, height: 18, color: FOND })
    page.drawRectangle({ x: M, y: y - 18, width: 3, height: 18, color: BLEU })
    page.drawText(propre(s.toUpperCase()), { x: M + 10, y: y - 12.5, size: 9, font: fb, color: NUIT })
    y -= 26
  }

  entete(page)
  y = H - M - 78
  texte('PROCÈS-VERBAL DE RÉCEPTION DES TRAVAUX', { taille: 18, gras: true })
  texte('Article 1792-6 du Code civil', { taille: 9, couleur: GRIS })
  y -= 8

  // Cartouche de références
  const refs: [string, string][] = [
    ['Chantier', c.reference ?? '-'],
    ['Devis', c.bon?.devis ? String(c.bon.devis) : '-'],
    ['Date', dateFr(date)]
  ]
  const lc = (W - 2 * M - 16) / 3
  refs.forEach(([lib, val], i) => {
    const x = M + i * (lc + 8)
    page.drawRectangle({ x, y: y - 38, width: lc, height: 38, color: FOND })
    page.drawText(propre(lib.toUpperCase()), { x: x + 10, y: y - 14, size: 7.5, font: fb, color: GRIS })
    page.drawText(propre(val), { x: x + 10, y: y - 29, size: 11, font: fb, color: NUIT })
  })
  y -= 46

  titreSection('Les parties')
  const adresse = [c.adresse, [c.code_postal, c.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  const col = (lib: string, val: string) => {
    place(16)
    page.drawText(propre(lib), { x: M, y: y - 10.5, size: 10, font: fb, color: GRIS })
    const lignes = couper(val, f, 10.5, W - 2 * M - 140)
    lignes.forEach((l, i) => { if (i) place(15); page.drawText(l, { x: M + 140, y: y - 10.5, size: 10.5, font: f, color: NUIT }); y -= 15 })
    y -= 2
  }
  col('Entreprise', 'ALL TOITURES - charpente, couverture, zinguerie, ossature bois')
  col('Maître d\'ouvrage', c.client_nom)
  if (adresse) col('Adresse du chantier', adresse)
  const objet = (c.bon?.objet as string | undefined) ?? ''
  if (objet) col('Objet des travaux', objet)
  if (c.date_debut) col('Période des travaux', `du ${dateFr(c.date_debut)} au ${dateFr(date)}`)

  const { data: taches } = await admin.from('taches').select('libelle, quantite, unite, categorie, est_groupe, numero, fait').eq('chantier_id', c.id).order('ordre')
  const lignes = ((taches ?? []) as { libelle: string; quantite: number | null; unite: string | null; categorie: string; est_groupe: boolean; numero: string | null; fait: boolean }[])
  const bordereau = lignes.filter((t) => t.categorie === 'bordereau')
  const travaux = bordereau.length ? bordereau : lignes.filter((t) => t.categorie === 'travaux')
  if (travaux.length) {
    titreSection('Travaux réalisés')
    for (const t of travaux) {
      if (t.est_groupe) { y -= 3; texte(t.libelle, { gras: true, taille: 10 }); continue }
      const q = t.quantite != null ? `  (${String(t.quantite).replace('.', ',')} ${t.unite ?? ''})` : ''
      texte(`- ${t.numero ? t.numero + '  ' : ''}${t.libelle}${q}`, { taille: 9.5, x: M + 6, largeur: W - 2 * M - 6, interligne: 13 })
    }
  }

  titreSection('Constat et décision du maître d\'ouvrage', 420)
  texte(MENTION_TOITURE, { taille: 10, interligne: 14 })
  if (photos.length) texte(`Annexe : ${photos.length} photo${photos.length > 1 ? 's' : ''} des travaux.`, { taille: 9, couleur: GRIS })
  y -= 8
  const coche = (ok: boolean, lib: string) => {
    place(20)
    page.drawRectangle({ x: M, y: y - 12, width: 12, height: 12, borderColor: NUIT, borderWidth: 1.2 })
    if (ok) page.drawText('X', { x: M + 2.6, y: y - 10.3, size: 10, font: fb, color: NUIT })
    page.drawText(propre(lib), { x: M + 20, y: y - 10.5, size: 10.5, font: ok ? fb : f, color: NUIT })
    y -= 20
  }
  coche(!!r && r.sans_reserve, 'Réception prononcée SANS RÉSERVE')
  coche(!!r && !r.sans_reserve, 'Réception prononcée AVEC LES RÉSERVES suivantes :')
  if (r && !r.sans_reserve && r.reserves) texte(r.reserves, { x: M + 20, largeur: W - 2 * M - 20 })
  if (apercu) {
    for (let i = 0; i < 3; i++) { place(18); page.drawLine({ start: { x: M + 20, y: y - 14 }, end: { x: W - M, y: y - 14 }, thickness: 0.5, color: LIGNE, dashArray: [2, 2] }); y -= 18 }
  }
  y -= 6
  texte('La réception est prononcée contradictoirement à la date ci-dessus. Elle marque le point de départ de la garantie de parfait achèvement (1 an), de la garantie de bon fonctionnement des éléments d\'équipement (2 ans) et de la garantie décennale (10 ans).', { taille: 9, couleur: GRIS, interligne: 12 })

  // Signatures
  titreSection('Signatures', 200)
  texte(`Fait à ${c.ville ?? '...................'}, le ${dateFr(date)}${r ? ` à ${heureFr(date)}` : ''}.`, { taille: 10 })
  y -= 6
  const larg = (W - 2 * M - 20) / 2
  const xs = [M, M + larg + 20]
  page.drawText('Le maître d\'ouvrage', { x: xs[0], y: y - 11, size: 10, font: fb, color: NUIT })
  page.drawText('Pour ALL TOITURES', { x: xs[1], y: y - 11, size: 10, font: fb, color: NUIT })
  page.drawText(propre(r?.signataire ?? c.client_nom), { x: xs[0], y: y - 24, size: 9.5, font: f, color: NUIT })
  page.drawText(propre(r ? [r.membres?.prenom, r.membres?.nom].filter(Boolean).join(' ') : ''), { x: xs[1], y: y - 24, size: 9.5, font: f, color: NUIT })
  page.drawText('« Lu et approuvé, bon pour réception »', { x: xs[0], y: y - 36, size: 8, font: f, color: GRIS })
  for (const x of xs) page.drawRectangle({ x, y: y - 128, width: larg, height: 84, borderColor: LIGNE, borderWidth: 1 })
  if (r) {
    const sig = await admin.storage.from('photos').download(r.signature_path)
    if (sig.data) {
      const im = await image(doc, await sig.data.arrayBuffer())
      if (im) {
        const r2 = Math.min((larg - 10) / im.width, 76 / im.height)
        page.drawImage(im, { x: xs[0] + 5, y: y - 124, width: im.width * r2, height: im.height * r2 })
      }
    }
    page.drawText('Signé électroniquement sur place', { x: xs[1] + 10, y: y - 70, size: 8.5, font: f, color: GRIS })
    page.drawText(propre(`le ${dateFr(date)} à ${heureFr(date)}`), { x: xs[1] + 10, y: y - 82, size: 8.5, font: f, color: GRIS })
  } else {
    page.drawText('Signature après lecture', { x: xs[0] + 10, y: y - 90, size: 8.5, font: f, color: LIGNE })
  }
  y -= 136

  // Annexe photos : 2 colonnes x 3 lignes par page
  if (photos.length) {
    const cols = 2, rangs = 3, gap = 14
    const cw = (W - 2 * M - gap) / cols, chh = (H - M - 70 - 80 - gap * (rangs - 1)) / rangs - 14
    let i = 0
    for (const p of photos) {
      if (i % (cols * rangs) === 0) {
        page = doc.addPage([W, H]); entete(page)
        page.drawText(propre(`ANNEXE - PHOTOS DES TRAVAUX${i ? ' (suite)' : ''}`), { x: M, y: H - M - 70, size: 11, font: fb, color: BLEU })
      }
      const k = i % (cols * rangs), cx = M + (k % cols) * (cw + gap), top = H - M - 82 - Math.floor(k / cols) * (chh + 14 + gap)
      const oct = await telecharger(p.grande ?? p.miniature)
      const im = oct ? await image(doc, oct) : null
      if (im) {
        const s = Math.min(cw / im.width, chh / im.height), w = im.width * s, h = im.height * s
        page.drawImage(im, { x: cx + (cw - w) / 2, y: top - chh + (chh - h) / 2, width: w, height: h })
      } else page.drawRectangle({ x: cx, y: top - chh, width: cw, height: chh, borderColor: LIGNE, borderWidth: 1 })
      page.drawText(propre(`${i + 1}. ${PHASE[p.phase] ?? p.phase} - ${dateFr(p.prise_le)}${p.prenom ? ` - ${p.prenom}` : ''}`), { x: cx, y: top - chh - 11, size: 8.5, font: f, color: GRIS })
      i++
    }
  }

  // Pieds de page numérotés « page n / N ».
  const pages = doc.getPages()
  pages.forEach((p, n) => {
    const t = propre(`PV de réception - ${c.client_nom} - page ${n + 1} / ${pages.length}`)
    p.drawLine({ start: { x: M, y: 38 }, end: { x: W - M, y: 38 }, thickness: 0.5, color: LIGNE })
    p.drawText(t, { x: W / 2 - f.widthOfTextAtSize(t, 8) / 2, y: 24, size: 8, font: f, color: GRIS })
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
    const { chantier, action = 'liste', reception } = await req.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
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
