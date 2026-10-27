import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { dateCourte } from '../lib/format'
import { IcoRetour, IcoCheck } from '../components/Icones'
import type { Vehicule } from './gestion/Vehicules'
import { NIVEAUX, USURES, POINTS_ENTRETIEN, NETTOYAGE, etatVehicule, etatDe, ilYaJours, texteReleve, type ControleV, type PointEntretien, type Releve } from '../lib/vehicules'

export default function ControleVehicule() {
  const nav = useNavigate()
  const { membre } = useAuth()
  const [vehicules, setVehicules] = useState<Vehicule[]>([])
  const [ctrls, setCtrls] = useState<ControleV[]>([])
  const [vid, setVid] = useState<string | null>(null)
  const [msg, setMsg] = useState('')

  const charger = () => Promise.all([
    supabase.from('vehicules').select('*').eq('actif', true).order('nom'),
    supabase.from('controles_vehicules').select('id, vehicule_id, type, jour, km, points, anomalie, anomalie_traitee, membres(prenom)').gte('jour', ilYaJours(365)).order('jour', { ascending: false }).order('created_at', { ascending: false }).limit(1000)
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
      <p className="aide">Chaque vendredi : nettoyage du camion. Niveaux et usure : à vérifier au moins tous les 30 jours, on voit à chaque fois la dernière vérification.</p>
      {msg && <p className="ok">{msg}</p>}
      {vehicules.length === 0 && <div className="vide">Aucun camion enregistré pour l'instant.</div>}
      {vehicules.map((x) => {
        const e = etatVehicule(x.id, ctrls)
        return (
          <button key={x.id} className="carte veh-carte" onClick={() => { setMsg(''); setVid(x.id) }}>
            <div className="titre-ligne"><strong>{x.nom}</strong>{x.immatriculation && <span className="sous">{x.immatriculation}</span>}</div>
            <div className="veh-etats">
              <Etat fait={e.vendrediFait} urgent={vendredi} titre="Nettoyage" detail={e.vendrediFait ? `fait par ${e.hebdo?.membres?.prenom ?? '—'} le ${dateCourte(e.hebdo?.jour)}` : 'à faire cette semaine'} />
              <Etat fait={e.entretienAJour && !e.aReprendre.length} urgent={!e.entretienAJour || e.aReprendre.length > 0} titre="Niveaux et usure" detail={e.aReprendre.length ? `à reprendre : ${e.aReprendre.join(', ')}` : e.entretienAJour ? 'à jour' : `à vérifier : ${e.aVerifier.join(', ')}`} />
            </div>
            <span className="veh-go">{e.vendrediFait && e.entretienAJour ? 'Voir / refaire' : 'Faire le contrôle'} ›</span>
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
  const [nettoyage, setNettoyage] = useState<'fait' | 'pas_fait' | null>(null)
  const [km, setKm] = useState('')
  const [entretien, setEntretien] = useState<Record<string, string>>({})
  const [probleme, setProbleme] = useState('')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)

  const releves = Object.keys(entretien).length

  async function valider(ev: React.FormEvent) {
    ev.preventDefault()
    setErreur('')
    if (!nettoyage && !releves && !probleme.trim()) return setErreur('Indiquez le nettoyage ou vérifiez au moins un niveau.')
    if (km && v.km && Number(km) < v.km) return setErreur(`Le kilométrage est inférieur au dernier relevé (${v.km.toLocaleString('fr-FR')} km).`)

    const mauvais = POINTS_ENTRETIEN.flatMap((p) => {
      const s = etatDe(p, entretien[p.nom])
      return s?.gravite === 'mauvais' ? [`${p.nom} : ${s.label.toLowerCase()}`] : []
    })
    const lignes: Record<string, unknown>[] = []
    const kmN = km ? Number(km) : null
    if (nettoyage) {
      const texte = [probleme.trim(), nettoyage === 'pas_fait' ? 'Nettoyage non fait' : ''].filter(Boolean).join(' · ')
      lignes.push({ vehicule_id: v.id, membre_id: membreId, type: 'hebdo', km: kmN, points: { [NETTOYAGE]: nettoyage }, anomalie: texte || null })
    }
    if (releves || (!nettoyage && probleme.trim())) {
      const texte = [!nettoyage ? probleme.trim() : '', mauvais.join(' · ')].filter(Boolean).join(' · ')
      lignes.push({ vehicule_id: v.id, membre_id: membreId, type: 'mensuel', km: nettoyage ? null : kmN, points: entretien, anomalie: texte || null })
    }
    setEnvoi(true)
    const { error } = await supabase.from('controles_vehicules').insert(lignes)
    setEnvoi(false)
    if (error) return setErreur(erreurLisible(error))
    const signal = lignes.some((l) => l.anomalie)
    onFini(`${v.nom} : contrôle enregistré.${signal ? ' Aurélien et Adeline sont prévenus de ce qui est à reprendre.' : ' Merci !'}`)
  }

  const bloc = (titre: string, aide: string, liste: PointEntretien[], toutOk?: boolean) => (
    <section className={`carte ${liste.some((p) => !e.releves[p.nom]?.aJour) ? 'accent' : ''}`}>
      <h2>{titre}</h2>
      <p className="aide">{aide}</p>
      {liste.map((p) => (
        <div key={p.nom} className="veh-niveau">
          <strong>{p.nom}{p.aide && <small className="sous"> · {p.aide}</small>}</strong>
          <div className={`choix veh-segments n${p.etats.length}`}>
            {p.etats.map((s) => (
              <button type="button" key={s.v} className={`niv-${s.gravite}`} aria-pressed={entretien[p.nom] === s.v}
                onClick={() => {
                  const n = { ...entretien }
                  if (n[p.nom] === s.v) delete n[p.nom]
                  else n[p.nom] = s.v
                  setEntretien(n)
                }}>{s.label}</button>
            ))}
          </div>
          <Dernier r={e.releves[p.nom]} />
        </div>
      ))}
      {toutOk && <button type="button" className="lien" onClick={() => setEntretien({ ...entretien, ...Object.fromEntries(liste.map((p) => [p.nom, p.etats[0].v])) })}>Tous les niveaux sont OK</button>}
    </section>
  )

  return (
    <div className="page">
      <button className="retour" onClick={onRetour}><IcoRetour /> Camions</button>
      <h1>{v.nom}</h1>
      {v.immatriculation && <p className="sous">{v.immatriculation}</p>}
      <form className="pile" onSubmit={valider}>
        <section className="carte">
          <label>Kilométrage au compteur<input inputMode="numeric" value={km} onChange={(x) => setKm(x.target.value.replace(/\D/g, ''))} placeholder={v.km ? `dernier relevé : ${v.km.toLocaleString('fr-FR')}` : 'ex. 48 200'} /></label>
        </section>

        <section className={`carte ${!e.vendrediFait ? 'accent' : ''}`}>
          <h2>Nettoyage du camion</h2>
          <div className="veh-niveau">
            <div className="choix veh-segments n2">
              <button type="button" className="niv-bon" aria-pressed={nettoyage === 'fait'} onClick={() => setNettoyage(nettoyage === 'fait' ? null : 'fait')}>Fait</button>
              <button type="button" className="niv-mauvais" aria-pressed={nettoyage === 'pas_fait'} onClick={() => setNettoyage(nettoyage === 'pas_fait' ? null : 'pas_fait')}>Pas fait</button>
            </div>
            <small className={`veh-dernier d-${e.vendrediFait ? 'bon' : 'vieux'}`}>
              {e.vendrediFait ? '✓ ' : '! '}Dernier nettoyage : {e.hebdo ? `${dateCourte(e.hebdo.jour)} · ${e.hebdo.membres?.prenom ?? '—'}` : 'jamais'}{e.vendrediFait ? ' (cette semaine)' : ''}
            </small>
          </div>
        </section>

        {bloc('Niveaux', 'Moteur froid, camion à plat. Touchez seulement ce que vous avez vérifié : la date et votre prénom sont enregistrés.', NIVEAUX, true)}
        {bloc('Usure', 'Indiquez l\'état constaté. « À changer » prévient Aurélien et Adeline.', USURES)}

        <section className="carte">
          <label>Autre chose à signaler (facultatif)<textarea rows={2} value={probleme} onChange={(x) => setProbleme(x.target.value)} placeholder="Ex. : bruit au freinage, rétroviseur cassé" /></label>
        </section>

        {erreur && <p className="erreur">{erreur}</p>}
        <button className="btn go large" disabled={envoi}>{envoi ? 'Enregistrement…' : 'Valider le contrôle'}</button>
      </form>
    </div>
  )
}

function Dernier({ r }: { r: Releve | undefined }) {
  const cls = !r ? 'jamais' : !r.aJour ? 'vieux' : r.etat.gravite
  return <small className={`veh-dernier d-${cls}`}>{cls === 'bon' ? '✓ ' : cls === 'moyen' ? '~ ' : '! '}Dernière vérif. : {texteReleve(r, dateCourte)}</small>
}
