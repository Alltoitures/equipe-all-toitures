import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Membre } from './supabase'

interface Ctx {
  session: Session | null
  membre: Membre | null
  chargement: boolean
  desactive: boolean
  recharger: () => Promise<void>
  deconnexion: () => Promise<void>
}

const AuthCtx = createContext<Ctx>(null as unknown as Ctx)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [membre, setMembre] = useState<Membre | null>(null)
  const [chargement, setChargement] = useState(true)
  const [desactive, setDesactive] = useState(false)

  async function chargerMembre(s: Session | null) {
    if (!s) {
      setMembre(null)
      setDesactive(false)
      return
    }
    const { data, error } = await supabase.from('membres').select('*').eq('user_id', s.user.id).maybeSingle()
    if (error) {
      // Hors ligne : on garde le dernier profil connu.
      const cache = localStorage.getItem('at-membre')
      if (cache) setMembre(JSON.parse(cache))
      return
    }
    if (!data || !data.actif) {
      setMembre(null)
      setDesactive(true)
      localStorage.removeItem('at-membre')
      return
    }
    setDesactive(false)
    setMembre(data as Membre)
    localStorage.setItem('at-membre', JSON.stringify(data))
    supabase.rpc('noter_connexion').then(() => {})
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)
      await chargerMembre(data.session)
      setChargement(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((evt, s) => {
      setSession(s)
      if (evt === 'SIGNED_IN' || evt === 'SIGNED_OUT') chargerMembre(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const valeur: Ctx = {
    session,
    membre,
    chargement,
    desactive,
    recharger: () => chargerMembre(session),
    deconnexion: async () => {
      await supabase.auth.signOut()
      localStorage.removeItem('at-membre')
      setMembre(null)
    }
  }
  return <AuthCtx.Provider value={valeur}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)

export function estStaff(m: Membre | null) {
  return !!m && (m.role === 'gerant' || m.role === 'assistante')
}
export function estGerant(m: Membre | null) {
  return m?.role === 'gerant'
}
export function voitTout(m: Membre | null) {
  return !!m && ['gerant', 'assistante', 'chef'].includes(m.role)
}
