import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, erreurLisible } from '../../lib/supabase'
import { dateCourte, isoJour } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'
import { NIVEAUX, etatVehicule, moisLabel, type ControleV } from '../../lib/vehicules'

export interface Vehicule { id: string; nom: string; immatriculation: string | null; km: number | null; prochain_entretien_km: number | null; prochaine_revision: string | null; controle_technique: string | null; notes: string | null; actif: boolean }
type Ctrl = ControleV

const VIDE = { nom: '', immatriculation: '', km: '', prochain_entretien_km: '', prochaine_revision: '', controle_technique: '', notes: '' }

export default function Vehicules() {
  const [liste, setListe] = useState<Vehicule[]>([])
  const [ctrls, setCtrls] = useState<Ctrl[]>([])
  const [edit, setEdit] = useState<(typeof VIDE & { id?: string }) | null>(null)
  const [erreur, setErreur] = useState('')

  const charger = () => Promise.all([
    supabase.from('vehicules').select('*').eq('actif', true).order('nom'),
    supabase.from('controles_vehicules').select('id, type, jour, km, points, anomalie, anomalie_traitee, vehicule_id, membres(prenom)').order('jour', { ascending: false }).order('created_at', { ascending: false }).limit(120)
  ]).then(([v, c]) => {
    setListe((v.data ?? []) as Vehicule[])
    setCtrls((c.data ?? []) as unknown as Ctrl[])
  })
  useEffect(() => { charger() }, [])

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    const n = (s: string) => (s === '' ? null : Number(s))
    const d = { nom: edit.nom, immatriculation: edit.immatriculation || null, km: n(edit.km), prochain_entretien_km: n(edit.prochain_entretien_km), prochaine_revision: edit.prochaine_revision || null, controle_technique: edit.controle_technique || null, notes: edit.notes || null }
    const r = edit.id ? await supabase.from('vehicules').update(d).eq('id', edit.id) : await supabase.from('vehicules').insert(d)
    if (r.error) return setErreur(erreurLisible(r.error))
    setEdit(null)
    charger()
  }

  const anomalies = ctrls.filter((c) => c.anomalie && !c.anomalie_traitee)
  const proche = (d: string | null) => d && d <= isoJour(new Date(Date.now() + 30 * 864e5))

  return (
    <div className="page">
      <Link className="retour" to="/gestion"><IcoRetour /> Gestion</Link>
      <div className="titre-ligne"><h1>Véhicules</h1><button className="btn pri" onClick={() => setEdit({ ...VIDE })}>+ Véhicule</button></div>

      {anomalies.length > 0 && (
        <section className="carte carte-urgente">
          <h2>Anomalies signalées ({anomalies.length})</h2>
          {anomalies.map((a) => (
            <div key={a.id} className="imprevu">
              <div><strong>{liste.find((v) => v.id === a.vehicule_id)?.nom}</strong><span className="sous"> · {a.membres?.prenom} · {dateCourte(a.jour)}</span><p className="pre">{a.anomalie}</p></div>
              <button className="btn" onClick={async () => { await supabase.from('controles_vehicules').update({ anomalie_traitee: true }).eq('id', a.id); charger() }}>Traité</button>
            </div>
          ))}
        </section>
      )}

      {liste.length === 0 && <div className="vide">Ajoutez vos camions : l'équipe fera le contrôle du vendredi et les niveaux du mois depuis son téléphone.</div>}
      {liste.map((v) => {
        const e = etatVehicule(v.id, ctrls)
        const niv = e.mensuel?.points as Record<string, string> | undefined
        return (
          <section key={v.id} className="carte">
            <div className="titre-ligne"><strong>{v.nom}{v.immatriculation ? ` · ${v.immatriculation}` : ''}</strong><button className="lien" onClick={() => setEdit({ id: v.id, nom: v.nom, immatriculation: v.immatriculation ?? '', km: v.km?.toString() ?? '', prochain_entretien_km: v.prochain_entretien_km?.toString() ?? '', prochaine_revision: v.prochaine_revision ?? '', controle_technique: v.controle_technique ?? '', notes: v.notes ?? '' })}>Modifier</button></div>
            <p>{v.km != null ? `${v.km.toLocaleString('fr-FR')} km` : 'km non renseigné'}{v.prochain_entretien_km ? ` · entretien à ${v.prochain_entretien_km.toLocaleString('fr-FR')} km` : ''}</p>
            <p className="sous">
              <span className={proche(v.controle_technique) ? 'urgent' : ''}>CT : {v.controle_technique ? dateCourte(v.controle_technique) : '—'}</span>
              {' · '}
              <span className={proche(v.prochaine_revision) ? 'urgent' : ''}>Révision : {v.prochaine_revision ? dateCourte(v.prochaine_revision) : '—'}</span>
            </p>
            <div className="veh-etats">
              <div className={`veh-etat ${e.vendrediFait ? 'fait' : new Date().getDay() === 5 ? 'du' : 'attente'}`}>
                <span className="veh-pastille">{e.vendrediFait ? '✓' : '!'}</span>
                <span><strong>Vendredi</strong><small>{e.vendrediFait ? `fait par ${e.hebdo?.membres?.prenom ?? '—'} le ${dateCourte(e.hebdo?.jour)}` : `à faire cette semaine${e.hebdo ? ` · dernier le ${dateCourte(e.hebdo.jour)}` : ''}`}</small></span>
              </div>
              <div className={`veh-etat ${e.niveauxFaits ? 'fait' : e.niveauxDus ? 'du' : 'attente'}`}>
                <span className="veh-pastille">{e.niveauxFaits ? '✓' : '!'}</span>
                <span><strong>Niveaux de {moisLabel()}</strong><small>{e.niveauxFaits ? `faits par ${e.mensuel?.membres?.prenom ?? '—'} le ${dateCourte(e.mensuel?.jour)}` : `à faire${e.mensuel ? ` · derniers le ${dateCourte(e.mensuel.jour)}` : ''}`}</small></span>
              </div>
            </div>
            {niv && (
              <div>
                {NIVEAUX.map((n) => niv[n] && <span key={n} className={`niv-chip ${niv[n]}`}>{n} : {niv[n] === 'ok' ? 'OK' : niv[n] === 'appoint' ? 'appoint fait' : 'à compléter'}</span>)}
              </div>
            )}
            {v.notes && <p className="sous pre">{v.notes}</p>}
          </section>
        )
      })}

      {edit && (
        <div className="fond-modal" onClick={() => setEdit(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
            <h2>{edit.id ? 'Modifier le véhicule' : 'Nouveau véhicule'}</h2>
            <label>Nom<input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} required placeholder="Camion benne Master" /></label>
            <label>Immatriculation<input value={edit.immatriculation} onChange={(e) => setEdit({ ...edit, immatriculation: e.target.value })} /></label>
            <div className="deux">
              <label>Kilométrage<input inputMode="numeric" value={edit.km} onChange={(e) => setEdit({ ...edit, km: e.target.value })} /></label>
              <label>Entretien à (km)<input inputMode="numeric" value={edit.prochain_entretien_km} onChange={(e) => setEdit({ ...edit, prochain_entretien_km: e.target.value })} /></label>
            </div>
            <div className="deux">
              <label>Contrôle technique<input type="date" value={edit.controle_technique} onChange={(e) => setEdit({ ...edit, controle_technique: e.target.value })} /></label>
              <label>Révision<input type="date" value={edit.prochaine_revision} onChange={(e) => setEdit({ ...edit, prochaine_revision: e.target.value })} /></label>
            </div>
            <label>Notes<textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></label>
            {erreur && <p className="erreur">{erreur}</p>}
            <div className="boutons">
              <button type="button" className="btn" onClick={() => setEdit(null)}>Annuler</button>
              {edit.id && <button type="button" className="btn danger" onClick={async () => { await supabase.from('vehicules').update({ actif: false }).eq('id', edit.id!); setEdit(null); charger() }}>Retirer</button>}
              <button className="btn pri">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
