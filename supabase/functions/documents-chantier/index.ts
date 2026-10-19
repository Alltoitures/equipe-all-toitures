// Documents OneDrive d'un chantier, consultables depuis l'application.
// L'utilisateur doit voir le chantier (droits de la base). Les équipes ne voient que
// les dossiers B (technique), C (photos), E (sécurité) et F (suivi) : jamais les devis, factures ni prix.
import { createClient } from 'npm:@supabase/supabase-js@2'

const DRIVE = Deno.env.get('ONEDRIVE_DRIVE_ID') ?? 'b!4efKqbnV-EKC_9Z0oks90n3mvlMiPLJFjdsjFcMnwiyAgT6m5zLnSriFuukUJq2m'
const TENANT = Deno.env.get('MS_TENANT_ID') ?? 'f7c2d61b-b7b9-4c0c-ac90-3ed776b9b9de'
const CLIENT = Deno.env.get('MS_CLIENT_ID') ?? 'a43c4593-1b29-4ec5-a006-444054222d62'
const SECRET = Deno.env.get('MS_CLIENT_SECRET')
const GRAPH = 'https://graph.microsoft.com/v1.0'
const AUTORISES_EQUIPE = /^[BCEF]\s*-/i

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
  const r = await fetch(`${GRAPH}${chemin}`, { headers: { Authorization: `Bearer ${t}` } })
  if (!r.ok) throw new Error(`OneDrive : ${r.status}`)
  return r.json()
}

type Element = {
  id: string
  name: string
  size?: number
  lastModifiedDateTime?: string
  folder?: { childCount: number }
  file?: { mimeType: string }
  thumbnails?: { medium?: { url: string }; large?: { url: string } }[]
  parentReference?: { id: string }
  '@microsoft.graph.downloadUrl'?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (!SECRET) return rep({ erreur: 'Accès OneDrive non configuré' }, 503)

  try {
    const { chantier, dossier } = await req.json()
    // Droits : lecture du chantier avec le compte de la personne connectée.
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } }
    })
    const { data: c } = await sb.from('chantiers').select('id, onedrive_item_id').eq('id', chantier).maybeSingle()
    if (!c) return rep({ erreur: 'Chantier inaccessible' }, 403)
    if (!c.onedrive_item_id) return rep({ erreur: 'Aucun dossier OneDrive relié à ce chantier' }, 404)
    const { data: role } = await sb.rpc('mon_role')
    const gestion = role === 'gerant' || role === 'assistante'

    const t = await jeton()
    const racine = c.onedrive_item_id as string
    let cible = racine
    const fil: { id: string; nom: string }[] = []

    if (dossier && dossier !== racine) {
      // Vérifie que le dossier demandé est bien dans le dossier du chantier, et dans une partie autorisée.
      let courant = (await graph(t, `/drives/${DRIVE}/items/${dossier}?$select=id,name,parentReference`)) as Element
      const chaine: Element[] = [courant]
      for (let i = 0; i < 8 && courant.parentReference?.id !== racine; i++) {
        if (!courant.parentReference?.id) return rep({ erreur: 'Dossier hors chantier' }, 403)
        courant = (await graph(t, `/drives/${DRIVE}/items/${courant.parentReference.id}?$select=id,name,parentReference`)) as Element
        chaine.push(courant)
      }
      if (courant.parentReference?.id !== racine) return rep({ erreur: 'Dossier hors chantier' }, 403)
      if (!gestion && !AUTORISES_EQUIPE.test(courant.name)) return rep({ erreur: 'Dossier réservé à la gestion' }, 403)
      cible = dossier
      chaine.reverse().forEach((e) => fil.push({ id: e.id, nom: e.name }))
    }

    const elements: Element[] = []
    let url: string | null = `${GRAPH}/drives/${DRIVE}/items/${cible}/children?$expand=thumbnails&$top=200`
    while (url && elements.length < 1000) {
      const r = await fetch(url, { headers: { Authorization: `Bearer ${t}` } })
      if (!r.ok) throw new Error(`OneDrive : ${r.status}`)
      const j = await r.json()
      elements.push(...j.value)
      url = j['@odata.nextLink'] ?? null
    }

    const visibles = elements.filter((e) => {
      if (cible !== racine || gestion) return true
      return !!e.folder && AUTORISES_EQUIPE.test(e.name)
    })

    const liste = visibles
      .map((e) => ({
        id: e.id,
        nom: e.name,
        dossier: !!e.folder,
        nb: e.folder?.childCount ?? null,
        taille: e.size ?? null,
        modifie: e.lastModifiedDateTime ?? null,
        type: e.file?.mimeType ?? null,
        miniature: e.thumbnails?.[0]?.medium?.url ?? null,
        grande: e.thumbnails?.[0]?.large?.url ?? null,
        lien: e['@microsoft.graph.downloadUrl'] ?? null
      }))
      .sort((a, b) => (a.dossier !== b.dossier ? (a.dossier ? -1 : 1) : a.dossier ? a.nom.localeCompare(b.nom) : (b.modifie ?? '').localeCompare(a.modifie ?? '')))

    return rep({ dossier: cible, racine, fil, elements: liste })
  } catch (e) {
    return rep({ erreur: String((e as Error).message) }, 500)
  }
})
