import { useNavigate } from 'react-router-dom'
import { IcoRetour } from '../components/Icones'

const SECTIONS: [string, string[]][] = [
  ['Se connecter', ['Numéro de portable + votre code à 6 chiffres.', 'Code oublié : demandez un nouveau code d\'invitation à Aurélien, puis « Première connexion ou code oublié ».', 'Après 5 codes faux, l\'accès est bloqué 15 minutes.']],
  ['Le matin', ['Ouvrez le chantier du jour (onglet Chantiers).', 'Faites le point sécurité en arrivant (1 minute).', 'Regardez la météo du jour et du lendemain sur la fiche.', 'Photos « Avant » avant de commencer.']],
  ['Pendant le chantier', ['Cochez les travaux au fur et à mesure (onglet Travaux).', 'Photos « Pendant » des étapes importantes (support, écran, zinguerie…).', 'Un problème, une surprise, des travaux en plus ? Bouton « Imprévu » : Aurélien est prévenu. Rien de supplémentaire sans son accord.', 'Il manque du matériel ? Onglet Matériel › Demander du matériel.', 'Livraison reçue ? Photo du bon de livraison (onglet Matériel).']],
  ['En fin de chantier', ['Photos « Après » et chantier nettoyé.', 'Faites signer le client sur le téléphone (onglet Travaux › Réception).', 'Bouton « Chantier terminé » : le rapport et le mail au client sont préparés automatiquement.']],
  ['Le soir', ['Saisissez vos heures : départ et retour au dépôt, pause, chantier(s).', 'Le panier repas est calculé tout seul.', 'Un rappel arrive à 17h30 si ce n\'est pas fait.']],
  ['Le vendredi', ['Nettoyage et contrôle de votre camion : touchez le bandeau orange « Camions » sur l\'accueil (ou Compte › Camions : contrôles). Kilométrage + 7 points, « Tout est fait » coche tout d\'un coup.']],
  ['Une fois par mois', ['Niveaux du camion (huile, liquide de refroidissement, lave-glace, AdBlue), moteur froid : pour chacun, « Niveau OK », « Appoint fait » ou « Manque de produit ». Le rappel apparaît à partir du 1er vendredi du mois.']],
  ['Congés', ['Onglet Heures › Demander un congé. Vous recevez la réponse par notification.']],
  ['Bon à savoir', ['Les photos ne vont jamais dans votre galerie : elles partent directement dans le dossier OneDrive du chantier.', 'Sans réseau, tout est gardé dans le téléphone et envoyé au retour du réseau.', 'Aucune géolocalisation, aucun accès à vos contacts ni à votre galerie.']]
]

export default function Aide() {
  const nav = useNavigate()
  return (
    <div className="page">
      <button className="retour" onClick={() => nav(-1)}><IcoRetour /> Retour</button>
      <h1>Mode d'emploi</h1>
      {SECTIONS.map(([t, l]) => (
        <section className="carte" key={t}>
          <h2>{t}</h2>
          <ul className="puces">{l.map((x) => <li key={x}>{x}</li>)}</ul>
        </section>
      ))}
      <p className="aide">Une question : Aurélien, 06 88 11 19 91.</p>
    </div>
  )
}
