// Affiche un PDF page par page en images (fonctionne sur iPhone et Android, sans quitter l'appli).
// pdf.js n'est chargé qu'au moment d'ouvrir un PV.
export async function pagesPdf(octets: Uint8Array, largeurPx: number): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const { default: worker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: octets }).promise
  const pages: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const base = page.getViewport({ scale: 1 })
    const vue = page.getViewport({ scale: Math.min(3, (largeurPx * 2) / base.width) })
    const cv = document.createElement('canvas')
    cv.width = vue.width
    cv.height = vue.height
    await page.render({ canvas: cv, canvasContext: cv.getContext('2d')!, viewport: vue }).promise
    pages.push(cv.toDataURL('image/jpeg', 0.85))
  }
  await doc.destroy()
  return pages
}
