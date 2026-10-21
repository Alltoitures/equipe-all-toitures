import { useEffect, useRef, useState } from 'react'
import { supabase, erreurLisible, type Chantier } from '../lib/supabase'
import { ajouterPhoto, compresser } from '../lib/photos'
import { dateCourte, isoJour } from '../lib/format'
import { useAuth } from '../lib/auth'
import { IcoPhoto } from './Icones'

// ---------------------------------------------------------------- Sécurité du jour
export const POINTS_SECURITE = [
  'EPI portés (casque, chaussures, gants)',
  'Harnais, longe et point d\'ancrage / ligne de vie',
  'Échelle calée et attachée',
  'Échafaudage ou nacelle vérifié',
  'Abords balisés, passants protégés',
  'Météo vérifiée (vent, pluie)',
  'Point sécurité fait avec l\'équipe'
]

export function SecuriteJour({ chantierId }: { chantierId: string }) {
  const { membre } = useAuth()
  const [fait, setFait] = useState<{ points: Record<string, boolean>; remarque: string | null; membres: { prenom: string } | null; created_at: string } | null | undefined>(undefined)
  const [points, setPoints] = useState<Record<string, boolean>>({})
  const [remarque, setRemarque] = useState('')
  const [ouvert, setOuvert] = useState(false)
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    supabase.from('controles_securite').select('points, remarque, created_at, membres(prenom)').eq('chantier_id', chantierId).eq('jour', isoJour()).maybeSingle()
      .then(({ data }) => setFait((data as never) ?? null))
  }, [chantierId])

  async function valider() {
    if (!membre) return
    const { error } = await supabase.from('controles_securite').upsert({ chantier_id: chantierId, membre_id: membre.id, jour: isoJour(), points, remarque: remarque || null }, { onConflict: 'chantier_id,jour' })
    if (error) return setErreur(erreurLisible(error))
    setFait({ points, remarque, membres: { prenom: membre.prenom }, created_at: new Date().toISOString() })
    setOuvert(false)
  }

  if (fait === undefined) return null
  if (fait && !ouvert) {
    const nb = Object.values(fait.points).filter(Boolean).length
    return (
      <section className="carte securite ok-securite">
        <h2>✅ Sécurité du jour</h2>
        <p className="sous">Faite par {fait.membres?.prenom} à {new Date(fait.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} · {nb}/{POINTS_SECURITE.length} points{fait.remarque ? ` · ${fait.remarque}` : ''}</p>
      </section>
    )
  }
  return (
    <section className="carte securite">
      <h2>🦺 Sécurité du jour</h2>
      {!ouvert ? (
        <>
          <p className="sous">À faire en arrivant sur le chantier, 1 minute.</p>
          <button className="btn pri" onClick={() => setOuvert(true)}>Faire le point sécurité</button>
        </>
      ) : (
        <>
          <ul className="taches">
            {POINTS_SECURITE.map((p) => (
              <li key={p}>
                <label className={points[p] ? 'fait' : ''}>
                  <input type="checkbox" checked={!!points[p]} onChange={() => setPoints({ ...points, [p]: !points[p] })} />
                  <span>{p}</span>
                </label>
              </li>
            ))}
          </ul>
          <label>Remarque (facultatif)<input value={remarque} onChange={(e) => setRemarque(e.target.value)} placeholder="Ex. : pas d'échafaudage, toit glissant le matin" /></label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="btn go large" onClick={valider}>Valider</button>
        </>
      )}
    </section>
  )
}

// ---------------------------------------------------------------- Demandes de matériel + bon de livraison
interface Demande { id: string; texte: string; urgent: boolean; statut: string; created_at: string; membres: { prenom: string } | null }
const STATUT_DEMANDE: Record<string, string> = { ouverte: 'Demandée', commandee: 'Commandée', livree: 'Livrée', annulee: 'Annulée' }

export function DemandesMateriel({ chantierId }: { chantierId: string }) {
  const { membre } = useAuth()
  const [liste, setListe] = useState<Demande[]>([])
  const [texte, setTexte] = useState('')
  const [urgent, setUrgent] = useState(false)
  const [msg, setMsg] = useState('')
  const [nbBl, setNbBl] = useState(0)
  const bl = useRef<HTMLInputElement>(null)

  const charger = () => supabase.from('demandes_materiel').select('id, texte, urgent, statut, created_at, membres(prenom)').eq('chantier_id', chantierId).order('created_at', { ascending: false }).limit(20)
    .then(({ data }) => setListe((data ?? []) as unknown as Demande[]))
  useEffect(() => { charger() }, [chantierId])

  async function demander(e: React.FormEvent) {
    e.preventDefault()
    if (!membre || !texte.trim()) return
    const { error } = await supabase.from('demandes_materiel').insert({ chantier_id: chantierId, membre_id: membre.id, texte: texte.trim(), urgent })
    if (error) return setMsg(erreurLisible(error))
    setTexte('')
    setUrgent(false)
    setMsg('Demande envoyée à Aurélien et Adeline.')
    charger()
  }

  async function photosBl(f: FileList | null) {
    if (!f?.length || !membre) return
    for (const x of Array.from(f)) await ajouterPhoto({ chantier_id: chantierId, membre_id: membre.id, phase: 'livraison', blob: await compresser(x) })
    setNbBl((n) => n + f.length)
    if (bl.current) bl.current.value = ''
  }

  return (
    <>
      <section className="carte">
        <h2>Livraison reçue</h2>
        <p className="sous">Photographiez le bon de livraison : il est rangé dans le dossier fournisseurs du chantier.</p>
        <label className="btn">
          <IcoPhoto /> Photo du bon de livraison{nbBl ? ` · ${nbBl} envoyée${nbBl > 1 ? 's' : ''}` : ''}
          <input ref={bl} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => photosBl(e.target.files)} />
        </label>
      </section>

      <section className="carte">
        <h2>Demander du matériel</h2>
        <form onSubmit={demander} className="pile">
          <textarea rows={2} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Ex. : 2 rouleaux d'écran HPV, 1 boîte de vis inox 6x80" required />
          <label className="case-ligne"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent (bloque le chantier)</label>
          <button className="btn pri">Envoyer la demande</button>
        </form>
        {msg && <p className="aide">{msg}</p>}
        {liste.length > 0 && (
          <ul className="liste-simple">
            {liste.map((d) => (
              <li key={d.id}>
                <span>{d.urgent && <strong className="urgent">URGENT </strong>}{d.texte}<small>{d.membres?.prenom} · {dateCourte(d.created_at)}</small></span>
                <span className={`statut-demande ${d.statut}`}>{STATUT_DEMANDE[d.statut]}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// ---------------------------------------------------------------- Réception client (signature)
interface Rec { signataire: string; sans_reserve: boolean; reserves: string | null; signe_le: string }

export function Reception({ chantier }: { chantier: Chantier }) {
  const { membre } = useAuth()
  const [rec, setRec] = useState<Rec | null | undefined>(undefined)
  const [ouvert, setOuvert] = useState(false)
  useEffect(() => {
    supabase.from('receptions').select('signataire, sans_reserve, reserves, signe_le').eq('chantier_id', chantier.id).maybeSingle().then(({ data }) => setRec((data as Rec) ?? null))
  }, [chantier.id])
  if (rec === undefined || !membre) return null
  return (
    <section className="carte">
      <h2>Réception par le client</h2>
      {rec ? (
        <p>✅ Signée par <strong>{rec.signataire}</strong> le {dateCourte(rec.signe_le)} · {rec.sans_reserve ? 'sans réserve' : `réserves : ${rec.reserves}`}</p>
      ) : (
        <>
          <p className="sous">À la fin du chantier, faites signer le client sur le téléphone. La signature est rangée dans le dossier et reprise dans le rapport.</p>
          <button className="btn" onClick={() => setOuvert(true)}>Faire signer le client</button>
        </>
      )}
      {ouvert && <Signature chantier={chantier} membreId={membre.id} fermer={(r) => { setOuvert(false); if (r) setRec(r) }} />}
    </section>
  )
}

function Signature({ chantier, membreId, fermer }: { chantier: Chantier; membreId: string; fermer: (r: Rec | null) => void }) {
  const toile = useRef<HTMLCanvasElement>(null)
  const [nom, setNom] = useState(chantier.client_nom)
  const [sansReserve, setSansReserve] = useState(true)
  const [reserves, setReserves] = useState('')
  const [signe, setSigne] = useState(false)
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

  useEffect(() => {
    const cv = toile.current!
    const r = cv.getBoundingClientRect()
    cv.width = r.width * 2
    cv.height = r.height * 2
    const ctx = cv.getContext('2d')!
    ctx.scale(2, 2)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#0B1921'
    let dessin = false
    const pos = (e: PointerEvent) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] }
    const bas = (e: PointerEvent) => { dessin = true; cv.setPointerCapture(e.pointerId); const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y) }
    const bouge = (e: PointerEvent) => { if (!dessin) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); setSigne(true) }
    const haut = () => { dessin = false }
    cv.addEventListener('pointerdown', bas)
    cv.addEventListener('pointermove', bouge)
    cv.addEventListener('pointerup', haut)
    return () => { cv.removeEventListener('pointerdown', bas); cv.removeEventListener('pointermove', bouge); cv.removeEventListener('pointerup', haut) }
  }, [])

  function effacer() {
    const cv = toile.current!
    cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height)
    setSigne(false)
  }

  async function enregistrer() {
    if (!signe) return setErreur('La signature est vide.')
    if (!sansReserve && !reserves.trim()) return setErreur('Indiquez les réserves.')
    setOccupe(true)
    setErreur('')
    try {
      const cv = toile.current!
      // Fond blanc pour un fichier lisible partout.
      const out = document.createElement('canvas')
      out.width = cv.width
      out.height = cv.height + 120
      const o = out.getContext('2d')!
      o.fillStyle = '#fff'
      o.fillRect(0, 0, out.width, out.height)
      o.drawImage(cv, 0, 0)
      o.fillStyle = '#0B1921'
      o.font = '28px sans-serif'
      o.fillText(`Réception ${sansReserve ? 'sans réserve' : 'avec réserves'} — ${nom} — ${new Date().toLocaleString('fr-FR')}`, 20, cv.height + 45)
      if (!sansReserve) o.fillText(`Réserves : ${reserves.slice(0, 90)}`, 20, cv.height + 90)
      const blob = await new Promise<Blob>((ok) => out.toBlob((b) => ok(b!), 'image/png'))
      const chemin = `${chantier.id}/reception-${crypto.randomUUID()}.png`
      const up = await supabase.storage.from('photos').upload(chemin, blob, { contentType: 'image/png' })
      if (up.error) throw up.error
      const r = { chantier_id: chantier.id, membre_id: membreId, signataire: nom.trim(), sans_reserve: sansReserve, reserves: sansReserve ? null : reserves.trim(), signature_path: chemin }
      const ins = await supabase.from('receptions').insert(r)
      if (ins.error) throw ins.error
      fermer({ ...r, signe_le: new Date().toISOString() })
    } catch (e) {
      setErreur(navigator.onLine ? erreurLisible(e) : 'Pas de réseau : la signature doit être enregistrée avec une connexion.')
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="fond-modal">
      <div className="modal">
        <h2>Réception des travaux</h2>
        <p className="aide">Le client confirme que les travaux sont terminés.</p>
        <label>Nom du signataire<input value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        <div className="choix">
          <button type="button" aria-pressed={sansReserve} onClick={() => setSansReserve(true)}>Sans réserve</button>
          <button type="button" aria-pressed={!sansReserve} onClick={() => setSansReserve(false)}>Avec réserves</button>
        </div>
        {!sansReserve && <textarea rows={3} value={reserves} onChange={(e) => setReserves(e.target.value)} placeholder="Réserves du client" />}
        <span className="q-label">Signature du client</span>
        <canvas ref={toile} className="toile-signature" />
        <button type="button" className="lien" onClick={effacer}>Effacer</button>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="boutons">
          <button type="button" className="btn" onClick={() => fermer(null)}>Annuler</button>
          <button type="button" className="btn go" disabled={occupe} onClick={enregistrer}>{occupe ? 'Enregistrement…' : 'Valider'}</button>
        </div>
      </div>
    </div>
  )
}
