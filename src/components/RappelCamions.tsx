import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { etatVehicule, ilYaJours, type ControleV } from '../lib/vehicules'

/** Bandeau sur l'accueil de l'équipe : le vendredi (nettoyage) et dès qu'un niveau ou une usure n'a pas été vérifié depuis 30 jours. */
export function RappelCamions() {
  const [texte, setTexte] = useState<{ titre: string; detail: string } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('vehicules').select('id, nom').eq('actif', true).order('nom'),
      supabase.from('controles_vehicules').select('id, vehicule_id, type, jour, points').gte('jour', ilYaJours(365)).order('jour', { ascending: false }).limit(1000)
    ]).then(([v, c]) => {
      const vehicules = (v.data ?? []) as { id: string; nom: string }[]
      const ctrls = (c.data ?? []) as unknown as ControleV[]
      const vendredi = new Date().getDay() === 5
      const sansVendredi = vendredi ? vehicules.filter((x) => !etatVehicule(x.id, ctrls).vendrediFait) : []
      const sansNiveaux = vehicules.filter((x) => !etatVehicule(x.id, ctrls).entretienAJour)
      if (!sansVendredi.length && !sansNiveaux.length) return setTexte(null)
      const titre = sansVendredi.length && sansNiveaux.length
        ? 'Camions : nettoyage du vendredi + niveaux à vérifier'
        : sansVendredi.length ? 'Camions : nettoyage du vendredi' : 'Camions : niveaux et usure à vérifier (plus de 30 jours)'
      const noms = [...new Set([...sansVendredi, ...sansNiveaux].map((x) => x.nom))]
      setTexte({ titre, detail: noms.join(', ') })
    })
  }, [])

  if (!texte) return null
  return (
    <Link className="bandeau-camion" to="/vehicules">
      <span>{texte.titre}<small>{texte.detail}</small></span>
      <span>›</span>
    </Link>
  )
}
