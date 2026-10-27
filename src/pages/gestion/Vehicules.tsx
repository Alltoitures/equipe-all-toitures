import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, erreurLisible } from '../../lib/supabase'
import { dateCourte, isoJour } from '../../lib/format'
import { IcoRetour } from '../../components/Icones'
import { POINTS_ENTRETIEN, etatVehicule, ilYaJours, type ControleV } from '../../lib/vehicules'

export interface Vehicule { id: string; nom: string; immatriculation: string | null; km: number | null; prochain_entretien_km: number | null; prochaine_revision: string | null; controle_technique: string | null; notes: string | null; actif: boolean }

const VIDE = { nom: '', immatriculation: '', km: '', prochain_entretien_km: '', prochaine_revision: '', controle_technique: '', notes: '' }
type Edition = typeof VIDE & { id?: string }

export default function Vehicules() {
  const [liste, setListe] = useState<Vehicule[]>([])
  const [ctrls, setCtrls] = useState<ControleV[]>([])
  const [edit, setEdit] = useState<Edition | null>(null)
  const [erreur, setErreur] = useState('')

  const charger = () => Promise.all([
    supabase.from('vehicules').select('*').eq('actif', true).order('nom'),
    supabase.from('controles_vehicules').select('id, type, jour, km, points, anomalie, anomalie_traitee, vehicule_id, membres(prenom)').gte('jour', ilYaJours(365)).order('jour', { ascending: false }).order('created_at', { ascending: false }).limit(1000)
  ]).then(([v, c]) => {
    setListe((v.data ?? []) as Vehicule[])
    setCtrls((c.data ?? []) as unknown as ControleV[])
  })
  useEffect(() => { charger() }, [])

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault()
    if (!edit) return
    const n = (s: string) => (s === '' ? null : Number(s.replace(/\D/g, '')))
    const d = { nom: edit.nom, immatriculation: edit.immatriculation.toUpperCase() || null, km: n(edit.km), prochain_entretien_km: n(edit.prochain_entretien_km), prochaine_revision: edit.prochaine_revision || null, controle_technique: edit.controle_technique || null, notes: edit.notes || null }
    const r = edit.id ? await supabase.from('vehicules').update(d).eq('id', edit.id) : await supabase.from('vehicules').insert(d)
    if (r.error) return setErreur(erreurLisible(r.error))
    setEdit(null)
    charger()
  }

  return (
    <div className="page">
      <Link className="retour" to="/gestion"><IcoRetour /> Gestion</Link>
      <VehiculesVue
        liste={liste}
        ctrls={ctrls}
        onAjouter={() => { setErreur(''); setEdit({ ...VIDE }) }}
        onModifier={(v) => { setErreur(''); setEdit(versEdition(v)) }}
        onTraite={async (id) => { await supabase.from('controles_vehicules').update({ anomalie_traitee: true }).eq('id', id); charger() }}
      />

      {edit && (
        <div className="fond-modal" onClick={() => setEdit(null)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={enregistrer}>
            <h2>{edit.id ? edit.nom : 'Nouveau camion'}</h2>
            <div className="deux">
              <label>Nom<input value={edit.nom} onChange={(e) => setEdit({ ...edit, nom: e.target.value })} required placeholder="Peugeot Expert" /></label>
              <label>Immatriculation<input value={edit.immatriculation} onChange={(e) => setEdit({ ...edit, immatriculation: e.target.value })} placeholder="AB-123-CD" /></label>
            </div>
            <div className="deux">
              <label>Kilométrage actuel<input inputMode="numeric" value={edit.km} onChange={(e) => setEdit({ ...edit, km: e.target.value })} placeholder="ex. 48200" /></label>
              <label>Prochain entretien à (km)<input inputMode="numeric" value={edit.prochain_entretien_km} onChange={(e) => setEdit({ ...edit, prochain_entretien_km: e.target.value })} placeholder="ex. 60000" /></label>
            </div>
            <div className="deux">
              <label>Contrôle technique avant le<input type="date" value={edit.controle_technique} onChange={(e) => setEdit({ ...edit, controle_technique: e.target.value })} /></label>
              <label>Prochaine révision le<input type="date" value={edit.prochaine_revision} onChange={(e) => setEdit({ ...edit, prochaine_revision: e.target.value })} /></label>
            </div>
            <label>Notes<textarea rows={2} value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} placeholder="Leasing, garage habituel, particularités…" /></label>
            {erreur && <p className="erreur">{erreur}</p>}
            <div className="boutons">
              <button type="button" className="btn" onClick={() => setEdit(null)}>Annuler</button>
              {edit.id && <button type="button" className="btn danger" onClick={async () => { if (!confirm(`Retirer ${edit.nom} de la liste ?`)) return; await supabase.from('vehicules').update({ actif: false }).eq('id', edit.id!); setEdit(null); charger() }}>Retirer</button>}
              <button className="btn pri">Enregistrer</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

const versEdition = (v: Vehicule): Edition => ({ id: v.id, nom: v.nom, immatriculation: v.immatriculation ?? '', km: v.km?.toString() ?? '', prochain_entretien_km: v.prochain_entretien_km?.toString() ?? '', prochaine_revision: v.prochaine_revision ?? '', controle_technique: v.controle_technique ?? '', notes: v.notes ?? '' })

const joursAvant = (d: string) => Math.round((new Date(d + 'T12:00').getTime() - new Date(isoJour() + 'T12:00').getTime()) / 864e5)

/** Échéance d'une date : couleur + texte « dans 45 j ». */
function echeance(d: string | null): { cls: string; txt: string } {
  if (!d) return { cls: 'e-vide', txt: 'à renseigner' }
  const j = joursAvant(d)
  if (j < 0) return { cls: 'e-retard', txt: `dépassé de ${-j} j` }
  if (j <= 30) return { cls: 'e-proche', txt: `dans ${j} j` }
  return { cls: 'e-ok', txt: j > 60 ? `dans ${Math.round(j / 30)} mois` : `dans ${j} j` }
}

/** Partie affichage, séparée pour pouvoir la prévisualiser. */
export function VehiculesVue({ liste, ctrls, onAjouter, onModifier, onTraite }: { liste: Vehicule[]; ctrls: ControleV[]; onAjouter: () => void; onModifier: (v: Vehicule) => void; onTraite: (id: string) => void }) {
  const [ouvert, setOuvert] = useState<string | null>(null)
  const etats = liste.map((v) => ({ v, e: etatVehicule(v.id, ctrls) }))
  const nettoyes = etats.filter((x) => x.e.vendrediFait).length
  const niveauxOk = etats.filter((x) => x.e.entretienAJour).length
  const anomalies = ctrls.filter((c) => c.anomalie && !c.anomalie_traitee && liste.some((v) => v.id === c.vehicule_id))
  const vendredi = new Date().getDay() === 5

  return (
    <>
      <div className="titre-ligne"><h1>Camions</h1><button className="btn pri" onClick={onAjouter}>+ Camion</button></div>

      {liste.length > 0 && (
        <div className="vg-resume">
          <div className={nettoyes === liste.length ? 'e-ok' : vendredi ? 'e-du' : ''}><b>{nettoyes}/{liste.length}</b><span>nettoyés cette semaine</span></div>
          <div className={niveauxOk === liste.length ? 'e-ok' : 'e-du'}><b>{niveauxOk}/{liste.length}</b><span>niveaux et usure à jour</span></div>
          <div className={anomalies.length ? 'e-alerte' : 'e-ok'}><b>{anomalies.length}</b><span>{anomalies.length > 1 ? 'problèmes signalés' : 'problème signalé'}</span></div>
        </div>
      )}

      {anomalies.length > 0 && (
        <section className="carte carte-urgente">
          <h2>À traiter</h2>
          {anomalies.map((a) => (
            <div key={a.id} className="vg-anomalie">
              <div>
                <strong>{liste.find((v) => v.id === a.vehicule_id)?.nom}</strong>
                <span className="sous">{a.membres?.prenom ?? '—'} · {dateCourte(a.jour)} · {a.type === 'mensuel' ? 'niveaux / usure' : 'nettoyage'}</span>
                <p>{a.anomalie}</p>
              </div>
              <button className="btn" onClick={() => onTraite(a.id)}>Traité</button>
            </div>
          ))}
        </section>
      )}

      {liste.length === 0 && <div className="vide">Ajoutez vos camions : l'équipe fera le nettoyage du vendredi et vérifiera les niveaux et l'usure depuis son téléphone.</div>}

      {etats.map(({ v, e }) => {
        const ct = echeance(v.controle_technique)
        const rev = echeance(v.prochaine_revision)
        const resteKm = v.km != null && v.prochain_entretien_km != null ? v.prochain_entretien_km - v.km : null
        const histo = ctrls.filter((c) => c.vehicule_id === v.id).slice(0, 8)
        return (
          <section key={v.id} className="carte vg-camion">
            <div className="vg-tete">
              <div>
                <h2>{v.nom}</h2>
                {v.immatriculation ? <span className="plaque">{v.immatriculation}</span> : <button className="lien" onClick={() => onModifier(v)}>+ immatriculation</button>}
              </div>
              <button className="btn" onClick={() => onModifier(v)}>Modifier</button>
            </div>

            <button className="vg-km" onClick={() => onModifier(v)}>
              {v.km != null ? <><b>{v.km.toLocaleString('fr-FR')} km</b>{resteKm != null && <span className={resteKm <= 1000 ? 'e-proche' : ''}>entretien dans {resteKm.toLocaleString('fr-FR')} km</span>}</> : <span className="km-vide">Kilométrage à renseigner</span>}
            </button>

            <div className="vg-grille">
              <div className={`vg-tuile ${e.vendrediFait ? 'e-ok' : vendredi ? 'e-du' : ''}`}>
                <span>Nettoyage</span>
                <b>{e.vendrediFait ? '✓ Fait' : 'À faire'}</b>
                <small>{e.vendrediFait ? `${e.hebdo?.membres?.prenom ?? '—'} · ${dateCourte(e.hebdo?.jour)}` : e.hebdo ? `dernier : ${dateCourte(e.hebdo.jour)}` : 'jamais fait'}</small>
              </div>
              <div className={`vg-tuile ${e.aReprendre.length ? 'e-retard' : e.entretienAJour ? 'e-ok' : 'e-du'}`}>
                <span>Niveaux et usure</span>
                <b>{e.aReprendre.length ? 'À reprendre' : e.entretienAJour ? '✓ À jour' : 'À vérifier'}</b>
                <small>{e.aReprendre.length ? e.aReprendre.join(', ') : e.entretienAJour ? (e.aSurveiller.length ? `à surveiller : ${e.aSurveiller.join(', ')}` : 'moins de 30 jours') : `${e.aVerifier.length} point${e.aVerifier.length > 1 ? 's' : ''} à vérifier`}</small>
              </div>
              <button className={`vg-tuile ${ct.cls}`} onClick={() => onModifier(v)}>
                <span>Contrôle technique</span>
                <b>{v.controle_technique ? dateCourte(v.controle_technique) : '—'}</b>
                <small>{ct.txt}</small>
              </button>
              <button className={`vg-tuile ${rev.cls}`} onClick={() => onModifier(v)}>
                <span>Révision</span>
                <b>{v.prochaine_revision ? dateCourte(v.prochaine_revision) : '—'}</b>
                <small>{rev.txt}</small>
              </button>
            </div>

            <span className="vg-sous-titre">Dernières vérifications</span>
            <div className="vg-niveaux vg-entretien">
              {POINTS_ENTRETIEN.map((p) => {
                const r = e.releves[p.nom]
                const cls = !r ? 'inconnu' : r.etat.gravite === 'mauvais' ? 'manque' : r.etat.gravite === 'moyen' ? 'moyen' : r.aJour ? 'ok' : 'vieux'
                return (
                  <div key={p.nom} className={`vg-niv n-${cls}`} title={r ? `${r.prenom} · ${dateCourte(r.jour)}` : 'jamais vérifié'}>
                    <i />
                    <span>{p.nom}</span>
                    <small>{r ? `${r.etat.label} · ${dateCourte(r.jour)}` : 'jamais'}</small>
                  </div>
                )
              })}
            </div>

            {v.notes && <p className="sous">{v.notes}</p>}

            {histo.length > 0 && (
              <>
                <button className="lien" onClick={() => setOuvert(ouvert === v.id ? null : v.id)}>{ouvert === v.id ? 'Masquer l\'historique' : `Historique (${histo.length})`}</button>
                {ouvert === v.id && (
                  <ul className="vg-histo">
                    {histo.map((c) => (
                      <li key={c.id}>
                        <span>{dateCourte(c.jour)}</span>
                        <span>{c.type === 'mensuel' ? 'Niveaux / usure' : c.points?.Nettoyage === 'pas_fait' ? 'Nettoyage non fait' : 'Nettoyage'} · {c.membres?.prenom ?? '—'}{c.km ? ` · ${c.km.toLocaleString('fr-FR')} km` : ''}</span>
                        <span className={c.anomalie ? 'urgent' : 'ok-txt'}>{c.anomalie ? '⚠' : '✓'}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>
        )
      })}
    </>
  )
}
