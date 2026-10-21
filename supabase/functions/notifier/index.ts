// Notifications sur les téléphones (Web Push). Appelée par la base (déclencheurs et pg_cron).
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
type Msg = { title: string; body: string; url: string; tag?: string }

async function cles() {
  const { data } = await sb.from('vapid_cles').select('*').eq('id', 1).maybeSingle()
  if (data) return data
  const k = webpush.generateVAPIDKeys()
  const ligne = { id: 1, cle_publique: k.publicKey, cle_privee: k.privateKey }
  await sb.from('vapid_cles').insert(ligne)
  return ligne
}

async function dejaEnvoye(cle: string): Promise<boolean> {
  const { error } = await sb.from('notifs_envoyees').insert({ cle })
  return !!error // clé déjà présente
}

async function destinataires(filtre: { roles?: string[]; ids?: string[] }): Promise<string[]> {
  let q = sb.from('membres').select('id').eq('actif', true)
  if (filtre.roles) q = q.in('role', filtre.roles)
  if (filtre.ids) q = q.in('id', filtre.ids)
  const { data } = await q
  return (data ?? []).map((m) => m.id)
}

async function envoyer(membres: string[], msg: Msg): Promise<number> {
  if (!membres.length) return 0
  const k = await cles()
  webpush.setVapidDetails('mailto:contact@alltoitures.com', k.cle_publique, k.cle_privee)
  const { data: abos } = await sb.from('push_abonnements').select('*').in('membre_id', membres)
  let n = 0
  for (const a of abos ?? []) {
    try {
      await webpush.sendNotification({ endpoint: a.endpoint, keys: { p256dh: a.p256dh, auth: a.auth } }, JSON.stringify(msg), { TTL: 3600 * 12 })
      n++
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await sb.from('push_abonnements').delete().eq('id', a.id)
    }
  }
  return n
}

const STAFF = ['gerant', 'assistante']
const heureParis = () => Number(new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }))
const jourParis = (decal = 0) => new Date(Date.now() + decal * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' })
const dateFr = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })

async function chantier(id: string) {
  const { data } = await sb.from('chantiers').select('id, client_nom, ville, date_debut').eq('id', id).maybeSingle()
  return data
}

Deno.serve(async (req) => {
  const b = await req.json().catch(() => ({}))
  try {
    if (b.init) {
      const k = await cles()
      return Response.json({ ok: true, publique: k.cle_publique })
    }
    if (b.test) {
      const n = await envoyer([b.test], { title: 'ALL TOITURES', body: 'Les notifications fonctionnent sur ce téléphone.', url: '/' })
      return Response.json({ envoyees: n })
    }

    if (b.cron === 'rappel_heures') {
      const auj = jourParis()
      const dow = new Date(auj + 'T12:00:00').getDay()
      if (heureParis() !== 17 || dow === 0 || dow === 6 || (await dejaEnvoye(`rappel:${auj}`))) return Response.json({ etat: 'rien' })
      const equipe = await destinataires({ roles: ['chef', 'ouvrier', 'apprenti'] })
      const { data: saisis } = await sb.from('journees').select('membre_id').eq('jour', auj)
      const { data: absents } = await sb.from('conges').select('membre_id').eq('statut', 'accepte').lte('du', auj).gte('au', auj)
      const exclus = new Set([...(saisis ?? []), ...(absents ?? [])].map((x) => x.membre_id))
      const n = await envoyer(equipe.filter((id) => !exclus.has(id)), { title: 'Vos heures du jour', body: 'Pensez à saisir vos heures de retour au dépôt et votre chantier.', url: '/heures', tag: 'heures' })
      return Response.json({ envoyees: n })
    }

    if (b.cron === 'visites_demain') {
      const dem = jourParis(1)
      if (heureParis() !== 19 || (await dejaEnvoye(`visites:${dem}`))) return Response.json({ etat: 'rien' })
      const { data: v } = await sb.from('visites').select('client_nom, heure, ville').eq('date_rdv', dem).neq('statut', 'terminee').order('heure')
      if (!v?.length) return Response.json({ etat: 'aucune visite' })
      const corps = v.map((x) => `${x.heure ?? ''} ${x.client_nom}${x.ville ? ` (${x.ville})` : ''}`.trim()).join(' · ')
      const n = await envoyer(await destinataires({ roles: ['gerant'] }), { title: `${v.length} visite${v.length > 1 ? 's' : ''} demain`, body: corps, url: '/visites', tag: 'visites' })
      return Response.json({ envoyees: n })
    }

    const t = b.type as string
    if (t === 'imprevus') {
      const { data: i } = await sb.from('imprevus').select('texte, chantier_id, membres(prenom)').eq('id', b.id).single()
      const c = await chantier(i!.chantier_id)
      const qui = (i as unknown as { membres: { prenom: string } | null }).membres?.prenom ?? ''
      return Response.json({ envoyees: await envoyer(await destinataires({ roles: STAFF }), { title: `Imprévu · ${c?.client_nom}`, body: `${qui} : ${i!.texte}`, url: `/chantier/${i!.chantier_id}` }) })
    }
    if (t === 'demandes_materiel') {
      const { data: d } = await sb.from('demandes_materiel').select('texte, urgent, chantier_id, membres(prenom)').eq('id', b.id).single()
      const c = await chantier(d!.chantier_id)
      const qui = (d as unknown as { membres: { prenom: string } | null }).membres?.prenom ?? ''
      return Response.json({ envoyees: await envoyer(await destinataires({ roles: STAFF }), { title: `${d!.urgent ? 'URGENT · ' : ''}Matériel · ${c?.client_nom}`, body: `${qui} : ${d!.texte}`, url: '/gestion/demandes' }) })
    }
    if (t === 'affectations') {
      if (await dejaEnvoye(`aff:${b.chantier}:${b.membre}`)) return Response.json({ etat: 'déjà prévenu' })
      const c = await chantier(b.chantier)
      return Response.json({ envoyees: await envoyer([b.membre], { title: `Nouveau chantier : ${c?.client_nom}`, body: [c?.ville, c?.date_debut ? `à partir du ${dateFr(c.date_debut)}` : null].filter(Boolean).join(' · ') || 'Ouvrez la fiche pour le détail.', url: `/chantier/${b.chantier}` }) })
    }
    if (t === 'conges') {
      const { data: g } = await sb.from('conges').select('du, au, motif, membres(prenom, nom)').eq('id', b.id).single()
      const m = (g as unknown as { membres: { prenom: string; nom: string } }).membres
      return Response.json({ envoyees: await envoyer(await destinataires({ roles: STAFF }), { title: `Demande de congé · ${m.prenom}`, body: `${g!.motif} du ${dateFr(g!.du)} au ${dateFr(g!.au)}`, url: '/gestion/conges' }) })
    }
    if (t === 'conge_decide') {
      const { data: g } = await sb.from('conges').select('membre_id, du, au, statut').eq('id', b.id).single()
      if (g!.statut === 'demande') return Response.json({ etat: 'rien' })
      return Response.json({ envoyees: await envoyer([g!.membre_id], { title: `Congé ${g!.statut === 'accepte' ? 'accepté' : 'refusé'}`, body: `Du ${dateFr(g!.du)} au ${dateFr(g!.au)}`, url: '/heures' }) })
    }
    if (t === 'anomalie_vehicule') {
      const { data: a } = await sb.from('controles_vehicules').select('anomalie, km, vehicules(nom), membres(prenom)').eq('id', b.id).single()
      const x = a as unknown as { anomalie: string; vehicules: { nom: string }; membres: { prenom: string } }
      return Response.json({ envoyees: await envoyer(await destinataires({ roles: STAFF }), { title: `Véhicule · ${x.vehicules.nom}`, body: `${x.membres.prenom} : ${x.anomalie}`, url: '/gestion/vehicules' }) })
    }
    if (t === 'chantier_termine') {
      const c = await chantier(b.id)
      return Response.json({ envoyees: await envoyer(await destinataires({ roles: ['gerant'] }), { title: `Chantier terminé · ${c?.client_nom}`, body: 'Rapport et brouillon du mail client préparés dans l\'heure.', url: `/chantier/${b.id}` }) })
    }
    return Response.json({ etat: 'type inconnu' })
  } catch (e) {
    return Response.json({ erreur: String((e as Error).message) }, { status: 500 })
  }
})
