import { useEffect, useRef, useState } from 'react'
import { supabase, erreurLisible, type Chantier, type Tache } from '../lib/supabase'
import { ajouterPhoto, compresser } from '../lib/photos'
import { dateCourte, isoJour } from '../lib/format'
import { useAuth } from '../lib/auth'
import { IcoPhoto } from './Icones'
import { NOMS_PHASE, Visionneuse, photosAnnexe, usePhotosChantier } from './Photos'

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

// ---------------------------------------------------------------- Réception client : PV avec photos, signature, PDF
interface Rec { id?: string; signataire: string; sans_reserve: boolean; reserves: string | null; signe_le: string; pv_nom?: string | null }
interface PvPret { url: string; fichier: File; range: boolean; photos: number }

function pdfDepuisBase64(b64: string, nom: string): PvPret['fichier'] {
  const bin = atob(b64)
  const u = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i)
  return new File([u], nom, { type: 'application/pdf' })
}

async function partagerPv(pv: PvPret, client: string) {
  const donnees = { files: [pv.fichier], title: 'PV de réception', text: `PV de réception des travaux - ${client} - ALL TOITURES` }
  if (navigator.canShare?.(donnees)) {
    try { await navigator.share(donnees) } catch { /* partage annulé */ }
  } else window.open(pv.url, '_blank')
}

export function Reception({ chantier, taches = [] }: { chantier: Chantier; taches?: Tache[] }) {
  const { membre } = useAuth()
  const [rec, setRec] = useState<Rec | null | undefined>(undefined)
  const [ouvert, setOuvert] = useState(false)
  const [pv, setPv] = useState<PvPret | null>(null)
  const [occupe, setOccupe] = useState('')
  const [erreur, setErreur] = useState('')
  useEffect(() => {
    supabase.from('receptions').select('id, signataire, sans_reserve, reserves, signe_le, pv_nom').eq('chantier_id', chantier.id).maybeSingle().then(({ data }) => setRec((data as Rec) ?? null))
  }, [chantier.id])
  if (rec === undefined || !membre) return null

  async function ouvrirPv() {
    if (pv) return window.open(pv.url, '_blank')
    setErreur('')
    setOccupe('Ouverture du PV…')
    const { data } = await supabase.functions.invoke('photos-chantier', { body: { chantier: chantier.id, action: 'pv-lien' } })
    if (data?.lien) { window.open(data.lien, '_blank'); setOccupe(''); return }
    // PV absent (réception signée avant la mise en place du PDF) : on le fabrique.
    setOccupe('Préparation du PV…')
    const r = await supabase.functions.invoke('photos-chantier', { body: { chantier: chantier.id, action: 'pv', reception: rec!.id } })
    setOccupe('')
    if (r.data?.pdf) {
      const fichier = pdfDepuisBase64(r.data.pdf, r.data.nom)
      const p = { url: URL.createObjectURL(fichier), fichier, range: r.data.range, photos: r.data.photos }
      setPv(p)
      window.open(p.url, '_blank')
    } else setErreur('PV indisponible pour le moment. Réessayez avec du réseau.')
  }

  return (
    <section className="carte">
      <h2>Réception par le client</h2>
      {rec ? (
        <>
          <p>✅ Signée par <strong>{rec.signataire}</strong> le {dateCourte(rec.signe_le)} · {rec.sans_reserve ? 'sans réserve' : `réserves : ${rec.reserves}`}</p>
          <div className="boutons">
            <button className="btn" disabled={!!occupe} onClick={ouvrirPv}>{occupe || 'Voir le PV (PDF)'}</button>
            {pv && <button className="btn" onClick={() => partagerPv(pv, chantier.client_nom)}>Envoyer au client</button>}
          </div>
          {erreur && <p className="erreur">{erreur}</p>}
        </>
      ) : (
        <>
          <p className="sous">À la fin du chantier, le client lit le PV de réception sur le téléphone, avec les photos des travaux en annexe, puis signe. Le PV signé (PDF) est rangé dans le dossier du chantier.</p>
          <button className="btn pri" onClick={() => setOuvert(true)}>Faire signer le PV de réception</button>
        </>
      )}
      {ouvert && (
        <Signature
          chantier={chantier}
          taches={taches}
          membreId={membre.id}
          fermer={(r, p) => { setOuvert(false); if (r) setRec(r); if (p) setPv(p) }}
        />
      )}
    </section>
  )
}

function Signature({ chantier, taches, membreId, fermer }: { chantier: Chantier; taches: Tache[]; membreId: string; fermer: (r: Rec | null, pv?: PvPret | null) => void }) {
  const toile = useRef<HTMLCanvasElement>(null)
  const { photos } = usePhotosChantier(chantier.id)
  const [nom, setNom] = useState(chantier.client_nom)
  const [sansReserve, setSansReserve] = useState(true)
  const [reserves, setReserves] = useState('')
  const [signe, setSigne] = useState(false)
  const [erreur, setErreur] = useState('')
  const [etape, setEtape] = useState<'lecture' | 'envoi' | 'fini'>('lecture')
  const [resultat, setResultat] = useState<{ rec: Rec; pv: PvPret | null } | null>(null)
  const [vue, setVue] = useState<number | null>(null)

  const annexe = photos ? photosAnnexe(photos) : []
  const bordereau = taches.filter((t) => t.categorie === 'bordereau')
  const travaux = bordereau.length ? bordereau : taches.filter((t) => t.categorie === 'travaux')
  const adresse = [chantier.adresse, [chantier.code_postal, chantier.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ')

  useEffect(() => {
    const cv = toile.current
    if (!cv) return
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
  }, [etape])

  function effacer() {
    const cv = toile.current!
    cv.getContext('2d')!.clearRect(0, 0, cv.width, cv.height)
    setSigne(false)
  }

  async function enregistrer() {
    if (!nom.trim()) return setErreur('Indiquez le nom du signataire.')
    if (!sansReserve && !reserves.trim()) return setErreur('Indiquez les réserves.')
    if (!signe) return setErreur('Le client doit signer dans le cadre.')
    setErreur('')
    setEtape('envoi')
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
      const ins = await supabase.from('receptions').insert(r).select('id, signe_le').single()
      if (ins.error) throw ins.error
      const rec: Rec = { ...r, id: ins.data.id, signe_le: ins.data.signe_le }
      // PV PDF avec photos en annexe, rangé dans « F - Suivi chantier ».
      const res = await supabase.functions.invoke('photos-chantier', { body: { chantier: chantier.id, action: 'pv', reception: rec.id } })
      let pv: PvPret | null = null
      if (res.data?.pdf) {
        const fichier = pdfDepuisBase64(res.data.pdf, res.data.nom)
        pv = { url: URL.createObjectURL(fichier), fichier, range: res.data.range, photos: res.data.photos }
      }
      setResultat({ rec, pv })
      setEtape('fini')
    } catch (e) {
      setEtape('lecture')
      setErreur(navigator.onLine ? erreurLisible(e) : 'Pas de réseau : la signature doit être enregistrée avec une connexion.')
    }
  }

  if (etape === 'fini' && resultat) {
    const { rec, pv } = resultat
    return (
      <div className="fond-modal">
        <div className="modal pv-fini">
          <div className="pv-ok">✓</div>
          <h2>PV de réception signé</h2>
          <p>Signé par <strong>{rec.signataire}</strong>, {rec.sans_reserve ? 'sans réserve' : 'avec réserves'}.</p>
          {pv ? (
            <>
              <p className="sous">{pv.photos} photo{pv.photos > 1 ? 's' : ''} en annexe · {pv.range ? 'rangé dans le dossier du chantier (F - Suivi chantier)' : 'sera rangé dans le dossier dès que possible'}.</p>
              <button className="btn pri large" onClick={() => partagerPv(pv, chantier.client_nom)}>Envoyer le PV au client</button>
              <button className="btn large" onClick={() => window.open(pv.url, '_blank')}>Voir le PDF</button>
            </>
          ) : (
            <p className="sous">La signature est enregistrée. Le PDF sera disponible depuis la fiche (« Voir le PV ») dès que le réseau le permet.</p>
          )}
          <button className="lien" onClick={() => fermer(rec, pv)}>Fermer</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fond-modal">
      <div className="modal pv-modal">
        <div className="titre-ligne">
          <h2>PV de réception</h2>
          <button className="lien" onClick={() => fermer(null)} disabled={etape === 'envoi'}>Annuler</button>
        </div>
        <p className="aide">Faites lire le procès-verbal au client, avec les photos des travaux, avant qu'il signe en bas.</p>

        <article className="pv-doc">
          <header>
            <img src="/logo-couleur.png" alt="ALL TOITURES" />
            <h3>Procès-verbal de réception des travaux</h3>
            <small>{new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}{chantier.reference ? ` · ${chantier.reference}` : ''}</small>
          </header>
          <dl>
            <dt>Entreprise</dt><dd>ALL TOITURES</dd>
            <dt>Maître d'ouvrage</dt><dd>{chantier.client_nom}</dd>
            {adresse && <><dt>Chantier</dt><dd>{adresse}</dd></>}
            {chantier.bon?.objet && <><dt>Objet</dt><dd>{chantier.bon.objet}</dd></>}
          </dl>
          {travaux.length > 0 && (
            <>
              <h4>Travaux réalisés</h4>
              <ul className="pv-travaux">
                {travaux.map((t) => t.est_groupe ? <li key={t.id} className="g">{t.libelle}</li> : (
                  <li key={t.id}>{t.libelle}{t.quantite != null && <small> · {String(t.quantite).replace('.', ',')} {t.unite ?? ''}</small>}</li>
                ))}
              </ul>
            </>
          )}
          <h4>Annexe : photos des travaux {annexe.length > 0 && <small>({annexe.length})</small>}</h4>
          {!photos && <p className="sous">Chargement des photos…</p>}
          {photos && annexe.length === 0 && <p className="sous">Aucune photo avant / après pour ce chantier. Pensez à prendre les photos « Après » avant la réception.</p>}
          {annexe.length > 0 && (
            <div className="pv-photos">
              {annexe.map((p, i) => (
                <button key={p.id} onClick={() => setVue(i)}>
                  <img src={p.miniature ?? p.grande ?? ''} alt="" loading="lazy" />
                  <span>{NOMS_PHASE[p.phase]}</span>
                </button>
              ))}
            </div>
          )}
          <p className="pv-mention">La réception est prononcée contradictoirement à la date du jour. Elle fait courir la garantie de parfait achèvement (1 an), de bon fonctionnement (2 ans) et décennale (10 ans).</p>
        </article>

        <span className="q-label">Décision du client</span>
        <div className="choix pv-choix">
          <button type="button" aria-pressed={sansReserve} onClick={() => setSansReserve(true)}>Sans réserve</button>
          <button type="button" aria-pressed={!sansReserve} onClick={() => setSansReserve(false)}>Avec réserves</button>
        </div>
        {!sansReserve && <textarea rows={3} value={reserves} onChange={(e) => setReserves(e.target.value)} placeholder="Réserves du client (ce qui reste à reprendre)" />}
        <label>Nom du signataire<input value={nom} onChange={(e) => setNom(e.target.value)} /></label>
        <span className="q-label">Signature du client <small>(« Lu et approuvé »)</small></span>
        <canvas ref={toile} className="toile-signature" />
        <button type="button" className="lien" onClick={effacer}>Effacer la signature</button>
        {erreur && <p className="erreur">{erreur}</p>}
        <button type="button" className="btn go large" disabled={etape === 'envoi'} onClick={enregistrer}>{etape === 'envoi' ? 'Création du PV…' : 'Valider la réception'}</button>
      </div>
      {vue !== null && <Visionneuse photos={annexe} index={vue} changer={setVue} fermer={() => setVue(null)} />}
    </div>
  )
}
