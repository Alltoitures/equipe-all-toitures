import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, erreurLisible } from '../lib/supabase'
import { activerPush, desactiverPush, etatPush, type EtatPush } from '../lib/push'
import { useAuth } from '../lib/auth'

/** Carte complète (page Compte). */
export function CarteNotifications() {
  const { membre } = useAuth()
  const [etat, setEtat] = useState<EtatPush | null>(null)
  const [msg, setMsg] = useState('')
  const [occupe, setOccupe] = useState(false)
  useEffect(() => { etatPush().then(setEtat).catch(() => setEtat('non_supporte')) }, [])

  async function activer() {
    if (!membre) return
    setOccupe(true)
    setMsg('')
    try {
      await activerPush(membre.id)
      setEtat('actif')
      setMsg('Notifications activées.')
    } catch (e) {
      setMsg(erreurLisible(e))
      setEtat(await etatPush())
    } finally {
      setOccupe(false)
    }
  }

  return (
    <section className="carte">
      <h2>Notifications</h2>
      {etat === 'actif' && <p>Activées sur ce téléphone.</p>}
      {etat === 'inactif' && <p className="sous">Recevez les nouveaux chantiers, rappels d'heures et réponses à vos demandes.</p>}
      {etat === 'installer' && <p>Sur iPhone, installez d'abord l'application sur l'écran d'accueil (Safari › Partager › « Sur l'écran d'accueil »), puis ouvrez-la depuis l'icône.</p>}
      {etat === 'refuse' && <p>Les notifications sont bloquées. Autorisez-les dans les réglages du téléphone (Réglages › Notifications › ALL TOITURES), puis revenez ici.</p>}
      {etat === 'non_supporte' && <p className="sous">Ce téléphone ou ce navigateur ne permet pas les notifications.</p>}
      <div className="boutons">
        {etat === 'inactif' && <button className="btn pri" disabled={occupe} onClick={activer}>Activer les notifications</button>}
        {etat === 'actif' && (
          <>
            <button className="btn" onClick={async () => { await supabase.rpc('tester_notification'); setMsg('Notification de test envoyée (quelques secondes).') }}>Tester</button>
            <button className="btn ghost" onClick={async () => { await desactiverPush(); setEtat('inactif') }}>Désactiver</button>
          </>
        )}
      </div>
      {msg && <p className="aide">{msg}</p>}
    </section>
  )
}

/** Bandeau discret tant que les notifications ne sont pas activées. */
export function RappelNotifications() {
  const [etat, setEtat] = useState<EtatPush | null>(null)
  const [masque, setMasque] = useState(() => {
    try { return localStorage.getItem('at-notif-masque') === '1' } catch { return false }
  })
  useEffect(() => { etatPush().then(setEtat).catch(() => setEtat(null)) }, [])
  if (masque || (etat !== 'inactif' && etat !== 'installer')) return null
  return (
    <div className="rappel-notif">
      <Link to="/compte">🔔 Activez les notifications pour être prévenu des nouveaux chantiers et rappels.</Link>
      <button aria-label="Masquer" onClick={() => { setMasque(true); try { localStorage.setItem('at-notif-masque', '1') } catch { /* rien */ } }}>×</button>
    </div>
  )
}
