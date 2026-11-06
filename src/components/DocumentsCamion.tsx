import { useEffect, useRef, useState } from 'react'
import { supabase, erreurLisible } from '../lib/supabase'
import { dateCourte, isoJour } from '../lib/format'

/** Documents à garder dans chaque camion. « obligatoire » = à présenter en cas de contrôle. */
export const TYPES_DOCS: { type: string; aide: string; obligatoire?: boolean; expire?: boolean }[] = [
  { type: 'Carte grise', aide: 'Certificat d\'immatriculation : l\'original doit être dans le camion.', obligatoire: true },
  { type: 'Attestation d\'assurance', aide: 'Plus de carte verte depuis avril 2024, mais utile pour un constat.', expire: true },
  { type: 'Constat amiable', aide: 'Un exemplaire vierge dans la boîte à gants.' },
  { type: 'Contrôle technique', aide: 'Dernier procès-verbal.', expire: true },
  { type: 'Contrat de location / leasing', aide: 'Si le camion est en LLD ou crédit-bail : numéro d\'assistance.' },
  { type: 'Attestation décennale', aide: 'À montrer au client ou sur un chantier.', expire: true },
  { type: 'Carnet d\'entretien', aide: 'Dates et kilométrages des révisions.' },
  { type: 'Consignes gaz (chalumeau)', aide: 'Transport des bouteilles : debout, attachées, camion aéré.' }
]

export interface DocCamion { id: string; vehicule_id: string; type: string; fichier_path: string | null; fichier_nom: string | null; expire_le: string | null; note: string | null }

const jours = (d: string) => Math.round((new Date(d + 'T12:00').getTime() - new Date(isoJour() + 'T12:00').getTime()) / 864e5)
export function etatDoc(d?: DocCamion): 'manque' | 'expire' | 'bientot' | 'ok' {
  if (!d?.fichier_path) return 'manque'
  if (d.expire_le && jours(d.expire_le) < 0) return 'expire'
  if (d.expire_le && jours(d.expire_le) <= 30) return 'bientot'
  return 'ok'
}

export function useDocsCamion(vid: string) {
  const [docs, setDocs] = useState<DocCamion[] | null>(null)
  const charger = () => supabase.from('vehicule_documents').select('*').eq('vehicule_id', vid).then(({ data }) => setDocs((data ?? []) as DocCamion[]))
  useEffect(() => { charger() }, [vid])
  return { docs, recharger: charger }
}

async function ouvrir(d: DocCamion) {
  const fen = window.open('', '_blank')
  const { data } = await supabase.storage.from('vehicules').createSignedUrl(d.fichier_path!, 600)
  if (data?.signedUrl) { if (fen) fen.location.href = data.signedUrl; else window.location.href = data.signedUrl }
  else fen?.close()
}

/** Liste des documents du camion. `gerer` : le bureau dépose les fichiers et les dates d'échéance. */
export default function DocumentsCamion({ vid, gerer }: { vid: string; gerer?: boolean }) {
  const { docs, recharger } = useDocsCamion(vid)
  const [edit, setEdit] = useState<{ type: string; d?: DocCamion } | null>(null)
  if (!docs) return null
  const types = [...TYPES_DOCS, ...docs.filter((d) => !TYPES_DOCS.some((t) => t.type === d.type)).map((d) => ({ type: d.type, aide: '' }))]
  const manquants = TYPES_DOCS.filter((t) => t.obligatoire && etatDoc(docs.find((d) => d.type === t.type)) === 'manque').length

  return (
    <section className="carte">
      <div className="titre-ligne">
        <h2>Documents à bord</h2>
        <span className="sous">{docs.filter((d) => d.fichier_path).length} / {TYPES_DOCS.length}</span>
      </div>
      {!gerer && <p className="aide">En cas de contrôle ou d'accident : touchez un document pour l'afficher sur le téléphone.</p>}
      {gerer && manquants > 0 && <p className="erreur">Carte grise manquante : à déposer.</p>}
      <ul className="docs-camion">
        {types.map((t) => {
          const d = docs.find((x) => x.type === t.type)
          const e = etatDoc(d)
          if (!gerer && e === 'manque') return null
          return (
            <li key={t.type} className={`dc-${e}`}>
              <button type="button" className="dc-ligne" onClick={() => (d?.fichier_path && !gerer ? ouvrir(d) : gerer ? setEdit({ type: t.type, d }) : undefined)}>
                <span className="dc-ico">{e === 'manque' ? '＋' : '📄'}</span>
                <span className="dc-txt">
                  <strong>{t.type}{'obligatoire' in t && t.obligatoire ? <em> obligatoire</em> : null}</strong>
                  <small>{e === 'manque' ? (gerer ? 'À déposer' : '') : d?.expire_le ? `${e === 'expire' ? 'Expiré le' : 'Valable jusqu\'au'} ${dateCourte(d.expire_le)}` : (d?.note || 'Disponible')}</small>
                </span>
                {gerer && d?.fichier_path && <span className="lien" onClick={(x) => { x.stopPropagation(); ouvrir(d) }}>Voir</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {!gerer && docs.filter((d) => d.fichier_path).length === 0 && <p className="sous">Aucun document déposé pour ce camion. Demandez au bureau.</p>}
      {gerer && <button type="button" className="lien" onClick={() => { const t = prompt('Nom du document'); if (t?.trim()) setEdit({ type: t.trim() }) }}>+ Autre document</button>}
      {edit && <EditionDoc vid={vid} type={edit.type} d={edit.d} fermer={() => { setEdit(null); recharger() }} />}
    </section>
  )
}

function EditionDoc({ vid, type, d, fermer }: { vid: string; type: string; d?: DocCamion; fermer: () => void }) {
  const fichier = useRef<HTMLInputElement>(null)
  const [expire, setExpire] = useState(d?.expire_le ?? '')
  const [note, setNote] = useState(d?.note ?? '')
  const [nom, setNom] = useState(d?.fichier_nom ?? '')
  const [erreur, setErreur] = useState('')
  const [envoi, setEnvoi] = useState(false)
  const info = TYPES_DOCS.find((t) => t.type === type)

  async function enregistrer() {
    setEnvoi(true)
    setErreur('')
    try {
      let path = d?.fichier_path ?? null
      let fichierNom = d?.fichier_nom ?? null
      const f = fichier.current?.files?.[0]
      if (f) {
        const ext = f.name.split('.').pop()?.toLowerCase() || 'pdf'
        path = `${vid}/${crypto.randomUUID()}.${ext}`
        const up = await supabase.storage.from('vehicules').upload(path, f, { contentType: f.type || undefined })
        if (up.error) throw up.error
        if (d?.fichier_path) await supabase.storage.from('vehicules').remove([d.fichier_path])
        fichierNom = f.name
      }
      const ligne = { vehicule_id: vid, type, fichier_path: path, fichier_nom: fichierNom, expire_le: expire || null, note: note.trim() || null }
      const r = d ? await supabase.from('vehicule_documents').update(ligne).eq('id', d.id) : await supabase.from('vehicule_documents').insert(ligne)
      if (r.error) throw r.error
      fermer()
    } catch (e) {
      setErreur(erreurLisible(e))
      setEnvoi(false)
    }
  }

  async function supprimer() {
    if (!d || !confirm(`Retirer « ${type} » de ce camion ?`)) return
    if (d.fichier_path) await supabase.storage.from('vehicules').remove([d.fichier_path])
    await supabase.from('vehicule_documents').delete().eq('id', d.id)
    fermer()
  }

  return (
    <div className="fond-modal" onClick={fermer}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{type}</h2>
        {info?.aide && <p className="aide">{info.aide}</p>}
        <label className="btn large depot-doc">
          {nom ? `📄 ${nom}` : '📷 Photo ou PDF du document'}
          <input ref={fichier} type="file" accept="image/*,application/pdf" hidden onChange={(e) => setNom(e.target.files?.[0]?.name ?? nom)} />
        </label>
        {(info?.expire ?? true) && <label>Valable jusqu'au<input type="date" value={expire} onChange={(e) => setExpire(e.target.value)} /></label>}
        <label>Note<input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ex. n° d'assistance, original dans la boîte à gants" /></label>
        {erreur && <p className="erreur">{erreur}</p>}
        <div className="boutons">
          {d && <button type="button" className="btn danger" onClick={supprimer}>Retirer</button>}
          <button type="button" className="btn" onClick={fermer}>Annuler</button>
          <button type="button" className="btn pri" disabled={envoi || (!nom && !d)} onClick={enregistrer}>{envoi ? 'Envoi…' : 'Enregistrer'}</button>
        </div>
      </div>
    </div>
  )
}
