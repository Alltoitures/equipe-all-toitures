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

type Niveau = 'ok' | 'attention' | 'alerte'
interface Statut { niveau: Niveau; titre: string; detail: string; actions: { txt: string; niveau: Niveau }[] }

/** Un seul feu par camion : ce qu'il faut retenir, et la liste de ce qu'il y a à faire. */
function statutCamion(v: Vehicule, e: ReturnType<typeof etatVehicule>, anomalies: ControleV[]): Statut {
  const actions: Statut['actions'] = []
  for (const a of anomalies) actions.push({ txt: `Signalé par ${a.membres?.prenom ?? '—'} : ${a.anomalie}`, niveau: 'alerte' })
  if (e.aReprendre.length) actions.push({ txt: `À reprendre : ${e.aReprendre.join(', ')}`, niveau: 'alerte' })
  const ct = v.controle_technique ? joursAvant(v.controle_technique) : null
  const rev = v.prochaine_revision ? joursAvant(v.prochaine_revision) : null
  const resteKm = v.km != null && v.prochain_entretien_km != null ? v.prochain_entretien_km - v.km : null
  if (ct != null && ct < 0) actions.push({ txt: `Contrôle technique dépassé (${dateCourte(v.controle_technique)})`, niveau: 'alerte' })
  else if (ct != null && ct <= 30) actions.push({ txt: `Contrôle technique dans ${ct} j : prendre rendez-vous`, niveau: 'attention' })
  if (rev != null && rev < 0) actions.push({ txt: `Révision dépassée (${dateCourte(v.prochaine_revision)})`, niveau: 'alerte' })
  else if (rev != null && rev <= 30) actions.push({ txt: `Révision dans ${rev} j`, niveau: 'attention' })
  if (resteKm != null && resteKm <= 0) actions.push({ txt: `Entretien dépassé de ${(-resteKm).toLocaleString('fr-FR')} km`, niveau: 'alerte' })
  else if (resteKm != null && resteKm <= 1500) actions.push({ txt: `Entretien dans ${resteKm.toLocaleString('fr-FR')} km`, niveau: 'attention' })
  if (e.aSurveiller.length) actions.push({ txt: `À surveiller : ${e.aSurveiller.join(', ')}`, niveau: 'attention' })
  if (!e.entretienAJour && !e.aReprendre.length) actions.push({ txt: `Niveaux et usure à vérifier (${e.aVerifier.length} point${e.aVerifier.length > 1 ? 's' : ''})`, niveau: 'attention' })
  if (!e.vendrediFait && new Date().getDay() >= 5) actions.push({ txt: 'Nettoyage du vendredi pas fait', niveau: 'attention' })
  if (!v.controle_technique || !v.prochaine_revision || v.km == null) actions.push({ txt: 'Infos à compléter (km, CT, révision)', niveau: 'attention' })
  const niveau: Niveau = actions.some((x) => x.niveau === 'alerte') ? 'alerte' : actions.length ? 'attention' : 'ok'
  return {
    niveau,
    titre: niveau === 'ok' ? 'Tout est en ordre' : niveau === 'alerte' ? (actions.filter((x) => x.niveau === 'alerte').length > 1 ? `${actions.filter((x) => x.niveau === 'alerte').length} problèmes` : 'Problème à régler') : `${actions.length} point${actions.length > 1 ? 's' : ''} à prévoir`,
    detail: actions[0]?.txt ?? `Nettoyé ${e.hebdo ? `le ${dateCourte(e.hebdo.jour)}` : '—'} · niveaux à jour`,
    actions
  }
}

/** Partie affichage, séparée pour pouvoir la prévisualiser. */
export function VehiculesVue({ liste, ctrls, onAjouter, onModifier, onTraite }: { liste: Vehicule[]; ctrls: ControleV[]; onAjouter: () => void; onModifier: (v: Vehicule) => void; onTraite: (id: string) => void }) {
  const [choisi, setChoisi] = useState<string | null>(null)
  const anomaliesDe = (id: string) => ctrls.filter((c) => c.vehicule_id === id && c.anomalie && !c.anomalie_traitee)
  const etats = liste.map((v) => { const e = etatVehicule(v.id, ctrls); return { v, e, st: statutCamion(v, e, anomaliesDe(v.id)) } })
  const ordre: Record<Niveau, number> = { alerte: 0, attention: 1, ok: 2 }
  etats.sort((a, b) => ordre[a.st.niveau] - ordre[b.st.niveau] || a.v.nom.localeCompare(b.v.nom))
  const nettoyes = etats.filter((x) => x.e.vendrediFait).length
  const cur = etats.find((x) => x.v.id === choisi)

  if (cur) {
    const { v, e, st } = cur
    const histo = ctrls.filter((c) => c.vehicule_id === v.id).slice(0, 12)
    const resteKm = v.km != null && v.prochain_entretien_km != null ? v.prochain_entretien_km - v.km : null
    const ct = echeance(v.controle_technique)
    const rev = echeance(v.prochaine_revision)
    return (
      <>
        <button className="retour" onClick={() => setChoisi(null)}><IcoRetour /> Tous les camions</button>
        <header className={`vg-hero n-${st.niveau}`}>
          <div>
            <h1>{v.nom}</h1>
            {v.immatriculation && <span className="plaque">{v.immatriculation}</span>}
          </div>
          <span className="vg-feu"><i />{st.titre}</span>
        </header>

        {st.actions.length > 0 && (
          <section className="carte">
            <h2>À faire</h2>
            <ul className="vg-actions">
              {st.actions.map((a, i) => <li key={i} className={`n-${a.niveau}`}><i />{a.txt}</li>)}
            </ul>
            {anomaliesDe(v.id).map((a) => (
              <button key={a.id} className="btn" onClick={() => onTraite(a.id)}>✓ Problème « {a.anomalie?.slice(0, 30)}{(a.anomalie?.length ?? 0) > 30 ? '…' : ''} » réglé</button>
            ))}
          </section>
        )}

        <section className="carte">
          <div className="titre-ligne"><h2>Échéances</h2><button className="lien" onClick={() => onModifier(v)}>Modifier</button></div>
          <div className="vg-echeances">
            <div className={ct.cls}><span>Contrôle technique</span><b>{v.controle_technique ? dateCourte(v.controle_technique) : '—'}</b><small>{ct.txt}</small></div>
            <div className={rev.cls}><span>Révision</span><b>{v.prochaine_revision ? dateCourte(v.prochaine_revision) : '—'}</b><small>{rev.txt}</small></div>
            <div className={resteKm == null ? 'e-vide' : resteKm <= 0 ? 'e-retard' : resteKm <= 1500 ? 'e-proche' : 'e-ok'}><span>Entretien</span><b>{v.prochain_entretien_km ? `${v.prochain_entretien_km.toLocaleString('fr-FR')} km` : '—'}</b><small>{resteKm == null ? 'à renseigner' : resteKm <= 0 ? 'dépassé' : `encore ${resteKm.toLocaleString('fr-FR')} km`}</small></div>
            <div><span>Compteur</span><b>{v.km != null ? `${v.km.toLocaleString('fr-FR')} km` : '—'}</b><small>dernier relevé</small></div>
          </div>
        </section>

        <section className="carte">
          <h2>Contrôles de l'équipe</h2>
          <div className={`vg-ligne-net ${e.vendrediFait ? 'n-ok' : 'n-attention'}`}><i /><span><strong>Nettoyage de la semaine</strong><small>{e.vendrediFait ? `fait par ${e.hebdo?.membres?.prenom ?? '—'} le ${dateCourte(e.hebdo?.jour)}` : e.hebdo ? `pas encore · dernier le ${dateCourte(e.hebdo.jour)}` : 'jamais fait'}</small></span></div>
          <div className="vg-points">
            {POINTS_ENTRETIEN.map((p) => {
              const r = e.releves[p.nom]
              const n: Niveau = !r || !r.aJour ? 'attention' : r.etat.gravite === 'mauvais' ? 'alerte' : r.etat.gravite === 'moyen' ? 'attention' : 'ok'
              return (
                <div key={p.nom} className={`n-${n}`}>
                  <i />
                  <span><strong>{p.nom}</strong><small>{r ? `${r.etat.label} · ${dateCourte(r.jour)} · ${r.prenom}` : 'jamais vérifié'}</small></span>
                </div>
              )
            })}
          </div>
          <p className="aide">Niveaux et usure : à revérifier tous les {30} jours par l'équipe depuis son téléphone.</p>
        </section>

        {histo.length > 0 && (
          <section className="carte">
            <h2>Historique</h2>
            <ul className="vg-histo">
              {histo.map((c) => (
                <li key={c.id}>
                  <span>{dateCourte(c.jour)}</span>
                  <span>{c.type === 'mensuel' ? 'Niveaux / usure' : c.points?.Nettoyage === 'pas_fait' ? 'Nettoyage non fait' : 'Nettoyage'} · {c.membres?.prenom ?? '—'}{c.km ? ` · ${c.km.toLocaleString('fr-FR')} km` : ''}{c.anomalie ? ` · ${c.anomalie}` : ''}</span>
                  <span className={c.anomalie ? 'urgent' : 'ok-txt'}>{c.anomalie ? '⚠' : '✓'}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {v.notes && <section className="carte"><h2>Notes</h2><p className="pre">{v.notes}</p></section>}
      </>
    )
  }

  return (
    <>
      <div className="titre-ligne"><h1>Camions</h1><button className="btn pri" onClick={onAjouter}>+ Camion</button></div>
      {liste.length > 0 && (
        <p className="sous">{etats.filter((x) => x.st.niveau === 'ok').length} sur {liste.length} en ordre · {nettoyes}/{liste.length} nettoyés cette semaine</p>
      )}
      {liste.length === 0 && <div className="vide">Ajoutez vos camions : l'équipe fera le nettoyage du vendredi et vérifiera les niveaux et l'usure depuis son téléphone.</div>}
      <div className="liste">
        {etats.map(({ v, st }) => (
          <button key={v.id} className={`vg-ligne n-${st.niveau}`} onClick={() => { setChoisi(v.id); window.scrollTo({ top: 0 }) }}>
            <span className="feu"><i /></span>
            <span className="txt">
              <strong>{v.nom}{v.immatriculation && <em className="plaque">{v.immatriculation}</em>}</strong>
              <b>{st.titre}</b>
              <small>{st.detail}</small>
            </span>
            <span className="chev">›</span>
          </button>
        ))}
      </div>
    </>
  )
}
