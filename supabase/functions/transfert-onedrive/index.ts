// Transfert des photos des équipes vers le dossier OneDrive du chantier.
// Appelée toutes les 2 minutes par pg_cron. Sans secrets Microsoft, elle ne fait rien.
import { createClient } from 'npm:@supabase/supabase-js@2'

const DRIVE = Deno.env.get('ONEDRIVE_DRIVE_ID') ?? 'b!4efKqbnV-EKC_9Z0oks90n3mvlMiPLJFjdsjFcMnwiyAgT6m5zLnSriFuukUJq2m'
const TENANT = Deno.env.get('MS_TENANT_ID') ?? 'f7c2d61b-b7b9-4c0c-ac90-3ed776b9b9de'
const CLIENT = Deno.env.get('MS_CLIENT_ID') ?? 'a43c4593-1b29-4ec5-a006-444054222d62'
const SECRET = Deno.env.get('MS_CLIENT_SECRET')
const GRAPH = 'https://graph.microsoft.com/v1.0'
const LOT = 15

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
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .toUpperCase() || 'CHANTIER'
}

function jourParis(iso: string): string {
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
}

type Ch = { id: string; client_nom: string; onedrive_dossier: string | null; onedrive_item_id: string | null }

const cacheDossiers = new Map<string, string>()

async function dossierPhotos(t: string, c: Ch): Promise<string> {
  if (cacheDossiers.has(c.id)) return cacheDossiers.get(c.id)!
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
  let cible = enfants.find((e) => e.folder && /^C\s*-\s*Photos/i.test(e.name))
  if (!cible) {
    const cr = await fetch(`${GRAPH}/drives/${DRIVE}/items/${parent}/children`, {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'C - Photos (avant pendant après)', folder: {}, '@microsoft.graph.conflictBehavior': 'fail' })
    })
    if (!cr.ok) throw new Error(`Création du dossier photos impossible (${cr.status})`)
    cible = await cr.json()
  }
  cacheDossiers.set(c.id, cible!.id)
  return cible!.id
}

Deno.serve(async () => {
  if (!TENANT || !CLIENT || !SECRET) return Response.json({ etat: 'non configuré' })

  const { data: photos, error } = await sb
    .from('photos')
    .select('id, chantier_id, phase, storage_path, prise_le, chantiers(id, client_nom, onedrive_dossier, onedrive_item_id)')
    .eq('onedrive_statut', 'en_attente')
    .order('prise_le')
    .limit(LOT)
  if (error) return Response.json({ erreur: error.message }, { status: 500 })
  if (!photos?.length) return Response.json({ etat: 'rien à envoyer' })

  const t = await jeton()
  let ok = 0
  for (const p of photos as unknown as (typeof photos[number] & { chantiers: Ch })[]) {
    try {
      const c = p.chantiers
      const dossier = await dossierPhotos(t, c)
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
      const nom = `${jour}_${nomClient(c.client_nom)}_${p.phase}_${(count ?? 0) + 1}.jpg`

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
  return Response.json({ envoyees: ok, lot: photos.length })
})
