import { useState } from 'react'
import { supabase, erreurLisible } from '../lib/supabase'
import { normaliserTel } from '../lib/format'
import { Logo } from '../components/Logo'

type Mode = 'connexion' | 'invitation' | 'code'

export default function Connexion() {
  const params = new URLSearchParams(location.search)
  const [mode, setMode] = useState<Mode>(params.get('invitation') ? 'invitation' : 'connexion')
  const [tel, setTel] = useState(params.get('tel') ?? '')
  const [code, setCode] = useState('')
  const [invitation, setInvitation] = useState(params.get('invitation') ?? '')
  const [prenom, setPrenom] = useState('')
  const [pin1, setPin1] = useState('')
  const [pin2, setPin2] = useState('')
  const [erreur, setErreur] = useState('')
  const [occupe, setOccupe] = useState(false)

  async function seConnecter(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')
    setOccupe(true)
    try {
      const t = normaliserTel(tel)
      const { data: email, error } = await supabase.rpc('email_connexion', { tel: t })
      if (error) throw error
      if (!email) throw new Error('Numéro inconnu ou accès désactivé. Contactez le gérant.')
      const r = await supabase.auth.signInWithPassword({ email, password: code })
      if (r.error) throw r.error
    } catch (e) {
      setErreur(erreurLisible(e))
    } finally {
      setOccupe(false)
    }
  }

  async function verifierInvitation(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')
    setOccupe(true)
    try {
      const { data, error } = await supabase.rpc('verifier_invitation', {
        tel: normaliserTel(tel),
        code: invitation.trim()
      })
      if (error) throw error
      if (!data) throw new Error('Invitation invalide ou expirée. Demandez un nouveau code au gérant.')
      setPrenom(data)
      setMode('code')
    } catch (e) {
      setErreur(erreurLisible(e))
    } finally {
      setOccupe(false)
    }
  }

  async function creerCode(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')
    if (!/^\d{6}$/.test(pin1)) return setErreur('Le code doit contenir exactement 6 chiffres.')
    if (pin1 !== pin2) return setErreur('Les deux codes ne sont pas identiques.')
    setOccupe(true)
    try {
      const t = normaliserTel(tel)
      const suffixe = crypto.randomUUID().slice(0, 8)
      const email = `t${t}-${suffixe}@equipe.alltoitures.com`
      const r = await supabase.auth.signUp({
        email,
        password: pin1,
        options: { data: { telephone: t, invitation: invitation.trim() } }
      })
      if (r.error) throw r.error
      if (!r.data.session) {
        const s = await supabase.auth.signInWithPassword({ email, password: pin1 })
        if (s.error) throw s.error
      }
      history.replaceState(null, '', '/')
    } catch (e) {
      setErreur(erreurLisible(e))
    } finally {
      setOccupe(false)
    }
  }

  return (
    <div className="connexion">
      <div className="connexion-tete">
        <Logo />
        <p>Espace équipes</p>
      </div>

      {mode === 'connexion' && (
        <form className="carte" onSubmit={seConnecter}>
          <h1>Connexion</h1>
          <label>
            Numéro de téléphone
            <input type="tel" inputMode="tel" autoComplete="tel" value={tel} onChange={(e) => setTel(e.target.value)} placeholder="06 12 34 56 78" required />
          </label>
          <label>
            Votre code à 6 chiffres
            <input type="password" inputMode="numeric" autoComplete="current-password" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="btn pri large" disabled={occupe}>{occupe ? 'Connexion…' : 'Se connecter'}</button>
          <button type="button" className="lien" onClick={() => { setErreur(''); setMode('invitation') }}>
            Première connexion ou code oublié
          </button>
        </form>
      )}

      {mode === 'invitation' && (
        <form className="carte" onSubmit={verifierInvitation}>
          <h1>Première connexion</h1>
          <p className="aide">Saisissez votre numéro et le code d'invitation envoyé par le gérant.</p>
          <label>
            Numéro de téléphone
            <input type="tel" inputMode="tel" value={tel} onChange={(e) => setTel(e.target.value)} required />
          </label>
          <label>
            Code d'invitation
            <input inputMode="numeric" maxLength={6} value={invitation} onChange={(e) => setInvitation(e.target.value)} required />
          </label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="btn pri large" disabled={occupe}>Continuer</button>
          <button type="button" className="lien" onClick={() => { setErreur(''); setMode('connexion') }}>
            J'ai déjà un code
          </button>
        </form>
      )}

      {mode === 'code' && (
        <form className="carte" onSubmit={creerCode}>
          <h1>Bonjour {prenom}</h1>
          <p className="aide">Choisissez votre code personnel à 6 chiffres. Il vous servira à vous connecter.</p>
          <label>
            Nouveau code
            <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin1} onChange={(e) => setPin1(e.target.value)} required />
          </label>
          <label>
            Confirmez le code
            <input type="password" inputMode="numeric" autoComplete="new-password" maxLength={6} value={pin2} onChange={(e) => setPin2(e.target.value)} required />
          </label>
          {erreur && <p className="erreur">{erreur}</p>}
          <button className="btn pri large" disabled={occupe}>{occupe ? 'Création…' : 'Valider'}</button>
        </form>
      )}

      <p className="pied">ALL TOITURES · Vourles · Usage réservé aux équipes</p>
    </div>
  )
}
