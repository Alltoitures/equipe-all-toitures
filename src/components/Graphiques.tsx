import { useState } from 'react'

/** Barres verticales, une seule série (couleur d'accent), valeur au-dessus, détail au toucher. */
export function Barres({ donnees, unite = '', hauteur = 120, format = (n: number) => String(n) }: {
  donnees: { label: string; valeur: number; sous?: string; courant?: boolean }[]
  unite?: string
  hauteur?: number
  format?: (n: number) => string
}) {
  const [actif, setActif] = useState<number | null>(null)
  const max = Math.max(1, ...donnees.map((d) => d.valeur))
  return (
    <div className="barres" style={{ ['--h' as string]: `${hauteur}px` }} onMouseLeave={() => setActif(null)}>
      {donnees.map((d, i) => (
        <button type="button" key={d.label + i} className={`barre-col${d.courant ? ' courant' : ''}${actif === i ? ' actif' : ''}`}
          onClick={() => setActif(actif === i ? null : i)} onMouseEnter={() => setActif(i)} aria-label={`${d.label} : ${format(d.valeur)}${unite}`}>
          <span className="barre-val">{d.valeur ? format(d.valeur) : ''}</span>
          <span className="barre-zone"><i style={{ height: `${(d.valeur / max) * 100}%` }} /></span>
          <span className="barre-lab">{d.label}</span>
          {d.sous && <span className="barre-sous">{d.sous}</span>}
        </button>
      ))}
    </div>
  )
}

/** Barres horizontales classées (une série). */
export function Classement({ donnees, max: nbMax = 6 }: { donnees: { nom: string; n: number }[]; max?: number }) {
  const l = donnees.slice(0, nbMax)
  const reste = donnees.slice(nbMax).reduce((s, d) => s + d.n, 0)
  const lignes = reste ? [...l, { nom: 'Autres', n: reste }] : l
  const m = Math.max(1, ...lignes.map((d) => d.n))
  const total = lignes.reduce((s, d) => s + d.n, 0) || 1
  return (
    <ul className="classement">
      {lignes.map((d) => (
        <li key={d.nom}>
          <span className="cl-nom">{d.nom}</span>
          <span className="cl-barre"><i style={{ width: `${(d.n / m) * 100}%` }} /></span>
          <span className="cl-val">{d.n} <small>{Math.round((d.n / total) * 100)} %</small></span>
        </li>
      ))}
    </ul>
  )
}

/** Barre empilée des statuts de devis (couleurs de statut + libellés, jamais la couleur seule). */
export function Repartition({ parts }: { parts: { nom: string; n: number; classe: string }[] }) {
  const total = parts.reduce((s, p) => s + p.n, 0)
  if (!total) return <p className="sous">Pas encore de données.</p>
  return (
    <>
      <div className="empile">
        {parts.filter((p) => p.n).map((p) => <i key={p.nom} className={p.classe} style={{ flexGrow: p.n }} title={`${p.nom} : ${p.n}`} />)}
      </div>
      <ul className="legende">
        {parts.filter((p) => p.n).map((p) => (
          <li key={p.nom}><span className={`pastille-dot ${p.classe}`} />{p.nom} <strong>{p.n}</strong> <small>{Math.round((p.n / total) * 100)} %</small></li>
        ))}
      </ul>
    </>
  )
}
