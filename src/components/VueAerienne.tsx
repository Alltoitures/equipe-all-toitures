import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Aerien, Mesure, Trace } from '../lib/visite'

// Photos aériennes IGN (Géoplateforme, gratuites, sans clé) et géocodage de l'adresse.
const ORTHO = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
const CADASTRE = 'https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=CADASTRALPARCELS.PARCELLAIRE_EXPRESS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}'
const PENTES = [0, 15, 25, 30, 35, 45]
const LIBELLES = {
  longueur: ['Égout', 'Faîtage', 'Rive', 'Noue', 'Arêtier', 'Gouttière', 'Solin'],
  surface: ['Couverture', 'Pan', 'Toit plat', 'Isolation', 'Sous-face']
}

/** Distances et surfaces en mètres (projection locale, précise à l'échelle d'une toiture). */
function enMetres(pts: [number, number][]): [number, number][] {
  const lat0 = (pts[0][0] * Math.PI) / 180
  const R = 6371008.8
  return pts.map(([la, lo]) => [((lo * Math.PI) / 180) * R * Math.cos(lat0), ((la * Math.PI) / 180) * R])
}
function longueur(pts: [number, number][]): number {
  const m = enMetres(pts)
  let s = 0
  for (let i = 1; i < m.length; i++) s += Math.hypot(m[i][0] - m[i - 1][0], m[i][1] - m[i - 1][1])
  return s
}
function surfaceSol(pts: [number, number][]): number {
  const m = enMetres(pts)
  let s = 0
  for (let i = 0; i < m.length; i++) {
    const [x1, y1] = m[i], [x2, y2] = m[(i + 1) % m.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s) / 2
}
const valeurTrace = (type: Trace['type'], pts: [number, number][], pente: number) =>
  type === 'longueur' ? longueur(pts) : surfaceSol(pts) / Math.cos((pente * Math.PI) / 180)
export const fmt = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
const unite = (t: Trace['type']) => (t === 'longueur' ? 'ml' : 'm²')

export default function VueAerienne({ adresse, aerien, changer, versMesures, lecture }: {
  adresse: string
  aerien?: Aerien
  changer: (a: Aerien) => void
  versMesures: (m: Mesure) => void
  lecture?: boolean
}) {
  const boite = useRef<HTMLDivElement>(null)
  const carte = useRef<L.Map | null>(null)
  const calque = useRef<L.LayerGroup | null>(null)
  const [outil, setOutil] = useState<'' | Trace['type']>('')
  const [points, setPoints] = useState<[number, number][]>([])
  const [pente, setPente] = useState(30)
  const [cadastre, setCadastre] = useState(false)
  const [etat, setEtat] = useState('')
  const a: Aerien = aerien ?? { traces: [] }
  const outilRef = useRef(outil)
  outilRef.current = outil

  // Carte : centrée sur l'adresse (géocodée une fois, puis gardée dans la fiche).
  useEffect(() => {
    if (!boite.current || carte.current) return
    const m = L.map(boite.current, { zoomControl: false, attributionControl: true, maxZoom: 21 })
    L.tileLayer(ORTHO, { maxZoom: 21, maxNativeZoom: 19, attribution: '© IGN' }).addTo(m)
    L.control.zoom({ position: 'bottomright' }).addTo(m)
    calque.current = L.layerGroup().addTo(m)
    carte.current = m
    m.on('click', (e: L.LeafletMouseEvent) => {
      if (!outilRef.current) return
      setPoints((p) => [...p, [e.latlng.lat, e.latlng.lng]])
    })
    m.on('moveend', () => {
      const c = m.getCenter()
      changerRef.current({ ...aRef.current, centre: [c.lat, c.lng], zoom: m.getZoom() })
    })
    if (a.centre) m.setView(a.centre, a.zoom ?? 20)
    else {
      m.setView([45.75, 4.75], 12)
      if (adresse) {
        setEtat('Recherche de l\'adresse…')
        fetch(`https://data.geopf.fr/geocodage/search?q=${encodeURIComponent(adresse)}&limit=1`)
          .then((r) => r.json())
          .then((j) => {
            const c = j.features?.[0]?.geometry?.coordinates
            if (c) m.setView([c[1], c[0]], 20)
            setEtat(c ? '' : 'Adresse introuvable : déplacez la carte jusqu\'au toit.')
          })
          .catch(() => setEtat('Pas de réseau : la vue aérienne a besoin d\'une connexion.'))
      }
    }
    return () => { m.remove(); carte.current = null }
  }, [])
  const aRef = useRef(a)
  aRef.current = a
  const changerRef = useRef(changer)
  changerRef.current = changer

  // Couche cadastre (limites de parcelles) à la demande.
  const cadRef = useRef<L.TileLayer | null>(null)
  useEffect(() => {
    const m = carte.current
    if (!m) return
    if (cadastre && !cadRef.current) cadRef.current = L.tileLayer(CADASTRE, { maxZoom: 21, maxNativeZoom: 19, opacity: 0.8 }).addTo(m)
    if (!cadastre && cadRef.current) { cadRef.current.remove(); cadRef.current = null }
  }, [cadastre])

  // Dessin des relevés enregistrés et du relevé en cours.
  useEffect(() => {
    const g = calque.current
    if (!g) return
    g.clearLayers()
    for (const t of a.traces) {
      const style = { color: t.type === 'longueur' ? '#ffb020' : '#01a9e1', weight: 3, fillOpacity: 0.18 }
      const forme = t.type === 'longueur' ? L.polyline(t.points, style) : L.polygon(t.points, style)
      forme.bindTooltip(`${t.libelle} · ${fmt(t.valeur)} ${unite(t.type)}`, { permanent: true, direction: 'center', className: 'etiquette-mesure' }).addTo(g)
    }
    if (points.length) {
      const style = { color: '#ffffff', weight: 2, dashArray: '6 6', fillOpacity: 0.1 }
      ;(outil === 'surface' && points.length > 2 ? L.polygon(points, style) : L.polyline(points, style)).addTo(g)
      points.forEach((p) => L.circleMarker(p, { radius: 6, color: '#fff', weight: 2, fillColor: '#0b1921', fillOpacity: 1 }).addTo(g))
    }
  }, [a.traces, points, outil])

  const enCours = outil && points.length >= (outil === 'longueur' ? 2 : 3) ? valeurTrace(outil, points, pente) : null

  function valider(libelle: string) {
    if (!outil || enCours == null) return
    const t: Trace = { id: crypto.randomUUID(), type: outil, points, libelle, pente: outil === 'surface' ? pente : 0, valeur: Math.round(enCours * 10) / 10 }
    changer({ ...a, traces: [...a.traces, t] })
    setPoints([])
    setOutil('')
  }

  return (
    <div className="aerien">
      <div className="aerien-carte">
        <div ref={boite} className="aerien-map" />
        {etat && <div className="aerien-etat">{etat}</div>}
        <button type="button" className={`aerien-cadastre${cadastre ? ' actif' : ''}`} onClick={() => setCadastre(!cadastre)}>Cadastre</button>
        {outil && <div className="aerien-consigne">{outil === 'longueur' ? 'Touchez les points de la ligne' : 'Touchez les angles du pan'}{enCours != null && <strong> · {fmt(enCours)} {unite(outil)}</strong>}</div>}
      </div>

      {!lecture && !outil && (
        <div className="deux">
          <button type="button" className="btn" onClick={() => { setPoints([]); setOutil('longueur') }}>📏 Mesurer une longueur</button>
          <button type="button" className="btn" onClick={() => { setPoints([]); setOutil('surface') }}>⬛ Mesurer une surface</button>
        </div>
      )}

      {outil && (
        <section className="carte">
          {outil === 'surface' && (
            <>
              <span className="q-label">Pente du pan <small>(la surface vue du ciel est corrigée)</small></span>
              <div className="choix">{PENTES.map((p) => <button type="button" key={p} aria-pressed={pente === p} onClick={() => setPente(p)}>{p}°</button>)}</div>
            </>
          )}
          <span className="q-label">{enCours == null ? `Placez au moins ${outil === 'longueur' ? 2 : 3} points` : `Enregistrer ${fmt(enCours)} ${unite(outil)} comme :`}</span>
          <div className="choix">
            {LIBELLES[outil].map((l) => <button type="button" key={l} disabled={enCours == null} onClick={() => valider(l)}>{l}</button>)}
          </div>
          <div className="boutons">
            <button type="button" className="btn" disabled={!points.length} onClick={() => setPoints(points.slice(0, -1))}>↶ Point</button>
            <button type="button" className="btn ghost" onClick={() => { setPoints([]); setOutil('') }}>Annuler</button>
          </div>
        </section>
      )}

      {a.traces.length > 0 && (
        <section className="carte">
          <h2>Relevés</h2>
          <ul className="releves">
            {a.traces.map((t) => (
              <li key={t.id}>
                <span className={`pastille-type ${t.type}`} />
                <span className="lib"><strong>{t.libelle}</strong>{t.type === 'surface' && t.pente ? <small> · pente {t.pente}°</small> : null}</span>
                <strong className="val">{fmt(t.valeur)} {unite(t.type)}</strong>
                {!lecture && (
                  <>
                    <button type="button" className="btn mini" onClick={() => versMesures({ ouvrage: t.libelle, qte: fmt(t.valeur), unite: unite(t.type), remarque: 'Relevé vue aérienne' })}>→ Mesures</button>
                    <button type="button" className="btn ghost mini" aria-label="Supprimer" onClick={() => changer({ ...a, traces: a.traces.filter((x) => x.id !== t.id) })}>×</button>
                  </>
                )}
              </li>
            ))}
          </ul>
          <p className="aide">Mesures indicatives (photo IGN) : à confirmer sur place pour le devis.</p>
        </section>
      )}
    </div>
  )
}
