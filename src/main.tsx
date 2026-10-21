import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'

registerSW({ immediate: true })

// Masque le badge « Powered by Netlify » ajouté par l'hébergeur (il gêne la barre d'onglets).
function masquerBadge(n: Node) {
  if (!(n instanceof HTMLElement) || n.id === 'root') return
  const texte = (n.textContent ?? '') + ((n.shadowRoot?.textContent) ?? '')
  if (/netlify/i.test(n.tagName) || /netlify/i.test(n.id) || /powered by netlify/i.test(texte)) n.style.setProperty('display', 'none', 'important')
}
const surveiller = () => {
  Array.from(document.body.children).forEach(masquerBadge)
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach(masquerBadge))).observe(document.body, { childList: true })
  // Le contenu d'un badge en shadow DOM peut arriver après son insertion.
  let n = 0
  const t = setInterval(() => { Array.from(document.body.children).forEach(masquerBadge); if (++n > 20) clearInterval(t) }, 500)
}
if (document.body) surveiller()
else document.addEventListener('DOMContentLoaded', surveiller)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
