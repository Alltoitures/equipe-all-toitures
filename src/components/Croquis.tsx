import { useEffect, useRef, useState } from 'react'

/**
 * Croquis à main levée sur le téléphone : sur une page quadrillée ou par-dessus une photo.
 * Outils : crayon, trait droit (règle), texte (cotes), annuler, tout effacer.
 * Le résultat (JPEG) passe ensuite par l'écran de légende comme une photo.
 */

type Pt = [number, number]
type Element =
  | { t: 'main' | 'ligne'; c: string; w: number; pts: Pt[] }
  | { t: 'texte'; c: string; x: number; y: number; s: string }

const L = 1600 // largeur logique du dessin
const H = 1200 // hauteur logique (format 4:3)
const COULEURS = [
  { nom: 'Noir', v: '#0B1921' },
  { nom: 'Rouge', v: '#D62828' },
  { nom: 'Bleu', v: '#0082AD' }
]

export default function Croquis({ fermer }: { fermer: (blob: Blob | null) => void }) {
  const toile = useRef<HTMLCanvasElement>(null)
  const [fond, setFond] = useState<HTMLImageElement | null>(null)
  const [elements, setElements] = useState<Element[]>([])
  const [encours, setEncours] = useState<Element | null>(null)
  const [outil, setOutil] = useState<'main' | 'ligne' | 'texte'>('main')
  const [couleur, setCouleur] = useState(COULEURS[0].v)
  const [epais, setEpais] = useState(9)
  const [texte, setTexte] = useState<{ x: number; y: number; s: string } | null>(null)

  // Dessin complet (fond + éléments)
  useEffect(() => {
    const cv = toile.current
    if (!cv) return
    const ctx = cv.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, L, H)
    if (fond) {
      const r = Math.min(L / fond.width, H / fond.height)
      const w = fond.width * r, h = fond.height * r
      ctx.drawImage(fond, (L - w) / 2, (H - h) / 2, w, h)
    } else {
      ctx.strokeStyle = '#E6ECF2'
      ctx.lineWidth = 1.5
      for (let x = 0; x <= L; x += 50) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
      for (let y = 0; y <= H; y += 50) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(L, y); ctx.stroke() }
    }
    for (const e of encours ? [...elements, encours] : elements) {
      if (e.t === 'texte') {
        ctx.font = '800 60px Lato, sans-serif'
        ctx.lineWidth = 10
        ctx.strokeStyle = '#fff'
        ctx.strokeText(e.s, e.x, e.y)
        ctx.fillStyle = e.c
        ctx.fillText(e.s, e.x, e.y)
        continue
      }
      if (e.pts.length < 1) continue
      ctx.strokeStyle = e.c
      ctx.lineWidth = e.w
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(e.pts[0][0], e.pts[0][1])
      for (const p of e.pts.slice(1)) ctx.lineTo(p[0], p[1])
      if (e.pts.length === 1) ctx.lineTo(e.pts[0][0] + 0.1, e.pts[0][1])
      ctx.stroke()
    }
  }, [fond, elements, encours])

  function pos(e: React.PointerEvent): Pt {
    const b = toile.current!.getBoundingClientRect()
    return [((e.clientX - b.left) / b.width) * L, ((e.clientY - b.top) / b.height) * H]
  }

  function bas(e: React.PointerEvent) {
    const p = pos(e)
    if (outil === 'texte') {
      setTexte({ x: p[0], y: p[1], s: '' })
      return
    }
    toile.current!.setPointerCapture(e.pointerId)
    setEncours({ t: outil, c: couleur, w: epais, pts: [p] })
  }

  function bouge(e: React.PointerEvent) {
    if (!encours || encours.t === 'texte') return
    const p = pos(e)
    setEncours(encours.t === 'ligne' ? { ...encours, pts: [encours.pts[0], p] } : { ...encours, pts: [...encours.pts, p] })
  }

  function haut() {
    if (encours) setElements((x) => [...x, encours])
    setEncours(null)
  }

  function validerTexte() {
    if (texte && texte.s.trim()) setElements((x) => [...x, { t: 'texte', c: couleur, x: texte.x, y: texte.y, s: texte.s.trim() }])
    setTexte(null)
  }

  function chargerPhoto(f: File | undefined) {
    if (!f) return
    const img = new Image()
    img.onload = () => setFond(img)
    img.src = URL.createObjectURL(f)
  }

  function enregistrer() {
    toile.current!.toBlob((b) => fermer(b), 'image/jpeg', 0.85)
  }

  return (
    <div className="croquis" role="dialog" aria-label="Croquis">
      <div className="croquis-haut">
        <button type="button" className="lien" onClick={() => fermer(null)}>Annuler</button>
        <strong>Croquis</strong>
        <button type="button" className="btn go" disabled={!elements.length} onClick={enregistrer}>Enregistrer</button>
      </div>

      <div className="croquis-zone">
        <canvas
          ref={toile}
          width={L}
          height={H}
          className="croquis-toile"
          onPointerDown={bas}
          onPointerMove={bouge}
          onPointerUp={haut}
          onPointerCancel={haut}
        />
      </div>

      {texte && (
        <div className="croquis-texte">
          <input autoFocus value={texte.s} onChange={(e) => setTexte({ ...texte, s: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && validerTexte()} placeholder="Cote ou note : 6,40 m, versant nord…" />
          <button type="button" className="btn go" onClick={validerTexte}>OK</button>
        </div>
      )}

      <div className="croquis-outils">
        <div className="choix">
          <button type="button" aria-pressed={outil === 'main'} onClick={() => setOutil('main')}>✏️ Crayon</button>
          <button type="button" aria-pressed={outil === 'ligne'} onClick={() => setOutil('ligne')}>📏 Trait droit</button>
          <button type="button" aria-pressed={outil === 'texte'} onClick={() => setOutil('texte')}>🔤 Texte</button>
        </div>
        <div className="choix">
          {COULEURS.map((c) => (
            <button type="button" key={c.v} aria-pressed={couleur === c.v} onClick={() => setCouleur(c.v)}>
              <span className="pastille" style={{ background: c.v }} />{c.nom}
            </button>
          ))}
          <button type="button" aria-pressed={epais === 9} onClick={() => setEpais(9)}>Fin</button>
          <button type="button" aria-pressed={epais === 20} onClick={() => setEpais(20)}>Épais</button>
        </div>
        <div className="choix">
          <button type="button" disabled={!elements.length} onClick={() => setElements((x) => x.slice(0, -1))}>↶ Annuler</button>
          <button type="button" disabled={!elements.length} onClick={() => { if (confirm('Tout effacer ?')) setElements([]) }}>Tout effacer</button>
          <label className="croquis-photo">
            {fond ? 'Changer la photo' : 'Dessiner sur une photo'}
            <input type="file" accept="image/*" hidden onChange={(e) => { chargerPhoto(e.target.files?.[0]); e.target.value = '' }} />
          </label>
          {fond && <button type="button" onClick={() => setFond(null)}>Page quadrillée</button>}
        </div>
      </div>
    </div>
  )
}
