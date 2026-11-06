import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { supabase, erreurLisible } from '../lib/supabase'
import { compresser } from '../lib/photos'
import { dateCourte, isoJour } from '../lib/format'
import { estStaff, useAuth } from '../lib/auth'
import { IcoRetour } from '../components/Icones'

export interface Outil {
  id: string; nom: string; marque: string | null; reference: string | null; numero_serie: string | null; photo_path: string | null
  achat_le: string | null; valeur: number | null; prochaine_verif: string | null; verif_note: string | null
  etat: 'ok' | 'abime' | 'reparation' | 'perdu'; detenteur: string | null; chantier_id: string | null; vehicule_id: string | null; sorti_le: string | null; notes: string | null; actif: boolean
  membres?: { prenom: string } | null; chantiers?: { client_nom: string } | null; vehicules?: { nom: string } | null
}
interface Mvt { id: string; type: string; etat: string | null; commentaire: string | null; le: string; membres: { prenom: string } | null; chantiers: { client_nom: string } | null; vehicules: { nom: string } | null }

const SELECT = '*, membres:detenteur(prenom), chantiers(client_nom), vehicules(nom)'
export const DELAI_SORTIE = 14
const ETATS: Record<Outil['etat'], string> = { ok: 'En état', abime: 'Abîmé', reparation: 'En réparation', perdu: 'Perdu' }
const joursDepuis = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5)
const joursAvant = (d: string) => Math.round((new Date(d + 'T12:00').getTime() - new Date(isoJour() + 'T12:00').getTime()) / 864e5)

/** Ce qui demande une action sur un outil : sorti trop longtemps, abîmé, vérification due. */
export function alertesOutil(o: Outil): { txt: string; niveau: 'alerte' | 'attention' }[] {
  const r: { txt: string; niveau: 'alerte' | 'attention' }[] = []
  if (o.etat === 'abime') r.push({ txt: 'Rendu abîmé', niveau: 'alerte' })
  if (o.etat === 'perdu') r.push({ txt: 'Déclaré perdu', niveau: 'alerte' })
  if (o.sorti_le && joursDepuis(o.sorti_le) > DELAI_SORTIE) r.push({ txt: `Sorti depuis ${joursDepuis(o.sorti_le)} jours`, niveau: 'attention' })
  if (o.prochaine_verif) {
    const j = joursAvant(o.prochaine_verif)
    if (j < 0) r.push({ txt: `Vérification dépassée (${dateCourte(o.prochaine_verif)})`, niveau: 'alerte' })
    else if (j <= 30) r.push({ txt: `Vérification dans ${j} j`, niveau: 'attention' })
  }
  return r
}

function ou(o: Outil) {
  if (o.etat === 'reparation') return 'En réparation'
  if (!o.detenteur) return 'Au dépôt'
  return `Chez ${o.membres?.prenom ?? '?'}${o.chantiers ? ` · ${o.chantiers.client_nom}` : o.vehicules ? ` · ${o.vehicules.nom}` : ''}`
}

async function urlPhoto(path: string | null) {
  if (!path) return null
  const { data } = await supabase.storage.from('outils').createSignedUrl(path, 3600)
  return data?.signedUrl ?? null
}

// ---------------------------------------------------------------- Liste
export default function Outillage() {
  const { membre } = useAuth()
  const staff = estStaff(membre)
  const [liste, setListe] = useState<Outil[] | null>(null)
  const [filtre, setFiltre] = useState<'tous' | 'sortis' | 'depot' | 'alertes'>('tous')
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Partial<Outil> | null>(null)
  const [etiquettes, setEtiquettes] = useState(false)
  const charger = () => supabase.from('outils').select(SELECT).eq('actif', true).order('nom').then(({ data }) => setListe((data ?? []) as unknown as Outil[]))
  useEffect(() => { charger() }, [])
  if (!liste) return <div className="page"><p className="sous">Chargement…</p></div>

  const n = { sortis: liste.filter((o) => o.detenteur).length, alertes: liste.filter((o) => alertesOutil(o).length).length }
  const visibles = liste
    .filter((o) => filtre === 'tous' || (filtre === 'sortis' ? !!o.detenteur : filtre === 'depot' ? !o.detenteur : alertesOutil(o).length > 0))
    .filter((o) => !q || `${o.nom} ${o.marque ?? ''} ${o.reference ?? ''} ${o.membres?.prenom ?? ''}`.toLowerCase().includes(q.toLowerCase()))

  return (
    <div className="page">
      <Link className="retour" to={staff ? '/gestion' : '/'}><IcoRetour /> {staff ? 'Gestion' : 'Chantiers'}</Link>
      <div className="titre-ligne">
        <h1>Outillage</h1>
        {staff && <button className="btn pri" onClick={() => setEdit({ nom: '', etat: 'ok' })}>+ Outil</button>}
      </div>
      <p className="sous">{liste.length} outil{liste.length > 1 ? 's' : ''} · {n.sortis} sorti{n.sortis > 1 ? 's' : ''}{n.alertes ? ` · ${n.alertes} à surveiller` : ''}</p>
      {!staff && <p className="aide">Pour prendre ou rendre un outil : scannez son QR code avec l'appareil photo, ou touchez-le dans la liste.</p>}
      <div className="filtres">
        <button className="puce" aria-pressed={filtre === 'tous'} onClick={() => setFiltre('tous')}>Tous</button>
        <button className="puce" aria-pressed={filtre === 'sortis'} onClick={() => setFiltre('sortis')}>Sortis <span>{n.sortis}</span></button>
        <button className="puce" aria-pressed={filtre === 'depot'} onClick={() => setFiltre('depot')}>Au dépôt <span>{liste.length - n.sortis}</span></button>
        {n.alertes > 0 && <button className="puce" aria-pressed={filtre === 'alertes'} onClick={() => setFiltre('alertes')}>⚠ À surveiller <span>{n.alertes}</span></button>}
      </div>
      <input className="recherche" placeholder="Chercher un outil, une personne…" value={q} onChange={(e) => setQ(e.target.value)} />
      {liste.length === 0 && <div className="vide">{staff ? 'Ajoutez vos gros outils (perfo, scie, harnais, échafaudage…). Chaque outil aura son QR code à coller dessus.' : 'Aucun outil enregistré pour l\'instant.'}</div>}
      <div className="liste">
        {visibles.map((o) => {
          const al = alertesOutil(o)
          const niv = al.some((a) => a.niveau === 'alerte') ? 'alerte' : al.length ? 'attention' : o.detenteur ? 'sorti' : 'ok'
          return (
            <Link key={o.id} to={`/outil/${o.id}`} className={`outil-ligne o-${niv}`}>
              <span className="o-ico">🛠</span>
              <span className="o-txt">
                <strong>{o.nom}</strong>
                <small>{[o.marque, o.reference].filter(Boolean).join(' · ')}</small>
                <b>{ou(o)}{o.sorti_le ? ` · ${joursDepuis(o.sorti_le) === 0 ? 'aujourd\'hui' : `depuis ${joursDepuis(o.sorti_le)} j`}` : ''}</b>
                {al.map((a, i) => <em key={i} className={a.niveau === 'alerte' ? 'al-r' : 'al-o'}>{a.txt}</em>)}
              </span>
              <span className="chev">›</span>
            </Link>
          )
        })}
      </div>
      {staff && liste.length > 0 && <button className="btn large" onClick={() => setEtiquettes(true)}>🏷 Imprimer les étiquettes QR</button>}
      {edit && <FicheOutil o={edit} fermer={() => { setEdit(null); charger() }} />}
      {etiquettes && <Etiquettes outils={liste} fermer={() => setEtiquettes(false)} />}
    </div>
  )
}

// ---------------------------------------------------------------- Page d'un outil (ouverte par le QR code)
export function OutilPage() {
  const { id } = useParams()
  const nav = useNavigate()
  const { membre } = useAuth()
  const staff = estStaff(membre)
  const [o, setO] = useState<Outil | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [mvts, setMvts] = useState<Mvt[]>([])
  const [action, setAction] = useState<'' | 'prendre' | 'rendre'>('')
  const [edit, setEdit] = useState(false)
  const [msg, setMsg] = useState('')
  const charger = async () => {
    const [a, b] = await Promise.all([
      supabase.from('outils').select(SELECT).eq('id', id).maybeSingle(),
      supabase.from('mouvements_outils').select('id, type, etat, commentaire, le, membres(prenom), chantiers(client_nom), vehicules(nom)').eq('outil_id', id).order('le', { ascending: false }).limit(15)
    ])
    const x = a.data as unknown as Outil | null
    setO(x)
    setMvts((b.data ?? []) as unknown as Mvt[])
    if (x) setPhoto(await urlPhoto(x.photo_path))
  }
  useEffect(() => { charger() }, [id])
  if (!o) return <div className="page"><p className="sous">Chargement…</p></div>

  const aMoi = o.detenteur === membre?.id
  const al = alertesOutil(o)
  return (
    <div className="page">
      <button className="retour" onClick={() => nav('/outils')}><IcoRetour /> Outillage</button>
      <header className="outil-tete">
        {photo ? <img src={photo} alt="" /> : <span className="o-ico grand">🛠</span>}
        <div>
          <h1>{o.nom}</h1>
          <p className="sous">{[o.marque, o.reference, o.numero_serie ? `n° ${o.numero_serie}` : null].filter(Boolean).join(' · ')}</p>
        </div>
      </header>
      <section className={`carte outil-ou ${o.detenteur ? 'sorti' : 'depot'}`}>
        <small>Où est-il ?</small>
        <strong>{aMoi ? 'Chez vous' : ou(o)}</strong>
        {o.sorti_le && <span className="sous">pris le {dateCourte(o.sorti_le)}{aMoi && o.chantiers ? ` pour ${o.chantiers.client_nom}` : ''}</span>}
        {o.etat !== 'ok' && <span className={`etat-o e-${o.etat}`}>{ETATS[o.etat]}</span>}
      </section>
      {msg && <p className="ok">{msg}</p>}
      {al.length > 0 && staff && <ul className="vg-actions">{al.map((a, i) => <li key={i} className={`n-${a.niveau}`}><i />{a.txt}</li>)}</ul>}

      {o.etat !== 'reparation' && o.etat !== 'perdu' && (
        aMoi
          ? <button className="btn go large" onClick={() => setAction('rendre')}>↩ Je le rends au dépôt</button>
          : <button className="btn pri large" onClick={() => setAction('prendre')}>{o.detenteur ? `Je le récupère (chez ${o.membres?.prenom})` : '✋ Je le prends'}</button>
      )}

      {o.prochaine_verif && (
        <section className="carte"><h2>Vérification</h2><p>Prochaine : <strong>{dateCourte(o.prochaine_verif)}</strong>{o.verif_note ? ` · ${o.verif_note}` : ''}</p></section>
      )}
      {o.notes && <section className="carte"><h2>Notes</h2><p className="pre">{o.notes}</p></section>}

      <section className="carte">
        <h2>Historique</h2>
        {mvts.length === 0 && <p className="sous">Jamais sorti.</p>}
        <ul className="vg-histo">
          {mvts.map((m) => (
            <li key={m.id}>
              <span>{dateCourte(m.le)}</span>
              <span>{m.type === 'sortie' ? `Pris par ${m.membres?.prenom ?? '?'}${m.chantiers ? ` · ${m.chantiers.client_nom}` : m.vehicules ? ` · ${m.vehicules.nom}` : ''}` : m.type === 'retour' ? `Rendu par ${m.membres?.prenom ?? '?'}${m.commentaire ? ` · ${m.commentaire}` : ''}` : `État : ${m.etat}`}</span>
              <span className={m.etat === 'abime' ? 'urgent' : 'ok-txt'}>{m.type === 'sortie' ? '→' : m.etat === 'abime' ? '⚠' : '✓'}</span>
            </li>
          ))}
        </ul>
      </section>

      {staff && (
        <div className="boutons">
          <button className="btn" onClick={() => setEdit(true)}>Modifier la fiche</button>
          {o.etat !== 'ok' && <button className="btn" onClick={async () => { await supabase.from('outils').update({ etat: 'ok' }).eq('id', o.id); await supabase.from('mouvements_outils').insert({ outil_id: o.id, membre_id: membre!.id, type: 'etat', etat: 'ok', commentaire: 'Remis en état' }); charger() }}>✓ Remis en état</button>}
          {o.etat === 'ok' && <button className="btn" onClick={async () => { await supabase.from('outils').update({ etat: 'reparation', detenteur: null, chantier_id: null, vehicule_id: null, sorti_le: null }).eq('id', o.id); await supabase.from('mouvements_outils').insert({ outil_id: o.id, membre_id: membre!.id, type: 'etat', etat: 'reparation', commentaire: 'Parti en réparation' }); charger() }}>Envoyer en réparation</button>}
        </div>
      )}

      {action === 'prendre' && <Prendre o={o} fermer={(ok) => { setAction(''); if (ok) { setMsg('C\'est noté : l\'outil est à votre nom.'); charger() } }} />}
      {action === 'rendre' && <Rendre o={o} fermer={(ok) => { setAction(''); if (ok) { setMsg('Merci, outil rendu.'); charger() } }} />}
      {edit && <FicheOutil o={o} fermer={() => { setEdit(false); charger() }} />}
    </div>
  )
}

function Prendre({ o, fermer }: { o: Outil; fermer: (ok: boolean) => void }) {
  const [chantiers, setChantiers] = useState<{ id: string; client_nom: string; affecte: boolean }[]>([])
  const [camions, setCamions] = useState<{ id: string; nom: string }[]>([])
  const [ch, setCh] = useState('')
  const [vh, setVh] = useState('')
  const [erreur, setErreur] = useState('')
  useEffect(() => {
    supabase.rpc('chantiers_pointage').then(({ data }) => setChantiers(((data ?? []) as { id: string; client_nom: string; affecte: boolean }[])))
    supabase.from('vehicules').select('id, nom').eq('actif', true).order('nom').then(({ data }) => setCamions(data ?? []))
  }, [])
  async function valider() {
    const { error } = await supabase.rpc('prendre_outil', { o: o.id, ch: ch || null, vh: vh || null })
    if (error) return setErreur(erreurLisible(error))
    fermer(true)
  }
  return (
    <div className="fond-modal" onClick={() => fermer(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Je prends : {o.nom}</h2>
        <label>Pour quel chantier ?
          <select value={ch} onChange={(e) => setCh(e.target.value)}>
            <option value="">— Pas de chantier précis —</option>
            {chantiers.filter((c) => c.affecte).map((c) => <option key={c.id} value={c.id}>{c.client_nom}</option>)}
            {chantiers.filter((c) => !c.affecte).map((c) => <option key={c.id} value={c.id}>{c.client_nom}</option>)}
          </select>
        </label>
        {camions.length > 0 && (
          <label>Dans quel camion ?
            <select value={vh} onChange={(e) => setVh(e.target.value)}>
              <option value="">—</option>
              {camions.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
            </select>
          </label>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="deux"><button className="btn" onClick={() => fermer(false)}>Annuler</button><button className="btn pri" onClick={valider}>C'est noté</button></div>
      </div>
    </div>
  )
}

function Rendre({ o, fermer }: { o: Outil; fermer: (ok: boolean) => void }) {
  const [etat, setEtat] = useState<'ok' | 'abime'>('ok')
  const [com, setCom] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  async function valider() {
    if (etat === 'abime' && !com.trim()) return setErreur('Dites ce qui ne va pas.')
    setEnvoi(true)
    let chemin: string | null = null
    if (photo) {
      chemin = `${o.id}/${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from('outils').upload(chemin, await compresser(photo), { contentType: 'image/jpeg' })
      if (up.error) chemin = null
    }
    const { error } = await supabase.rpc('rendre_outil', { o: o.id, e: etat, c: com.trim() || null, ph: chemin })
    setEnvoi(false)
    if (error) return setErreur(erreurLisible(error))
    fermer(true)
  }
  return (
    <div className="fond-modal" onClick={() => fermer(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Je rends : {o.nom}</h2>
        <span className="q-label">Dans quel état ?</span>
        <div className="choix pv-choix">
          <button type="button" aria-pressed={etat === 'ok'} onClick={() => setEtat('ok')}>✓ En état</button>
          <button type="button" aria-pressed={etat === 'abime'} onClick={() => setEtat('abime')}>⚠ Abîmé / incomplet</button>
        </div>
        <textarea rows={2} value={com} onChange={(e) => setCom(e.target.value)} placeholder={etat === 'abime' ? 'Qu\'est-ce qui ne va pas ? (obligatoire)' : 'Commentaire (facultatif)'} />
        {etat === 'abime' && (
          <label className="btn depot-doc">{photo ? `📷 ${photo.name}` : '📷 Ajouter une photo'}<input type="file" accept="image/*" capture="environment" hidden onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} /></label>
        )}
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="deux"><button className="btn" onClick={() => fermer(false)}>Annuler</button><button className="btn go" disabled={envoi} onClick={valider}>{envoi ? 'Envoi…' : 'Rendu'}</button></div>
      </div>
    </div>
  )
}

function FicheOutil({ o, fermer }: { o: Partial<Outil>; fermer: () => void }) {
  const [f, setF] = useState({ nom: o.nom ?? '', marque: o.marque ?? '', reference: o.reference ?? '', numero_serie: o.numero_serie ?? '', achat_le: o.achat_le ?? '', valeur: o.valeur?.toString() ?? '', prochaine_verif: o.prochaine_verif ?? '', verif_note: o.verif_note ?? '', notes: o.notes ?? '' })
  const photo = useRef<HTMLInputElement>(null)
  const [nomPhoto, setNomPhoto] = useState('')
  const [erreur, setErreur] = useState('')
  const maj = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v })
  async function enregistrer() {
    if (!f.nom.trim()) return setErreur('Indiquez le nom de l\'outil.')
    const d: Record<string, unknown> = { nom: f.nom.trim(), marque: f.marque || null, reference: f.reference || null, numero_serie: f.numero_serie || null, achat_le: f.achat_le || null, valeur: f.valeur ? Number(f.valeur.replace(',', '.')) : null, prochaine_verif: f.prochaine_verif || null, verif_note: f.verif_note || null, notes: f.notes || null }
    const fichier = photo.current?.files?.[0]
    if (fichier) {
      const chemin = `fiches/${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from('outils').upload(chemin, await compresser(fichier), { contentType: 'image/jpeg' })
      if (!up.error) d.photo_path = chemin
    }
    const r = o.id ? await supabase.from('outils').update(d).eq('id', o.id) : await supabase.from('outils').insert(d)
    if (r.error) return setErreur(erreurLisible(r.error))
    fermer()
  }
  return (
    <div className="fond-modal" onClick={fermer}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{o.id ? 'Modifier l\'outil' : 'Nouvel outil'}</h2>
        <label>Nom<input value={f.nom} onChange={(e) => maj('nom', e.target.value)} placeholder="ex. Perforateur, Harnais n°2, Échafaudage roulant" /></label>
        <div className="deux">
          <label>Marque<input value={f.marque} onChange={(e) => maj('marque', e.target.value)} placeholder="Hilti" /></label>
          <label>Référence<input value={f.reference} onChange={(e) => maj('reference', e.target.value)} placeholder="TE 30-A36" /></label>
        </div>
        <div className="deux">
          <label>N° de série<input value={f.numero_serie} onChange={(e) => maj('numero_serie', e.target.value)} /></label>
          <label>Valeur (€)<input inputMode="decimal" value={f.valeur} onChange={(e) => maj('valeur', e.target.value)} /></label>
        </div>
        <div className="deux">
          <label>Acheté le<input type="date" value={f.achat_le} onChange={(e) => maj('achat_le', e.target.value)} /></label>
          <label>Prochaine vérif.<input type="date" value={f.prochaine_verif} onChange={(e) => maj('prochaine_verif', e.target.value)} /></label>
        </div>
        {f.prochaine_verif && <label>Vérification<input value={f.verif_note} onChange={(e) => maj('verif_note', e.target.value)} placeholder="ex. annuelle, par un organisme agréé" /></label>}
        <label className="btn depot-doc">{nomPhoto ? `📷 ${nomPhoto}` : '📷 Photo de l\'outil'}<input ref={photo} type="file" accept="image/*" hidden onChange={(e) => setNomPhoto(e.target.files?.[0]?.name ?? '')} /></label>
        <label>Notes<textarea rows={2} value={f.notes} onChange={(e) => maj('notes', e.target.value)} placeholder="Accessoires fournis, garantie…" /></label>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="boutons">
          {o.id && <button className="btn danger" onClick={async () => { if (confirm('Retirer cet outil de la liste ?')) { await supabase.from('outils').update({ actif: false }).eq('id', o.id!); fermer() } }}>Retirer</button>}
          <button className="btn" onClick={fermer}>Annuler</button>
          <button className="btn pri" onClick={enregistrer}>Enregistrer</button>
        </div>
      </div>
    </div>
  )
}

/** Planche A4 : 3 × 7 étiquettes (format courant 70 × 42 mm), à imprimer depuis le téléphone ou l'ordinateur. */
function Etiquettes({ outils, fermer }: { outils: Outil[]; fermer: () => void }) {
  const [qrs, setQrs] = useState<Record<string, string>>({})
  useEffect(() => {
    Promise.all(outils.map(async (o) => [o.id, await QRCode.toDataURL(`${location.origin}/outil/${o.id}`, { width: 300, margin: 1, errorCorrectionLevel: 'M' })] as const)).then((l) => setQrs(Object.fromEntries(l)))
  }, [outils])
  return (
    <div className="etiquettes-ecran">
      <div className="boutons no-print">
        <button className="btn" onClick={fermer}>Fermer</button>
        <button className="btn pri" onClick={() => window.print()}>Imprimer</button>
      </div>
      <p className="aide no-print">Planche A4 de 21 étiquettes (70 × 42 mm). Collez chaque étiquette sur son outil, à l'abri des chocs.</p>
      <div className="planche">
        {outils.map((o) => (
          <div key={o.id} className="etiquette">
            {qrs[o.id] && <img src={qrs[o.id]} alt="" />}
            <div><strong>{o.nom}</strong><small>{[o.marque, o.reference].filter(Boolean).join(' ')}</small><em>ALL TOITURES</em></div>
          </div>
        ))}
      </div>
    </div>
  )
}
