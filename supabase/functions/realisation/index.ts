// Réalisations du site alltoitures.com, à partir d'un chantier terminé.
// Réservé au gérant. Actions :
//  - photos     : photos du dossier « C » OneDrive du chantier (miniatures) pour choisir celles à publier
//  - diagnostic : vérifie l'accès au site (connexion + identifiants WordPress)
//  - publier    : envoie les photos retenues et publie (ou met à jour) la fiche chantier sur le site
// Secrets (posés par Aurélien, jamais dans le code) : WP_USER, WP_APP_PASSWORD. Option : WP_URL.
import { createClient } from 'npm:@supabase/supabase-js@2'

const DRIVE = Deno.env.get('ONEDRIVE_DRIVE_ID') ?? 'b!4efKqbnV-EKC_9Z0oks90n3mvlMiPLJFjdsjFcMnwiyAgT6m5zLnSriFuukUJq2m'
const TENANT = Deno.env.get('MS_TENANT_ID') ?? 'f7c2d61b-b7b9-4c0c-ac90-3ed776b9b9de'
const CLIENT = Deno.env.get('MS_CLIENT_ID') ?? 'a43c4593-1b29-4ec5-a006-444054222d62'
const SECRET = Deno.env.get('MS_CLIENT_SECRET')
const GRAPH = 'https://graph.microsoft.com/v1.0'
const WP = (Deno.env.get('WP_URL') ?? 'https://alltoitures.com').replace(/\/$/, '')
const WP_USER = Deno.env.get('WP_USER')
const WP_PASS = Deno.env.get('WP_APP_PASSWORD')
const METIERS: Record<string, number> = { charpente: 2, couverture: 3, zinguerie: 4, 'fenetres-de-toit': 5, 'ossature-bois': 6, entretien: 7 }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}
const rep = (corps: unknown, statut = 200) => Response.json(corps, { status: statut, headers: CORS })

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
async function graph(t: string, chemin: string) {
  const r = await fetch(chemin.startsWith('http') ? chemin : `${GRAPH}${chemin}`, { headers: { Authorization: `Bearer ${t}` } })
  if (!r.ok) throw new Error(`OneDrive : ${r.status}`)
  return r.json()
}

// ---------- WordPress ----------
const wpAuth = () => 'Basic ' + btoa(`${WP_USER}:${WP_PASS}`)
async function wp(chemin: string, init: RequestInit = {}) {
  const r = await fetch(`${WP}/wp-json/wp/v2${chemin}`, {
    ...init,
    headers: { Authorization: wpAuth(), ...(init.body && !(init.body instanceof Uint8Array) ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) }
  })
  const texte = await r.text()
  let j: any = null
  try { j = JSON.parse(texte) } catch { /* réponse non JSON */ }
  if (!r.ok) throw new Error(`Site ${r.status} : ${j?.message ?? texte.slice(0, 160)}`)
  return j
}

const echap = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const enrichi = (s: string) => echap(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
const slugifier = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

const para = (s: string, intro = false) =>
  intro
    ? `<!-- wp:paragraph {"className":"is-style-intro"} --><p class="is-style-intro">${enrichi(s)}</p><!-- /wp:paragraph -->`
    : `<!-- wp:paragraph --><p>${enrichi(s)}</p><!-- /wp:paragraph -->`
const titreH = (s: string, n = 2) =>
  n === 2 ? `<!-- wp:heading --><h2 class="wp-block-heading">${echap(s)}</h2><!-- /wp:heading -->` : `<!-- wp:heading {"level":3} --><h3 class="wp-block-heading">${echap(s)}</h3><!-- /wp:heading -->`
const liste = (pts: string[]) =>
  `<!-- wp:list --><ul class="wp-block-list">${pts.map((p) => `<!-- wp:list-item --><li>${enrichi(p)}</li><!-- /wp:list-item -->`).join('')}</ul><!-- /wp:list -->`
const paras = (s: string | null) => (s ?? '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean).map((x) => para(x)).join('\n')

type Photo = { id: string; nom?: string; alt?: string; sujet?: string; retenue?: boolean; principale?: boolean; wp_media_id?: number; wp_url?: string }

function contenu(r: any, photos: Photo[]) {
  const b: string[] = []
  if (r.intro) b.push(para(r.intro, true))
  if (r.projet) b.push(titreH('Le projet'), paras(r.projet))
  if (r.contraintes) b.push(titreH('Les contraintes'), paras(r.contraintes))
  const inter = (r.intervention ?? []) as { titre?: string; points?: string[] }[]
  if (inter.length) {
    b.push(titreH('Notre intervention'))
    for (const g of inter) {
      if (g.titre) b.push(titreH(g.titre, 3))
      if (g.points?.length) b.push(liste(g.points))
    }
  }
  if (photos.length) {
    b.push(
      `<!-- wp:gallery {"linkTo":"none"} --><figure class="wp-block-gallery has-nested-images columns-default is-cropped">` +
        photos
          .map((p) => `<!-- wp:image {"id":${p.wp_media_id},"sizeSlug":"large","linkDestination":"none"} --><figure class="wp-block-image size-large"><img src="${p.wp_url}" alt="${echap(p.alt ?? '')}" class="wp-image-${p.wp_media_id}"/></figure><!-- /wp:image -->`)
          .join('') +
        `</figure><!-- /wp:gallery -->`
    )
  }
  if (r.resultat) b.push(titreH('Le résultat'), paras(r.resultat))
  return b.join('\n\n')
}

async function dossierPhotos(t: string, racine: string): Promise<string | null> {
  const j = await graph(t, `/drives/${DRIVE}/items/${racine}/children?$select=id,name,folder&$top=200`)
  const c = (j.value as any[]).find((e) => e.folder && /^C\s*-/i.test(e.name))
  return c?.id ?? null
}

async function listerImages(t: string, dossier: string, profondeur = 0): Promise<any[]> {
  const out: any[] = []
  let url: string | null = `${GRAPH}/drives/${DRIVE}/items/${dossier}/children?$expand=thumbnails&$top=200`
  while (url) {
    const j = await graph(t, url)
    for (const e of j.value as any[]) {
      if (e.folder && profondeur < 2) out.push(...(await listerImages(t, e.id, profondeur + 1)))
      else if (e.file?.mimeType?.startsWith('image/'))
        out.push({ id: e.id, nom: e.name, modifie: e.lastModifiedDateTime, miniature: e.thumbnails?.[0]?.medium?.url ?? null, grande: e.thumbnails?.[0]?.large?.url ?? null })
    }
    url = j['@odata.nextLink'] ?? null
  }
  return out
}

async function imageReduite(t: string, id: string): Promise<Uint8Array> {
  // Miniature OneDrive redimensionnée (≤ 1600 px, JPEG) ; à défaut, le fichier original.
  for (const chemin of [`/drives/${DRIVE}/items/${id}/thumbnails/0/c1600x1600/content`, `/drives/${DRIVE}/items/${id}/content`]) {
    const r = await fetch(`${GRAPH}${chemin}`, { headers: { Authorization: `Bearer ${t}` } })
    if (r.ok) return new Uint8Array(await r.arrayBuffer())
  }
  throw new Error('Photo introuvable sur OneDrive')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  let realisationId: string | null = null
  try {
    const { action, realisation } = await req.json()
    realisationId = realisation ?? null
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: role } = await sb.rpc('mon_role')
    if (role !== 'gerant') return rep({ erreur: 'Réservé au gérant' }, 403)

    if (action === 'diagnostic') {
      const site = await fetch(`${WP}/wp-json/wp/v2/metier?_fields=id,slug`).then((r) => r.status).catch((e) => String(e))
      if (!WP_USER || !WP_PASS) return rep({ site, identifiants: 'absents' })
      const moi = await wp('/users/me?context=edit&_fields=id,name,roles').then((u) => `ok (${u.name})`).catch((e) => String(e.message))
      return rep({ site, identifiants: moi })
    }

    const { data: r } = await admin.from('realisations').select('*, chantiers(id, onedrive_item_id, ville, code_postal)').eq('id', realisation).maybeSingle()
    if (!r) return rep({ erreur: 'Réalisation introuvable' }, 404)

    if (action === 'photos') {
      if (!SECRET) return rep({ erreur: 'Accès OneDrive non configuré' }, 503)
      if (!r.chantiers?.onedrive_item_id) return rep({ photos: [], erreur: 'Aucun dossier OneDrive relié à ce chantier' })
      const t = await jeton()
      const c = await dossierPhotos(t, r.chantiers.onedrive_item_id)
      return rep({ photos: c ? (await listerImages(t, c)).sort((a, b) => (a.modifie ?? '').localeCompare(b.modifie ?? '')) : [] })
    }

    if (action !== 'publier') return rep({ erreur: 'Action inconnue' }, 400)
    if (!WP_USER || !WP_PASS) return rep({ erreur: 'Identifiants du site non configurés (WP_USER / WP_APP_PASSWORD dans Supabase).' }, 503)
    if (!r.titre || !r.intro) return rep({ erreur: 'Le brouillon est incomplet (titre ou introduction manquants).' }, 400)
    const retenues: Photo[] = (r.photos as Photo[]).filter((p) => p.retenue)
    if (!retenues.length) return rep({ erreur: 'Choisissez au moins une photo.' }, 400)
    await admin.from('realisations').update({ statut: 'publication', erreur: null, updated_at: new Date().toISOString() }).eq('id', r.id)

    // 1. Photos -> médiathèque (une seule fois par photo)
    const t = await jeton()
    const villeSlug = slugifier(r.ville ?? r.chantiers?.ville ?? 'chantier')
    const toutes = r.photos as Photo[]
    let n = 0
    for (const p of toutes) {
      if (!p.retenue) continue
      n++
      if (!p.wp_media_id) {
        const octets = await imageReduite(t, p.id)
        const fichier = `${villeSlug}-${slugifier(p.sujet || 'chantier')}-${n}.jpg`
        const m = await wp('/media', {
          method: 'POST',
          body: octets,
          headers: { 'Content-Type': 'image/jpeg', 'Content-Disposition': `attachment; filename="${fichier}"` }
        })
        p.wp_media_id = m.id
        p.wp_url = m.media_details?.sizes?.large?.source_url ?? m.source_url
        await admin.from('realisations').update({ photos: toutes }).eq('id', r.id)
      }
      await wp(`/media/${p.wp_media_id}`, { method: 'POST', body: JSON.stringify({ alt_text: p.alt ?? '', title: p.alt ?? '' }) })
    }
    const galerie = toutes.filter((p) => p.retenue)
    const principale = galerie.find((p) => p.principale) ?? galerie[0]

    // 2. Ville (taxonomie)
    let villeIds: number[] = []
    if (r.ville) {
      const trouvees = (await wp(`/ville?search=${encodeURIComponent(r.ville)}&per_page=20&_fields=id,name`)) as { id: number; name: string }[]
      const ex = trouvees.find((v) => slugifier(v.name) === villeSlug)
      villeIds = [ex ? ex.id : (await wp('/ville', { method: 'POST', body: JSON.stringify({ name: r.ville }) })).id]
    }

    // 3. Fiche chantier
    const f = r.fiche ?? {}
    const corps = {
      title: r.titre,
      slug: r.wp_id ? undefined : r.slug || undefined,
      excerpt: r.extrait ?? '',
      status: 'publish',
      content: contenu(r, galerie),
      featured_media: principale?.wp_media_id,
      metier: (r.metiers as string[]).map((m) => METIERS[m]).filter(Boolean),
      ville: villeIds,
      meta: {
        at_lieu: f.lieu ?? '', at_departement: f.departement ?? '', at_annee: String(f.annee ?? ''), at_type_client: f.type_client ?? '',
        at_materiau: f.materiau ?? '', at_surface: f.surface ?? '', at_particularite: f.particularite ?? '',
        at_temoignage: r.temoignage ?? '', at_temoin: r.temoin ?? ''
      }
    }
    const post = await wp(r.wp_id ? `/chantier/${r.wp_id}` : '/chantier', { method: 'POST', body: JSON.stringify(corps) })
    await admin.from('realisations').update({
      statut: 'publiee', wp_id: post.id, url: post.link, publiee_le: new Date().toISOString(), erreur: null, updated_at: new Date().toISOString()
    }).eq('id', r.id)
    return rep({ ok: true, url: post.link })
  } catch (e) {
    const msg = String((e as Error).message)
    if (realisationId) await admin.from('realisations').update({ statut: 'erreur', erreur: msg }).eq('id', realisationId).in('statut', ['publication'])
    return rep({ erreur: msg }, 500)
  }
})
