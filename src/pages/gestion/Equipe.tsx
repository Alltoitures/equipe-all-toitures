import { useEffect, useState } from 'react'
import { supabase, erreurLisible, ROLES, type Membre, type Role } from '../../lib/supabase'
import { dateCourte, normaliserTel, telAffiche } from '../../lib/format'
import { useAuth } from '../../lib/auth'

export default function Equipe() {
  const { membre: moi } = useAuth()
  const [liste, setListe] = useState<Membre[]>([])
  const [ajout, setAjout] = useState(false)
  const [f, setF] = useState({ prenom: '', nom: '', telephone: '', role: 'ouvrier' as Role })
  const [invit, setInvit] = useState<{ m: Membre; code: string } | null>(null)
  const [erreur, setErreur] = useState('')

  async function charger() {
    const { data } = await supabase.from('membres').select('*').order('actif', { ascending: false }).order('prenom')
    setListe((data ?? []) as Membre[])
  }
  useEffect(() => {
    charger()
  }, [])

  async function ajouter(e: React.FormEvent) {
    e.preventDefault()
    setErreur('')
    const tel = normaliserTel(f.telephone)
    if (!/^0[67]\d{8}$/.test(tel)) return setErreur('Numéro de portable invalide (06 ou 07).')
    const { data, error } = await supabase
      .from('membres')
      .insert({ prenom: f.prenom.trim(), nom: f.nom.trim(), telephone: tel, role: f.role })
      .select()
      .single()
    if (error) return setErreur(error.code === '23505' ? 'Ce numéro est déjà utilisé.' : erreurLisible(error))
    setAjout(false)
    setF({ prenom: '', nom: '', telephone: '', role: 'ouvrier' })
    await charger()
    inviter(data as Membre)
  }

  async function inviter(m: Membre) {
    setErreur('')
    const { data, error } = await supabase.rpc('creer_invitation', { m: m.id })
    if (error) return setErreur(erreurLisible(error))
    setInvit({ m, code: data as string })
    charger()
  }

  async function basculer(m: Membre) {
    if (m.id === moi?.id) return
    const action = m.actif ? 'Couper l\'accès de' : 'Réactiver'
    if (!confirm(`${action} ${m.prenom} ${m.nom} ?`)) return
    await supabase.from('membres').update({ actif: !m.actif }).eq('id', m.id)
    charger()
  }

  async function changerRole(m: Membre, role: Role) {
    await supabase.from('membres').update({ role }).eq('id', m.id)
    charger()
  }

  const lien = invit ? `${location.origin}/?tel=${invit.m.telephone}&invitation=${invit.code}` : ''
  const texteSms = invit
    ? `Bonjour ${invit.m.prenom}, voici ton accès à l'application ALL TOITURES : ${lien}\nCode d'invitation : ${invit.code} (valable 7 jours). Ouvre le lien, ajoute l'appli à l'écran d'accueil, puis choisis ton code personnel.`
    : ''

  return (
    <div className="page">
      <div className="titre-ligne">
        <h1>Équipe</h1>
        <button className="btn pri" onClick={() => setAjout(true)}>+ Ajouter</button>
      </div>
      {erreur && <p className="erreur">{erreur}</p>}

      {ajout && (
        <form className="carte" onSubmit={ajouter}>
          <h2>Nouvelle personne</h2>
          <div className="deux">
            <label>Prénom<input value={f.prenom} onChange={(e) => setF({ ...f, prenom: e.target.value })} required /></label>
            <label>Nom<input value={f.nom} onChange={(e) => setF({ ...f, nom: e.target.value })} required /></label>
          </div>
          <label>Téléphone portable<input type="tel" value={f.telephone} onChange={(e) => setF({ ...f, telephone: e.target.value })} required /></label>
          <label>
            Rôle
            <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}>
              {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
          </label>
          <div className="boutons">
            <button type="button" className="btn" onClick={() => setAjout(false)}>Annuler</button>
            <button className="btn pri">Ajouter et inviter</button>
          </div>
        </form>
      )}

      {invit && (
        <section className="carte accent">
          <h2>Invitation pour {invit.m.prenom}</h2>
          <p>Code d'invitation : <strong className="code">{invit.code}</strong> (valable 7 jours)</p>
          <div className="boutons">
            <a className="btn pri" href={`sms:${invit.m.telephone}?&body=${encodeURIComponent(texteSms)}`}>Envoyer par SMS</a>
            <button className="btn" onClick={() => navigator.clipboard.writeText(texteSms)}>Copier le message</button>
            <button className="btn ghost" onClick={() => setInvit(null)}>Fermer</button>
          </div>
          <p className="aide">Le SMS part depuis votre téléphone. Une nouvelle invitation remplace l'ancien code de la personne (utile en cas d'oubli ou de nouveau téléphone).</p>
        </section>
      )}

      <div className="liste">
        {liste.map((m) => (
          <div key={m.id} className={m.actif ? 'membre' : 'membre inactif'}>
            <div>
              <strong>{m.prenom} {m.nom}</strong>
              <span className="sous">{telAffiche(m.telephone)}</span>
              <span className="sous">
                {!m.actif ? 'Accès coupé' : m.user_id ? `Connecté · dernière fois ${dateCourte(m.derniere_connexion)}` : m.invitation_code ? 'Invitation envoyée' : 'Pas encore invité'}
              </span>
            </div>
            <div className="actions-membre">
              <select value={m.role} onChange={(e) => changerRole(m, e.target.value as Role)} disabled={m.id === moi?.id}>
                {(Object.keys(ROLES) as Role[]).map((r) => <option key={r} value={r}>{ROLES[r]}</option>)}
              </select>
              {m.actif && m.id !== moi?.id && <button className="btn" onClick={() => inviter(m)}>{m.user_id ? 'Nouveau code' : 'Inviter'}</button>}
              {m.id !== moi?.id && <button className={m.actif ? 'btn danger' : 'btn'} onClick={() => basculer(m)}>{m.actif ? 'Couper l\'accès' : 'Réactiver'}</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
