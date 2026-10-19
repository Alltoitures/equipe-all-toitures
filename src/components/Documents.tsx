import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

interface Element {
  id: string
  nom: string
  dossier: boolean
  nb: number | null
  taille: number | null
  modifie: string | null
  type: string | null
  miniature: string | null
  grande: string | null
  lien: string | null
}

interface Reponse {
  dossier: string
  racine: string
  fil: { id: string; nom: string }[]
  elements: Element[]
  erreur?: string
}

const LIBELLES: Record<string, string> = {
  A: 'Administratif',
  B: 'Plans et technique',
  C: 'Photos',
  D: 'Fournisseurs',
  E: 'Sécurité',
  F: 'Suivi chantier'
}

function libelleDossier(nom: string) {
  const m = nom.match(/^([A-F])\s*-\s*/i)
  return m ? LIBELLES[m[1].toUpperCase()] ?? nom : nom
}

function estImage(e: Element) {
  return !!e.type?.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(e.nom)
}

function taille(o: number | null) {
  if (!o) return ''
  if (o > 1e6) return `${(o / 1e6).toFixed(1).replace('.', ',')} Mo`
  return `${Math.round(o / 1e3)} Ko`
}

export default function Documents({ chantierId }: { chantierId: string }) {
  const [dossier, setDossier] = useState<string | undefined>()
  const [rep, setRep] = useState<Reponse | null>(null)
  const [erreur, setErreur] = useState('')
  const [chargement, setChargement] = useState(true)
  const [image, setImage] = useState<Element | null>(null)

  useEffect(() => {
    let actif = true
    setChargement(true)
    setErreur('')
    supabase.functions
      .invoke('documents-chantier', { body: { chantier: chantierId, dossier } })
      .then(async ({ data, error }) => {
        if (!actif) return
        if (error) {
          let msg = 'Documents indisponibles pour le moment.'
          try {
            const j = await (error as { context?: Response }).context?.json()
            if (j?.erreur) msg = j.erreur
          } catch { /* réponse non lisible */ }
          if (!navigator.onLine) msg = 'Pas de connexion : les documents ne sont visibles qu\'avec du réseau.'
          setErreur(msg)
          setRep(null)
        } else setRep(data as Reponse)
        setChargement(false)
      })
    return () => {
      actif = false
    }
  }, [chantierId, dossier])

  const images = rep?.elements.filter((e) => !e.dossier && estImage(e)) ?? []
  const fichiers = rep?.elements.filter((e) => !e.dossier && !estImage(e)) ?? []
  const dossiers = rep?.elements.filter((e) => e.dossier) ?? []
  const aLaRacine = !dossier || dossier === rep?.racine

  return (
    <div className="docs">
      {!aLaRacine && rep && (
        <div className="fil">
          <button className="lien" onClick={() => setDossier(undefined)}>Dossier du chantier</button>
          {rep.fil.map((f, i) => (
            <span key={f.id}>
              {' › '}
              {i < rep.fil.length - 1 ? (
                <button className="lien" onClick={() => setDossier(f.id)}>{i === 0 ? libelleDossier(f.nom) : f.nom}</button>
              ) : (
                <strong>{i === 0 ? libelleDossier(f.nom) : f.nom}</strong>
              )}
            </span>
          ))}
        </div>
      )}

      {chargement && <p className="sous">Chargement des documents…</p>}
      {erreur && <p className="erreur">{erreur}</p>}

      {!chargement && rep && (
        <>
          {dossiers.length > 0 && (
            <div className={aLaRacine ? 'tuiles-docs' : 'liste-docs'}>
              {dossiers.map((d) => (
                <button key={d.id} className="doc-dossier" onClick={() => setDossier(d.id)}>
                  <span className="ico-dossier" aria-hidden="true">{aLaRacine ? d.nom.charAt(0).toUpperCase() : '▸'}</span>
                  <span>
                    <strong>{aLaRacine ? libelleDossier(d.nom) : d.nom}</strong>
                    <small>{d.nb ?? 0} élément{(d.nb ?? 0) > 1 ? 's' : ''}</small>
                  </span>
                </button>
              ))}
            </div>
          )}

          {images.length > 0 && (
            <div className="galerie">
              {images.map((e) => (
                <button key={e.id} className="vignette" onClick={() => setImage(e)} aria-label={e.nom}>
                  {e.miniature ? <img src={e.miniature} alt="" loading="lazy" /> : <span>{e.nom}</span>}
                </button>
              ))}
            </div>
          )}

          {fichiers.length > 0 && (
            <div className="liste-docs">
              {fichiers.map((e) => (
                <a key={e.id} className="doc-fichier" href={e.lien ?? '#'} target="_blank" rel="noreferrer">
                  <span className="ext">{(e.nom.split('.').pop() ?? '').toUpperCase().slice(0, 4)}</span>
                  <span>
                    <strong>{e.nom}</strong>
                    <small>{taille(e.taille)}</small>
                  </span>
                </a>
              ))}
            </div>
          )}

          {rep.elements.length === 0 && <div className="vide">Ce dossier est vide.</div>}
        </>
      )}

      {image && (
        <div className="visionneuse" onClick={() => setImage(null)}>
          <img src={image.grande ?? image.miniature ?? ''} alt={image.nom} />
          <div className="visionneuse-bas" onClick={(e) => e.stopPropagation()}>
            <span>{image.nom}</span>
            <div className="boutons">
              {image.lien && <a className="btn" href={image.lien} target="_blank" rel="noreferrer">Original</a>}
              <button className="btn pri" onClick={() => setImage(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
