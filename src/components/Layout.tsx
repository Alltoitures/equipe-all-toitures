import { useEffect, useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { estStaff, useAuth } from '../lib/auth'
import { surAttente } from '../lib/photos'
import { Logo } from './Logo'
import { IcoChantier, IcoCompte, IcoGestion, IcoHeures } from './Icones'

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
        <span className="qui">{membre?.prenom}</span>
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
        <NavLink to="/" end><IcoChantier /><span>Chantiers</span></NavLink>
        <NavLink to="/heures"><IcoHeures /><span>Heures</span></NavLink>
        {estStaff(membre) && <NavLink to="/gestion"><IcoGestion /><span>Gestion</span></NavLink>}
        <NavLink to="/compte"><IcoCompte /><span>Compte</span></NavLink>
      </nav>
    </div>
  )
}
