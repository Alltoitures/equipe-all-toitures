import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { estGerant, estStaff, useAuth } from '../lib/auth'
import { surAttente } from '../lib/photos'
import { Logo } from './Logo'
import { IcoAccueil, IcoChantier, IcoCompte, IcoGestion, IcoHeures, IcoVisite } from './Icones'

export default function Layout() {
  const { membre } = useAuth()
  const [attente, setAttente] = useState(0)
  const [enLigne, setEnLigne] = useState(navigator.onLine)

  useEffect(() => surAttente(setAttente), [])
  useEffect(() => {
    const on = () => setEnLigne(true)
    const off = () => setEnLigne(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  return (
    <div className="app">
      <header className="barre">
        <Logo petit />
        <Link to="/compte" className="qui">{membre?.prenom}</Link>
      </header>
      {(!enLigne || attente > 0) && (
        <div className={enLigne ? 'bandeau info' : 'bandeau hors'}>
          {!enLigne && 'Hors connexion. '}
          {attente > 0 && `${attente} photo${attente > 1 ? 's' : ''} en attente d'envoi.`}
          {!enLigne && attente === 0 && 'Les données affichées peuvent dater.'}
        </div>
      )}
      <main className="contenu">
        <Outlet />
      </main>
      <nav className="onglets">
        {estStaff(membre) ? (
          <>
            <NavLink to="/" end><IcoAccueil /><span>Accueil</span></NavLink>
            {estGerant(membre) && <NavLink to="/visites"><IcoVisite /><span>Visites</span></NavLink>}
            <NavLink to="/chantiers"><IcoChantier /><span>Chantiers</span></NavLink>
            <NavLink to="/heures"><IcoHeures /><span>Heures</span></NavLink>
            <NavLink to="/gestion"><IcoGestion /><span>Gestion</span></NavLink>
          </>
        ) : (
          <>
            <NavLink to="/" end><IcoChantier /><span>Chantiers</span></NavLink>
            <NavLink to="/heures"><IcoHeures /><span>Heures</span></NavLink>
            <NavLink to="/compte"><IcoCompte /><span>Compte</span></NavLink>
          </>
        )}
      </nav>
    </div>
  )
}
