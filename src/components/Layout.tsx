import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { estGerant, estStaff, useAuth } from '../lib/auth'
import { surAttente } from '../lib/photos'
import { supabase } from '../lib/supabase'
import { Logo } from './Logo'
import { IcoAccueil, IcoChantier, IcoCompte, IcoGestion, IcoHeures, IcoVisite } from './Icones'

export default function Layout() {
  const { membre } = useAuth()
  const { pathname } = useLocation()
  const surGestion = pathname.startsWith('/gestion') && !pathname.startsWith('/gestion/heures')
  const [attente, setAttente] = useState(0)
  const [enLigne, setEnLigne] = useState(navigator.onLine)

  const [aValider, setAValider] = useState(0)

  useEffect(() => surAttente(setAttente), [])
  // Gérant / bureau : nombre de journées des gars en attente de validation.
  useEffect(() => {
    if (!estStaff(membre)) return
    const compter = () =>
      supabase.from('journees').select('id', { count: 'exact', head: true }).eq('valide', false)
        .then(({ count }) => setAValider(count ?? 0))
    compter()
    const t = setInterval(compter, 120000)
    return () => clearInterval(t)
  }, [membre?.id])
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
        <Link to="/compte" className="qui"><span className="initiale">{membre?.prenom?.[0]}</span>{membre?.prenom}</Link>
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
            <NavLink to="/gestion/heures"><IcoHeures /><span>Heures</span>{aValider > 0 && <b className="pastille-nb">{aValider > 99 ? '99+' : aValider}</b>}</NavLink>
            <NavLink to="/gestion" className={() => (surGestion ? 'active' : '')}><IcoGestion /><span>Gestion</span></NavLink>
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
