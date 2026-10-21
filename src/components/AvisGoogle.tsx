import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { dateCourte } from '../lib/format'

export const LIEN_AVIS = 'https://g.page/r/CRiDXpvYNigzEAE/review'

const messageSms = () =>
  `Bonjour, merci pour votre confiance. Si vous avez un instant, votre avis sur notre intervention nous aiderait beaucoup : ${LIEN_AVIS} — L'équipe ALL TOITURES`

type Demande = { id: string; canaux: string[]; demande_le: string; relance_le: string | null; recu: boolean }

/** Demande d'avis Google en fin de chantier : QR code à scanner sur place, ou SMS prérempli. */
export default function AvisGoogle({ chantierId, telephone }: { chantierId: string; telephone: string | null }) {
  const { membre } = useAuth()
  const [d, setD] = useState<Demande | null | undefined>(undefined)
  const [qr, setQr] = useState('')
  const [ouvert, setOuvert] = useState(false)

  useEffect(() => {
    supabase.from('avis_demandes').select('id, canaux, demande_le, relance_le, recu').eq('chantier_id', chantierId).maybeSingle().then(({ data }) => setD(data as Demande | null))
  }, [chantierId])
  useEffect(() => {
    QRCode.toDataURL(LIEN_AVIS, { width: 560, margin: 1, errorCorrectionLevel: 'M' }).then(setQr)
  }, [])

  async function noter(canal: string, relance = false) {
    if (d) {
      const maj = { canaux: Array.from(new Set([...d.canaux, canal])), ...(relance ? { relance_le: new Date().toISOString() } : {}) }
      const { data } = await supabase.from('avis_demandes').update(maj).eq('id', d.id).select('id, canaux, demande_le, relance_le, recu').single()
      if (data) setD(data as Demande)
    } else {
      const { data } = await supabase.from('avis_demandes').insert({ chantier_id: chantierId, canaux: [canal], demande_par: membre?.id }).select('id, canaux, demande_le, relance_le, recu').single()
      if (data) setD(data as Demande)
    }
  }

  const sms = (relance = false) => {
    noter('sms', relance)
    const sep = /iPhone|iPad|iPod/.test(navigator.userAgent) ? '&' : '?'
    location.href = `sms:${telephone ?? ''}${sep}body=${encodeURIComponent(messageSms())}`
  }

  async function recu() {
    if (!d) return
    const { data } = await supabase.from('avis_demandes').update({ recu: true }).eq('id', d.id).select('id, canaux, demande_le, relance_le, recu').single()
    if (data) setD(data as Demande)
  }

  if (d === undefined) return null
  return (
    <section className="carte avis-carte">
      <h2>Avis Google</h2>
      {d?.recu ? (
        <p className="sous">Avis reçu ✓ Merci !</p>
      ) : (
        <>
          {d && <p className="sous">Demandé le {dateCourte(d.demande_le.slice(0, 10))}{d.relance_le ? ` · relancé le ${dateCourte(d.relance_le.slice(0, 10))}` : ''}</p>}
          {!d && <p className="sous">Le bon moment, c'est maintenant : montrez le QR code au client, il laisse son avis en 30 secondes.</p>}
          <div className="boutons">
            <button className="btn pri" onClick={() => { setOuvert(true); noter('qr') }}>Montrer le QR code</button>
            <button className="btn" onClick={() => sms(!!d)}>{d ? 'Relancer par SMS' : 'Envoyer par SMS'}</button>
          </div>
          {d && <button type="button" className="lien" onClick={recu}>L'avis a été laissé</button>}
        </>
      )}

      {ouvert && (
        <div className="fond-modal avis-modal" onClick={() => setOuvert(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Votre avis compte</h2>
            <p className="sous">Scannez avec l'appareil photo de votre téléphone pour noter ALL TOITURES sur Google.</p>
            {qr && <img className="qr-avis" src={qr} alt="QR code vers la page d'avis Google d'ALL TOITURES" />}
            <p className="aide">Merci pour votre confiance.</p>
            <button className="btn large" onClick={() => setOuvert(false)}>Fermer</button>
          </div>
        </div>
      )}
    </section>
  )
}
