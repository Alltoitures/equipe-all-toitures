import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { ROLES } from '../lib/supabase'
import { envoyerAttente, surAttente } from '../lib/photos'
import { telAffiche } from '../lib/format'
import { Link } from 'react-router-dom'
import { CarteNotifications } from '../components/Notifications'

export default function Compte() {
  const { membre, deconnexion } = useAuth()
  const [attente, setAttente] = useState(0)
  useEffect(() => surAttente(setAttente), [])
  const installee = window.matchMedia('(display-mode: standalone)').matches
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)

  if (!membre) return null
  return (
    <div className="page">
      <h1>Mon compte</h1>
      <section className="carte">
        <p><strong>{membre.prenom} {membre.nom}</strong></p>
        <p className="sous">{ROLES[membre.role]} · {telAffiche(membre.telephone)}</p>
      </section>

      <CarteNotifications />

      <section className="carte">
        <h2>Raccourcis</h2>
        <div className="boutons">
          <Link className="btn" to="/vehicules">Camions : contrôles</Link>
          <Link className="btn" to="/aide">Mode d'emploi</Link>
        </div>
      </section>

      <section className="carte">
        <h2>Photos</h2>
        <p>{attente === 0 ? 'Toutes vos photos sont envoyées.' : `${attente} photo${attente > 1 ? 's' : ''} en attente d'envoi.`}</p>
        {attente > 0 && <button className="btn" onClick={() => envoyerAttente()}>Envoyer maintenant</button>}
      </section>

      {!installee && (
        <section className="carte">
          <h2>Installer l'application</h2>
          {ios ? (
            <p>Dans Safari, touchez le bouton <strong>Partager</strong> puis <strong>« Sur l'écran d'accueil »</strong>.</p>
          ) : (
            <p>Dans Chrome, ouvrez le menu <strong>⋮</strong> puis <strong>« Ajouter à l'écran d'accueil »</strong> ou <strong>« Installer l'application »</strong>.</p>
          )}
        </section>
      )}

      <section className="carte">
        <h2>Confidentialité</h2>
        <p className="sous">L'application n'utilise que l'appareil photo, au moment où vous prenez une photo. Elle n'a accès ni à vos contacts, ni à votre galerie, ni à votre position.</p>
      </section>

      <button className="btn large" onClick={deconnexion}>Se déconnecter</button>
    </div>
  )
}
