import { useEffect, useState } from 'react'

/** Météo du chantier (Open-Meteo, sans clé) : aujourd'hui, demain, après-demain. */
interface Jour { date: string; code: number; pluie: number; proba: number; rafales: number; tmax: number; tmin: number }

const LIBELLE: [number[], string, string][] = [
  [[0], '☀️', 'Ensoleillé'], [[1, 2], '🌤️', 'Éclaircies'], [[3], '☁️', 'Couvert'], [[45, 48], '🌫️', 'Brouillard'],
  [[51, 53, 55, 56, 57], '🌦️', 'Bruine'], [[61, 63, 65, 66, 67, 80, 81, 82], '🌧️', 'Pluie'], [[71, 73, 75, 77, 85, 86], '❄️', 'Neige'], [[95, 96, 99], '⛈️', 'Orage']
]
const decrire = (c: number) => LIBELLE.find(([l]) => l.includes(c)) ?? [[], '🌡️', '—']

async function charger(ville: string, cp?: string | null): Promise<Jour[]> {
  const cle = `at-meteo-${ville}-${new Date().toISOString().slice(0, 13)}`
  try {
    const c = localStorage.getItem(cle)
    if (c) return JSON.parse(c)
  } catch { /* rien */ }
  const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(ville)}&count=5&language=fr&countryCode=FR`).then((r) => r.json())
  const lieu = (g.results ?? []).find((x: { postcodes?: string[] }) => cp && x.postcodes?.includes(cp)) ?? g.results?.[0]
  if (!lieu) throw new Error('Ville introuvable')
  const f = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lieu.latitude}&longitude=${lieu.longitude}&daily=weather_code,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,temperature_2m_max,temperature_2m_min&timezone=Europe%2FParis&forecast_days=3`).then((r) => r.json())
  const d = f.daily
  const jours: Jour[] = d.time.map((t: string, i: number) => ({
    date: t, code: d.weather_code[i], pluie: d.precipitation_sum[i], proba: d.precipitation_probability_max[i] ?? 0,
    rafales: Math.round(d.wind_gusts_10m_max[i]), tmax: Math.round(d.temperature_2m_max[i]), tmin: Math.round(d.temperature_2m_min[i])
  }))
  try { localStorage.setItem(cle, JSON.stringify(jours)) } catch { /* rien */ }
  return jours
}

export default function Meteo({ ville, cp }: { ville: string | null; cp?: string | null }) {
  const [jours, setJours] = useState<Jour[] | null>(null)
  const [erreur, setErreur] = useState(false)
  useEffect(() => {
    if (!ville) return
    charger(ville, cp).then(setJours).catch(() => setErreur(true))
  }, [ville, cp])
  if (!ville || erreur) return null
  if (!jours) return <section className="carte meteo"><h2>Météo</h2><p className="sous">Chargement…</p></section>

  const noms = ["Aujourd'hui", 'Demain', new Date(jours[2]?.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long' })]
  const alerte = jours.slice(0, 2).find((j) => j.rafales >= 60 || j.pluie >= 5 || [95, 96, 99, 71, 73, 75].includes(j.code))
  return (
    <section className="carte meteo">
      <h2>Météo · {ville}</h2>
      <div className="meteo-jours">
        {jours.map((j, i) => {
          const [, ico, lib] = decrire(j.code)
          const risque = j.rafales >= 60 || j.pluie >= 5
          return (
            <div key={j.date} className={risque ? 'risque' : ''}>
              <small>{noms[i]}</small>
              <span className="ico">{ico}</span>
              <strong>{j.tmin}° / {j.tmax}°</strong>
              <span>{lib}</span>
              <span>💧 {j.pluie.toFixed(1).replace('.', ',')} mm{j.proba ? ` · ${j.proba} %` : ''}</span>
              <span>💨 rafales {j.rafales} km/h</span>
            </div>
          )
        })}
      </div>
      {alerte && (
        <p className="alerte-meteo">
          ⚠️ {alerte.date === jours[0].date ? "Aujourd'hui" : 'Demain'} : {alerte.rafales >= 60 ? `rafales à ${alerte.rafales} km/h` : ''}{alerte.rafales >= 60 && alerte.pluie >= 5 ? ' et ' : ''}{alerte.pluie >= 5 ? `${alerte.pluie.toFixed(0)} mm de pluie` : ''}{alerte.rafales < 60 && alerte.pluie < 5 ? 'orage ou neige' : ''}. Prévoir bâches, sécuriser le chantier, voir avec Aurélien pour un report.
        </p>
      )}
    </section>
  )
}
