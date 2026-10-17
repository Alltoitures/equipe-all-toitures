import { useState } from 'react'
import { supabase, MOTIFS, ROLES, type Journee, type Membre } from '../../lib/supabase'
import { heuresJournee, hhmm, isoJour, moisAnnee } from '../../lib/format'

type Ligne = Journee & { membres: Membre; journee_chantiers: NonNullable<Journee['journee_chantiers']> }

function nombre(n: number) {
  return (Math.round(n * 100) / 100).toString().replace('.', ',')
}

function telecharger(nom: string, lignes: (string | number)[][]) {
  const csv = '﻿' + lignes.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nom
  a.click()
  URL.revokeObjectURL(url)
}

export default function Export() {
  const [mois, setMois] = useState(isoJour().slice(0, 7))
  const [info, setInfo] = useState('')
  const [occupe, setOccupe] = useState(false)

  async function charger(): Promise<Ligne[]> {
    const [a, m] = mois.split('-').map(Number)
    const fin = new Date(a, m, 0).getDate()
    const { data, error } = await supabase
      .from('journees')
      .select('*, membres(*), journee_chantiers(heures, chantiers(client_nom))')
      .gte('jour', `${mois}-01`)
      .lte('jour', `${mois}-${String(fin).padStart(2, '0')}`)
      .order('jour')
    if (error) throw error
    return (data ?? []) as Ligne[]
  }

  async function exporter(type: 'recap' | 'detail') {
    setOccupe(true)
    setInfo('')
    try {
      const js = await charger()
      const nonValidees = js.filter((j) => !j.valide).length
      const titre = moisAnnee(`${mois}-01`)
      if (type === 'recap') {
        const parMembre = new Map<string, Ligne[]>()
        js.forEach((j) => parMembre.set(j.membre_id, [...(parMembre.get(j.membre_id) ?? []), j]))
        const lignes: (string | number)[][] = [[
          'Nom', 'Prénom', 'Rôle', 'Jours travaillés', 'Heures travaillées', 'Dont heures intempéries',
          'Jours intempéries annulés', 'Jours école', 'Absences', 'Paniers repas', 'Journées non validées'
        ]]
        for (const l of [...parMembre.values()].sort((x, y) => x[0].membres.nom.localeCompare(y[0].membres.nom))) {
          const m = l[0].membres
          const h = (f: (j: Ligne) => boolean) => l.filter(f).reduce((s, j) => s + heuresJournee(j.depart, j.retour, j.pause_min), 0)
          lignes.push([
            m.nom, m.prenom, ROLES[m.role],
            l.filter((j) => ['chantier', 'depot', 'intemperies_commencee'].includes(j.motif)).length,
            nombre(h(() => true)),
            nombre(h((j) => j.motif === 'intemperies_commencee')),
            l.filter((j) => j.motif === 'intemperies_annulee').length,
            l.filter((j) => j.motif === 'ecole').length,
            l.filter((j) => j.motif === 'absence').length,
            l.filter((j) => j.panier).length,
            l.filter((j) => !j.valide).length
          ])
        }
        telecharger(`ALL-TOITURES_paie_${mois}_recapitulatif.csv`, lignes)
      } else {
        const lignes: (string | number)[][] = [['Date', 'Nom', 'Prénom', 'Type', 'Départ', 'Retour', 'Pause (min)', 'Heures', 'Panier', 'Chantiers', 'Validée', 'Commentaire']]
        for (const j of js) {
          lignes.push([
            j.jour.split('-').reverse().join('/'), j.membres.nom, j.membres.prenom, MOTIFS[j.motif],
            hhmm(j.depart), hhmm(j.retour), j.pause_min, nombre(heuresJournee(j.depart, j.retour, j.pause_min)),
            j.panier ? 'Oui' : 'Non',
            j.journee_chantiers.map((r) => `${r.chantiers?.client_nom ?? '?'} (${nombre(r.heures)} h)`).join(', '),
            j.valide ? 'Oui' : 'Non', j.commentaire ?? ''
          ])
        }
        telecharger(`ALL-TOITURES_paie_${mois}_detail.csv`, lignes)
      }
      setInfo(`Export de ${titre} téléchargé.${nonValidees ? ` Attention : ${nonValidees} journée(s) non validée(s).` : ''}`)
    } catch (e) {
      setInfo(String((e as Error).message))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="page">
      <h1>Export paie</h1>
      <section className="carte">
        <label>Mois<input type="month" value={mois} onChange={(e) => setMois(e.target.value)} /></label>
        <div className="boutons">
          <button className="btn pri" disabled={occupe} onClick={() => exporter('recap')}>Récapitulatif par personne</button>
          <button className="btn" disabled={occupe} onClick={() => exporter('detail')}>Détail jour par jour</button>
        </div>
        <p className="aide">Fichiers à ouvrir dans Excel. Heures dépôt à dépôt, trajets compris, pause déduite. Intempéries comptées à part.</p>
        {info && <p className="ok">{info}</p>}
      </section>
    </div>
  )
}
