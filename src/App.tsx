import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, estGerant, estStaff, useAuth } from './lib/auth'
import Layout from './components/Layout'
import Connexion from './pages/Connexion'
import MesChantiers from './pages/MesChantiers'
import Chantier from './pages/Chantier'
import Heures from './pages/Heures'
import Compte from './pages/Compte'
import Gestion from './pages/gestion/Gestion'
import Equipe from './pages/gestion/Equipe'
import ChantiersGestion from './pages/gestion/Chantiers'
import ChantierEdition from './pages/gestion/ChantierEdition'
import ValidationHeures from './pages/gestion/ValidationHeures'
import Export from './pages/gestion/Export'
import { Logo } from './components/Logo'
import Accueil from './pages/Accueil'
import Visites from './pages/Visites'
import Visite from './pages/Visite'

function Routeur() {
  const { session, membre, chargement, desactive, deconnexion } = useAuth()

  if (chargement) return <div className="ecran-centre"><Logo /></div>
  if (!session) return <Connexion />
  if (desactive)
    return (
      <div className="ecran-centre">
        <Logo />
        <p>Votre accès a été désactivé. Contactez le gérant.</p>
        <button className="btn" onClick={deconnexion}>Se déconnecter</button>
      </div>
    )
  if (!membre) return <div className="ecran-centre"><Logo /><p>Chargement de votre profil…</p></div>

  const staff = estStaff(membre)
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={staff ? <Accueil /> : <MesChantiers />} />
        <Route path="chantiers" element={<MesChantiers />} />
        {estGerant(membre) && (
          <>
            <Route path="visites" element={<Visites />} />
            <Route path="visites/:id" element={<Visite />} />
          </>
        )}
        <Route path="chantier/:id" element={<Chantier />} />
        <Route path="heures" element={<Heures />} />
        <Route path="compte" element={<Compte />} />
        {staff && (
          <>
            <Route path="gestion" element={<Gestion />} />
            <Route path="gestion/chantiers" element={<ChantiersGestion />} />
            <Route path="gestion/chantiers/:id" element={<ChantierEdition />} />
            <Route path="gestion/heures" element={<ValidationHeures />} />
            <Route path="gestion/export" element={<Export />} />
            {estGerant(membre) && <Route path="gestion/equipe" element={<Equipe />} />}
          </>
        )}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routeur />
      </BrowserRouter>
    </AuthProvider>
  )
}
