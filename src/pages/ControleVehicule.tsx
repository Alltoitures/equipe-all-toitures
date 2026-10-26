import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { dateCourte } from '../lib/format'
import { IcoRetour, IcoCheck } from '../components/Icones'
import type { Vehicule } from './gestion/Vehicules'
import { ETATS_NIVEAU, NIVEAUX, POINTS_VENDREDI, etatVehicule, moisLabel, type ControleV, type EtatNiveau } from '../lib/vehicules'

/** Conservé pour compatibilité avec les anciens imports. */
export const POINTS_VEHICULE = POINTS_VENDREDI

export default function ControleVehicule() {
  const nav = useNavigate()
  const { membre } = useAuth()
  const [vehicules, setVehicules] = useState<Vehicule[]>([])
  const [ctrls, setCtrls] = useState<ControleV[]>([])
  const [vid, setVid] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const charger = () => Promise.all([
    supabase.from('vehicules').select('*').eq('actif', true).order('nom'),
    supabase.from('controles_vehicules').select('id, vehicule_id, type, jour, km, points, anomalie, anomalie_traitee, membres(prenom)').order('jour', { ascending: false }).order('created_at', { ascending: false }).limit(80)
  ]).then(([v, c]) => {
    setVehicules((v.data ?? []) as Vehicule[])
    setCtrls((c.data ?? []) as unknown as ControleV[])
  })
  useEffect(() => { charger() }, [])

  const v = vehicules.find((x) => x.id === vid)
  if (v && membre) {
    return <Formulaire v={v} ctrls={ctrls} membreId={membre.id} onRetour={() => setVid(null)} onFini={(m) => { setMsg(m); setVid(null); charger() }} />
  }

  const vendredi = new Date().getDay() === 5
  return (
    <div className="page">
      <button className="retour" onClick={() => nav(-1)}><IcoRetour /> Retour</button>
      <h1>Camions</h1>
      <p className="aide">Chaque vendredi : nettoyage et contrôle. Une fois par mois : les niveaux (huile, refroidissement, lave-glace, AdBlue).</p>
      {msg && <p className="ok">{msg}</p>}
      {vehicules.length === 0 && <div className="vide">Aucun camion enregistré pour l'instant.</div>}
      {vehicules.map((x) => {
        const e = etatVehicule(x.id, ctrls)
        return (
          <button key={x.id} className="carte veh-carte" onClick={() => { setMsg(''); setVid(x.id) }}>
            <div className="titre-ligne"><strong>{x.nom}</strong>{x.immatriculation && <span className="sous">{x.immatriculation}</span>}</div>
            <div className="veh-etats">
              <Etat fait={e.vendrediFait} urgent={vendredi} titre="Vendredi" detail={e.vendrediFait ? `fait par ${e.hebdo?.membres?.prenom ?? '—'} le ${dateCourte(e.hebdo?.jour)}` : 'nettoyage à faire'} />
              <Etat fait={e.niveauxFaits} urgent={e.niveauxDus} titre={`Niveaux de ${moisLabel()}`} detail={e.niveauxFaits ? `faits par ${e.mensuel?.membres?.prenom ?? '—'} le ${dateCourte(e.mensuel?.jour)}` : 'à faire ce mois-ci'} />
            </div>
            <span className="veh-go">{e.vendrediFait && e.niveauxFaits ? 'Voir / refaire' : 'Faire le contrôle'} ›</span>
          </button>
        )
      })}
    </div>
  )
}

function Etat({ fait, urgent, titre, detail }: { fait: boolean; urgent: boolean; titre: string; detail: string }) {
  return (
    <div className={`veh-etat ${fait ? 'fait' : urgent ? 'du' : 'attente'}`}>
      <span className="veh-pastille">{fait ? <IcoCheck /> : '!'}</span>
      <span><strong>{titre}</strong><small>{detail}</small></span>
    </div>
  )
}

function Formulaire({ v, ctrls, membreId, onRetour, onFini }: { v: Vehicule; ctrls: ControleV[]; membreId: string; onRetour: () => void; onFini: (m: string) => void }) {
  const e = etatVehicule(v.id, ctrls)
  const [faireVendredi, setFaireVendredi] = useState(!e.vendrediFait)
  const [faireNiveaux, setFaireNiveaux] = useState(!e.niveauxFaits)
  const [km, setKm] = useState('')
  const [points, setPoints] = useState<Record<string, boolean>>({})
  const [niveaux, setNiveaux] = useState<Record<string, EtatNiveau>>({})
  const [probleme, setProbleme] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const cochés = POINTS_VENDREDI.filter((p) => points[p]).length
  const niveauxRemplis = NIVEAUX.filter((n) => niveaux[n]).length

  async function valider(ev: React.FormEvent) {
    ev.preventDefault()
    setErreur('')
    if (!faireVendredi && !faireNiveaux) return setErreur('Choisissez au moins le contrôle du vendredi ou les niveaux.')
    if (km && v.km && Number(km) < v.km) return setErreur(`Le kilométrage est inférieur au dernier relevé (${v.km.toLocaleString('fr-FR')} km).`)
    if (faireNiveaux && niveauxRemplis < NIVEAUX.length) return setErreur('Indiquez l\'état de chaque niveau.')
    const nonFaits = faireVendredi ? POINTS_VENDREDI.filter((p) => !points[p]) : []
    if (nonFaits.length && !confirm(`${nonFaits.length} point${nonFaits.length > 1 ? 's' : ''} non coché${nonFaits.length > 1 ? 's' : ''} : ${nonFaits.length > 1 ? 'ils seront signalés' : 'il sera signalé'} à Aurélien et Adeline. Continuer ?`)) return

    const manques = NIVEAUX.filter((n) => niveaux[n] === 'manque')
    const lignes: Record<string, unknown>[] = []
    const kmN = km ? Number(km) : null
    if (faireVendredi) {
      const texte = [probleme.trim(), nonFaits.length ? `Non fait : ${nonFaits.join(', ')}` : ''].filter(Boolean).join(' · ')
      lignes.push({ vehicule_id: v.id, membre_id: membreId, type: 'hebdo', km: kmN, points, anomalie: texte || null })
    }
    if (faireNiveaux) {
      const texte = [!faireVendredi ? probleme.trim() : '', manques.length ? `À compléter : ${manques.join(', ')}` : ''].filter(Boolean).join(' · ')
      lignes.push({ vehicule_id: v.id, membre_id: membreId, type: 'mensuel', km: faireVendredi ? null : kmN, points: niveaux, anomalie: texte || null })
    }
    setEnvoi(true)
    const { error } = await supabase.from('controles_vehicules').insert(lignes)
    setEnvoi(false)
    if (error) return setErreur(erreurLisible(error))
    const signal = lignes.some((l) => l.anomalie)
    onFini(`${v.nom} : contrôle enregistré.${signal ? ' Aurélien et Adeline sont prévenus de ce qui est à reprendre.' : ' Merci !'}`)
  }

  return (
    <div className="page">
      <button className="retour" onClick={onRetour}><IcoRetour /> Camions</button>
      <h1>{v.nom}</h1>
      {v.immatriculation && <p className="sous">{v.immatriculation}</p>}
      <form className="pile" onSubmit={valider}>
        <section className="carte">
          <label>Kilométrage au compteur<input inputMode="numeric" value={km} onChange={(x) => setKm(x.target.value.replace(/\D/g, ''))} placeholder={v.km ? `dernier relevé : ${v.km.toLocaleString('fr-FR')}` : 'ex. 48 200'} /></label>
        </section>

        <section className="carte">
          <div className="titre-ligne">
            <h2>Vendredi : nettoyage et contrôle</h2>
            {faireVendredi && <span className="veh-compteur">{cochés}/{POINTS_VENDREDI.length}</span>}
          </div>
          {!faireVendredi ? (
            <div className="veh-deja">
              <span>Déjà fait cette semaine par {e.hebdo?.membres?.prenom ?? '—'} le {dateCourte(e.hebdo?.jour)}.</span>
              <button type="button" className="lien" onClick={() => setFaireVendredi(true)}>Refaire</button>
            </div>
          ) : (
            <>
              <ul className="taches veh-taches">
                {POINTS_VENDREDI.map((p) => (
                  <li key={p}><label className={points[p] ? 'fait' : ''}><input type="checkbox" checked={!!points[p]} onChange={() => setPoints({ ...points, [p]: !points[p] })} /><span>{p}</span></label></li>
                ))}
              </ul>
              {cochés < POINTS_VENDREDI.length && <button type="button" className="lien" onClick={() => setPoints(Object.fromEntries(POINTS_VENDREDI.map((p) => [p, true])))}>Tout est fait</button>}
              {e.vendrediFait && <button type="button" className="lien" onClick={() => setFaireVendredi(false)}>Ne pas refaire</button>}
            </>
          )}
        </section>

        <section className={`carte ${faireNiveaux && e.niveauxDus && !e.niveauxFaits ? 'accent' : ''}`}>
          <div className="titre-ligne">
            <h2>Niveaux de {moisLabel()}</h2>
            {faireNiveaux && <span className="veh-compteur">{niveauxRemplis}/{NIVEAUX.length}</span>}
          </div>
          {!faireNiveaux ? (
            <div className="veh-deja">
              <span>{e.niveauxFaits ? `Faits ce mois-ci par ${e.mensuel?.membres?.prenom ?? '—'} le ${dateCourte(e.mensuel?.jour)}.` : 'Pas encore faits ce mois-ci.'}</span>
              <button type="button" className="lien" onClick={() => setFaireNiveaux(true)}>{e.niveauxFaits ? 'Refaire' : 'Faire maintenant'}</button>
            </div>
          ) : (
            <>
              <p className="aide">Moteur froid, camion à plat. Pour chaque niveau, choisissez ce que vous avez constaté.</p>
              {NIVEAUX.map((n) => (
                <div key={n} className="veh-niveau">
                  <strong>{n}</strong>
                  <div className="choix veh-segments">
                    {ETATS_NIVEAU.map((s) => (
                      <button type="button" key={s.v} className={`niv-${s.v}`} aria-pressed={niveaux[n] === s.v} onClick={() => setNiveaux({ ...niveaux, [n]: s.v })}>{s.label}</button>
                    ))}
                  </div>
                </div>
              ))}
              {!e.niveauxDus && !e.niveauxFaits && <button type="button" className="lien" onClick={() => { setFaireNiveaux(false); setNiveaux({}) }}>Plus tard ce mois-ci</button>}
              {e.niveauxFaits && <button type="button" className="lien" onClick={() => { setFaireNiveaux(false); setNiveaux({}) }}>Ne pas refaire</button>}
            </>
          )}
        </section>

        <section className="carte">
          <label>Autre chose à signaler (facultatif)<textarea rows={2} value={probleme} onChange={(x) => setProbleme(x.target.value)} placeholder="Ex. : bruit au freinage, rétroviseur cassé" /></label>
        </section>

        {erreur && <p className="erreur">{erreur}</p>}
        <button className="btn go large" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Valider le contrôle'}</button>
      </form>
    </div>
  )
}
