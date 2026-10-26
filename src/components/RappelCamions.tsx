import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { etatVehicule, moisLabel, type ControleV } from '../lib/vehicules'

/** Bandeau sur l'accueil de l'équipe : le vendredi (nettoyage) et dès le 1er vendredi du mois (niveaux). */
export function RappelCamions() {
  const [texte, setTexte] = useState<{ titre: string; detail: string } | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('vehicules').select('id, nom').eq('actif', true).order('nom'),
      supabase.from('controles_vehicules').select('id, vehicule_id, type, jour').gte('jour', new Date(Date.now() - 40 * 864e5).toISOString().slice(0, 10)).order('jour', { ascending: false })
    ]).then(([v, c]) => {
      const vehicules = (v.data ?? []) as { id: string; nom: string }[]
      const ctrls = (c.data ?? []) as unknown as ControleV[]
      const vendredi = new Date().getDay() === 5
      const sansVendredi = vendredi ? vehicules.filter((x) => !etatVehicule(x.id, ctrls).vendrediFait) : []
      const sansNiveaux = vehicules.filter((x) => { const e = etatVehicule(x.id, ctrls); return e.niveauxDus && !e.niveauxFaits })
      if (!sansVendredi.length && !sansNiveaux.length) return setTexte(null)
      const titre = sansVendredi.length && sansNiveaux.length
        ? 'Camions : nettoyage du vendredi + niveaux du mois'
        : sansVendredi.length ? 'Camions : nettoyage du vendredi' : `Camions : niveaux de ${moisLabel()} à faire`
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
