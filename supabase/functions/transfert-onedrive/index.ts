// Transfert des photos des équipes vers le dossier OneDrive du chantier.
// Appelée toutes les 2 minutes par pg_cron. Sans secrets Microsoft, elle ne fait rien.
import { createClient } from 'npm:@supabase/supabase-js@2'

const DRIVE = Deno.env.get('ONEDRIVE_DRIVE_ID') ?? 'b!4efKqbnV-EKC_9Z0oks90n3mvlMiPLJFjdsjFcMnwiyAgT6m5zLnSriFuukUJq2m'
const TENANT = Deno.env.get('MS_TENANT_ID') ?? 'f7c2d61b-b7b9-4c0c-ac90-3ed776b9b9de'
const CLIENT = Deno.env.get('MS_CLIENT_ID') ?? 'a43c4593-1b29-4ec5-a006-444054222d62'
const SECRET = Deno.env.get('MS_CLIENT_SECRET')
const GRAPH = 'https://graph.microsoft.com/v1.0'
const LOT = 15
const VISITE_AO = Deno.env.get('ONEDRIVE_VISITES_ID') ?? '01VJMWOLJJSW5IIM7TCFFZGVMEEFA6WNXA'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

async function jeton(): Promise<string> {
  const r = await fetch(`https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT!,
      client_secret: SECRET!,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials'
    })
  })
  const j = await r.json()
  if (!r.ok) throw new Error(`Connexion Microsoft refusée : ${j.error_description ?? j.error ?? r.status}`)
  return j.access_token
}

function nomClient(s: string): string {
  return s
    .replace(/^(mme et m\.?|mr et mme|m\. et mme|madame|monsieur|mme|mlle|mr|m\.)\s+/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .toUpperCase() || 'CHANTIER'
}

function jourParis(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
}

type Ch = { id: string; client_nom: string; onedrive_dossier: string | null; onedrive_item_id: string | null }

const cacheDossiers = new Map<string, string>()

const CIBLES: Record<string, [RegExp, string]> = {
  photos: [/^C\s*-\s*Photos/i, 'C - Photos (avant pendant après)'],
  fournisseurs: [/^D\s*-/i, 'D - Fournisseurs (devis et BL)'],
  suivi: [/^F\s*-/i, 'F - Suivi chantier (planning , CR)']
}

async function dossierPhotos(t: string, c: Ch, quoi: keyof typeof CIBLES = 'photos'): Promise<string> {
  const cleCache = `${c.id}:${quoi}`
  if (cacheDossiers.has(cleCache)) return cacheDossiers.get(cleCache)!
  const h = { Authorization: `Bearer ${t}` }
  let parent = c.onedrive_item_id
  if (!parent) {
    if (!c.onedrive_dossier) throw new Error('Dossier OneDrive du chantier non renseigné')
    // « ALL TOITURES - 04 - CHANTIERS/2026/NOM » -> chemin dans la bibliothèque « 04 CHANTIERS »
    const chemin = c.onedrive_dossier.replace(/^.*?CHANTIERS\//i, '').replace(/^\/+|\/+$/g, '')
    const r = await fetch(`${GRAPH}/drives/${DRIVE}/root:/${chemin.split('/').map(encodeURIComponent).join('/')}`, { headers: h })
    if (!r.ok) throw new Error(`Dossier OneDrive introuvable : ${chemin}`)
    parent = (await r.json()).id
    await sb.from('chantiers').update({ onedrive_item_id: parent }).eq('id', c.id)
  }
  const r = await fetch(`${GRAPH}/drives/${DRIVE}/items/${parent}/children?$select=id,name,folder&$top=200`, { headers: h })
  if (!r.ok) throw new Error(`Dossier OneDrive inaccessible (${r.status})`)
  const enfants = (await r.json()).value as { id: string; name: string; folder?: unknown }[]
  const [motif, nomDefaut] = CIBLES[quoi]
  let cible = enfants.find((e) => e.folder && motif.test(e.name))
  if (!cible) {
    const cr = await fetch(`${GRAPH}/drives/${DRIVE}/items/${parent}/children`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nomDefaut, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
    })
    if (!cr.ok) throw new Error(`Création du dossier photos impossible (${cr.status})`)
    cible = await cr.json()
  }
  cacheDossiers.set(cleCache, cible!.id)
  return cible!.id
}

// ---------- Photos de visite ----------
type Vi = { id: string; client_nom: string; date_rdv: string | null; onedrive_item_id: string | null; onedrive_photos_id: string | null }
const cleNom = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]/g, '').toUpperCase()
const nomDossier = (x: string) =>
  x.replace(/^(mme et m\.?|mr et mme|m\. et mme|madame|monsieur|mme|mlle|mr|m\.)\s+/i, '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, ' ').trim().toUpperCase() || 'CLIENT'
const slug = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase().slice(0, 40)

async function enfants(t: string, parent: string) {
  const r = await fetch(`${GRAPH}/drives/${DRIVE}/items/${parent}/children?$select=id,name,folder&$top=500`, { headers: { Authorization: `Bearer ${t}` } })
  if (!r.ok) throw new Error(`Dossier OneDrive inaccessible (${r.status})`)
  return ((await r.json()).value as { id: string; name: string; folder?: unknown }[]).filter((e) => e.folder)
}

async function creerDossier(t: string, parent: string, nom: string): Promise<string> {
  const r = await fetch(`${GRAPH}/drives/${DRIVE}/items/${parent}/children`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nom, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
  })
  const j = await r.json()
  if (!r.ok) {
    // Créé entre-temps : on le reprend.
    const ex = (await enfants(t, parent)).find((e) => e.name.toLowerCase() === nom.toLowerCase())
    if (ex) return ex.id
    throw new Error(`Création du dossier « ${nom} » impossible (${r.status})`)
  }
  return j.id
}

const cacheVisites = new Map<string, string>()

async function dossierPhotosVisite(t: string, v: Vi): Promise<string> {
  if (v.onedrive_photos_id) return v.onedrive_photos_id
  if (cacheVisites.has(v.id)) return cacheVisites.get(v.id)!
  let dossier = v.onedrive_item_id
  if (!dossier) {
    const date = v.date_rdv ?? new Date().toISOString().slice(0, 10)
    const annee = date.slice(0, 4)
    const mm = date.slice(5, 7)
    const an = (await enfants(t, VISITE_AO)).find((e) => e.name === annee)
    const idAn = an?.id ?? (await creerDossier(t, VISITE_AO, annee))
    const nom = nomDossier(v.client_nom)
    const cle = cleNom(nom)
    const existants = (await enfants(t, idAn)).filter((e) => cleNom(e.name.replace(/^(\d{4}_)?\d{2}_(\d{3}_)?/, '')) === cle)
    const ex = existants.find((e) => e.name.startsWith(`${mm}_`)) ?? existants[0]
    if (ex) dossier = ex.id
    else {
      dossier = await creerDossier(t, idAn, `${mm}_${nom}`)
      await creerDossier(t, dossier, 'Photos visite')
      await creerDossier(t, dossier, 'Plans')
    }
    await sb.from('visites').update({ onedrive_item_id: dossier }).eq('id', v.id)
  }
  const ph = (await enfants(t, dossier!)).find((e) => /^photos/i.test(e.name))
  const idPh = ph?.id ?? (await creerDossier(t, dossier!, 'Photos visite'))
  await sb.from('visites').update({ onedrive_photos_id: idPh }).eq('id', v.id)
  cacheVisites.set(v.id, idPh)
  return idPh
}

async function transfererVisites(t: string): Promise<number> {
  const { data } = await sb
    .from('photos_visite')
    .select('id, visite_id, legende, storage_path, prise_le, visites(id, client_nom, date_rdv, onedrive_item_id, onedrive_photos_id)')
    .eq('onedrive_statut', 'en_attente')
    .order('prise_le')
    .limit(LOT)
  let ok = 0
  for (const p of (data ?? []) as unknown as { id: string; visite_id: string; legende: string | null; storage_path: string; prise_le: string; visites: Vi }[]) {
    try {
      const dossier = await dossierPhotosVisite(t, p.visites)
      const fichier = await sb.storage.from('photos').download(p.storage_path)
      if (fichier.error) throw new Error(`Photo introuvable dans le stockage : ${fichier.error.message}`)
      const jour = jourParis(p.prise_le)
      const { count } = await sb.from('photos_visite').select('id', { count: 'exact', head: true }).eq('visite_id', p.visite_id).eq('onedrive_statut', 'envoye')
      const nom = `${jour}_${nomClient(p.visites.client_nom)}_visite_${(count ?? 0) + 1}${p.legende ? `_${slug(p.legende)}` : ''}.jpg`
      const up = await fetch(`${GRAPH}/drives/${DRIVE}/items/${dossier}:/${encodeURIComponent(nom)}:/content?@microsoft.graph.conflictBehavior=rename`, {
        method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'image/jpeg' }, body: await fichier.data.arrayBuffer()
      })
      const res = await up.json()
      if (!up.ok) throw new Error(`Envoi OneDrive refusé : ${res.error?.message ?? up.status}`)
      await sb.from('photos_visite').update({ onedrive_statut: 'envoye', onedrive_id: res.id, nom_fichier: res.name, erreur: null }).eq('id', p.id)
      await sb.storage.from('photos').remove([p.storage_path])
      ok++
    } catch (e) {
      await sb.from('photos_visite').update({ erreur: String((e as Error).message).slice(0, 300) }).eq('id', p.id)
    }
  }
  return ok
}

async function transfererReceptions(t: string): Promise<number> {
  const { data } = await sb.from('receptions').select('id, signataire, sans_reserve, signature_path, signe_le, chantiers(id, client_nom, onedrive_dossier, onedrive_item_id)').eq('onedrive_statut', 'en_attente').limit(5)
  let ok = 0
  for (const r of (data ?? []) as unknown as { id: string; signataire: string; sans_reserve: boolean; signature_path: string; signe_le: string; chantiers: Ch }[]) {
    try {
      const dossier = await dossierPhotos(t, r.chantiers, 'suivi')
      const f = await sb.storage.from('photos').download(r.signature_path)
      if (f.error) throw new Error(f.error.message)
      const nom = `${jourParis(r.signe_le)}_${nomClient(r.chantiers.client_nom)}_PV_reception_${r.sans_reserve ? 'sans_reserve' : 'avec_reserves'}.png`
      const up = await fetch(`${GRAPH}/drives/${DRIVE}/items/${dossier}:/${encodeURIComponent(nom)}:/content?@microsoft.graph.conflictBehavior=rename`, {
        method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'image/png' }, body: await f.data.arrayBuffer()
      })
      const res = await up.json()
      if (!up.ok) throw new Error(`Envoi OneDrive refusé : ${res.error?.message ?? up.status}`)
      await sb.from('receptions').update({ onedrive_statut: 'envoye', onedrive_id: res.id, erreur: null }).eq('id', r.id)
      ok++
    } catch (e) {
      await sb.from('receptions').update({ erreur: String((e as Error).message).slice(0, 300) }).eq('id', r.id)
    }
  }
  return ok
}

Deno.serve(async (req) => {
  if (!TENANT || !CLIENT || !SECRET) return Response.json({ etat: 'non configuré' })

  // Test de connexion : { "test": "<chantier_id>" } -> vérifie l'accès au dossier photos, sans rien écrire.
  const corps = await req.json().catch(() => ({}))
  if (corps?.test) {
    try {
      const t = await jeton()
      const { data: c } = await sb.from('chantiers').select('id, client_nom, onedrive_dossier, onedrive_item_id').eq('id', corps.test).single()
      const h = { Authorization: `Bearer ${t}` }
      const r = await fetch(`${GRAPH}/drives/${DRIVE}/items/${c!.onedrive_item_id}/children?$select=name,folder&$top=50`, { headers: h })
      const j = await r.json()
      return Response.json({ test: r.ok ? 'ok' : 'echec', statut: r.status, dossiers: (j.value ?? []).filter((e: { folder?: unknown }) => e.folder).map((e: { name: string }) => e.name), erreur: j.error?.message })
    } catch (e) {
      return Response.json({ test: 'echec', erreur: String((e as Error).message) })
    }
  }

  const { data: photos, error } = await sb
    .from('photos')
    .select('id, chantier_id, phase, storage_path, prise_le, chantiers(id, client_nom, onedrive_dossier, onedrive_item_id)')
    .eq('onedrive_statut', 'en_attente')
    .order('prise_le')
    .limit(LOT)
  if (error) return Response.json({ erreur: error.message }, { status: 500 })
  const { count: nbVisites } = await sb.from('photos_visite').select('id', { count: 'exact', head: true }).eq('onedrive_statut', 'en_attente')
  const { count: nbRec } = await sb.from('receptions').select('id', { count: 'exact', head: true }).eq('onedrive_statut', 'en_attente')
  if (!photos?.length && !nbVisites && !nbRec) return Response.json({ etat: 'rien à envoyer' })

  const t = await jeton()
  const visites = nbVisites ? await transfererVisites(t) : 0
  const receptions = nbRec ? await transfererReceptions(t) : 0
  let ok = 0
  for (const p of (photos ?? []) as unknown as (NonNullable<typeof photos>[number] & { chantiers: Ch })[]) {
    try {
      const c = p.chantiers
      const dossier = await dossierPhotos(t, c, p.phase === 'livraison' ? 'fournisseurs' : 'photos')
      const fichier = await sb.storage.from('photos').download(p.storage_path!)
      if (fichier.error) throw new Error(`Photo introuvable dans le stockage : ${fichier.error.message}`)

      const jour = jourParis(p.prise_le)
      const { count } = await sb
        .from('photos')
        .select('id', { count: 'exact', head: true })
        .eq('chantier_id', p.chantier_id)
        .eq('phase', p.phase)
        .eq('onedrive_statut', 'envoye')
        .gte('prise_le', `${jour}T00:00:00+02:00`)
      const nom = `${jour}_${nomClient(c.client_nom)}_${p.phase === 'livraison' ? 'BL' : p.phase}_${(count ?? 0) + 1}.jpg`

      const up = await fetch(
        `${GRAPH}/drives/${DRIVE}/items/${dossier}:/${encodeURIComponent(nom)}:/content?@microsoft.graph.conflictBehavior=rename`,
        { method: 'PUT', headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'image/jpeg' }, body: await fichier.data.arrayBuffer() }
      )
      const res = await up.json()
      if (!up.ok) throw new Error(`Envoi OneDrive refusé : ${res.error?.message ?? up.status}`)

      await sb.from('photos').update({ onedrive_statut: 'envoye', onedrive_id: res.id, nom_fichier: res.name, erreur: null }).eq('id', p.id)
      await sb.storage.from('photos').remove([p.storage_path!])
      ok++
    } catch (e) {
      await sb.from('photos').update({ erreur: String((e as Error).message).slice(0, 300) }).eq('id', p.id)
    }
  }
  return Response.json({ envoyees: ok, lot: photos?.length ?? 0, visites, receptions })
})
