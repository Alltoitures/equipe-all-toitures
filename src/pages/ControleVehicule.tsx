import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { IcoRetour } from '../components/Icones'
import type { Vehicule } from './gestion/Vehicules'

export const POINTS_VEHICULE = [
  'Niveaux (huile, liquide de refroidissement, lave-glace)',
  'Pneus (usure, pression, pas de coupure)',
  'Éclairage et clignotants',
  'Freins, pas de voyant au tableau de bord',
  'Cabine propre et rangée',
  'Benne / plateau nettoyé, outillage rangé et attaché',
  'Papiers et carte carburant présents'
]

export default function ControleVehicule() {
  const nav = useNavigate()
  const { membre } = useAuth()
  const [vehicules, setVehicules] = useState<Vehicule[]>([])
  const [vid, setVid] = useState('')
  const [km, setKm] = useState('')
  const [points, setPoints] = useState<Record<string, boolean>>({})
  const [anomalie, setAnomalie] = useState('')
  const [msg, setMsg] = useState('')
  const [erreur, setErreur] = useState('')

  useEffect(() => {
    supabase.from('vehicules').select('*').eq('actif', true).order('nom').then(({ data }) => {
      setVehicules((data ?? []) as Vehicule[])
      if (data?.length === 1) setVid(data[0].id)
    })
  }, [])

  async function valider(e: React.FormEvent) {
    e.preventDefault()
    if (!membre || !vid) return
    const v = vehicules.find((x) => x.id === vid)
    if (km && v?.km && Number(km) < v.km) return setErreur(`Le kilométrage est inférieur au dernier relevé (${v.km.toLocaleString('fr-FR')} km).`)
    const manquants = POINTS_VEHICULE.filter((p) => !points[p])
    const { error } = await supabase.from('controles_vehicules').insert({
      vehicule_id: vid, membre_id: membre.id, km: km ? Number(km) : null, points,
      anomalie: anomalie.trim() || (manquants.length ? `Points non conformes : ${manquants.join(', ')}` : null)
    })
    if (error) return setErreur(erreurLisible(error))
    setMsg(anomalie.trim() || manquants.length ? 'Contrôle enregistré. Aurélien et Adeline sont prévenus de l\'anomalie.' : 'Contrôle enregistré. Merci !')
    setPoints({})
    setAnomalie('')
    setKm('')
  }

  return (
    <div className="page">
      <button className="retour" onClick={() => nav(-1)}><IcoRetour /> Retour</button>
      <h1>Contrôle véhicule</h1>
      <p className="aide">Chaque vendredi, avant de rentrer : un contrôle par camion.</p>
      {vehicules.length === 0 && <div className="vide">Aucun véhicule enregistré pour l'instant.</div>}
      {vehicules.length > 0 && (
        <form className="carte" onSubmit={valider}>
          <div className="choix">
            {vehicules.map((v) => <button type="button" key={v.id} aria-pressed={vid === v.id} onClick={() => setVid(v.id)}>{v.nom}</button>)}
          </div>
          <label>Kilométrage au compteur<input inputMode="numeric" value={km} onChange={(e) => setKm(e.target.value.replace(/\D/g, ''))} placeholder={vehicules.find((v) => v.id === vid)?.km?.toString() ?? ''} /></label>
          <ul className="taches">
            {POINTS_VEHICULE.map((p) => (
              <li key={p}><label className={points[p] ? 'fait' : ''}><input type="checkbox" checked={!!points[p]} onChange={() => setPoints({ ...points, [p]: !points[p] })} /><span>{p}</span></label></li>
            ))}
          </ul>
          <label>Problème à signaler (facultatif)<textarea rows={2} value={anomalie} onChange={(e) => setAnomalie(e.target.value)} placeholder="Ex. : bruit au freinage, rétroviseur cassé" /></label>
          {erreur && <p className="erreur">{erreur}</p>}
          {msg && <p className="ok">{msg}</p>}
          <button className="btn go large" disabled={!vid}>Enregistrer le contrôle</button>
        </form>
      )}
    </div>
  )
}
