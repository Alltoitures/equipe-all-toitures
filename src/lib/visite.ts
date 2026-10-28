/**
 * Questionnaire de la fiche de visite. Modifiable librement : ajouter une question ici
 * suffit pour qu'elle apparaisse dans l'application et dans la fiche PDF.
 */

export interface Visite {
  id: string
  pilotage_id: string | null
  client_nom: string
  telephone: string | null
  email: string | null
  adresse: string | null
  code_postal: string | null
  ville: string | null
  type_travaux: string | null
  provenance: string | null
  date_rdv: string | null
  heure: string | null
  statut: 'a_faire' | 'en_cours' | 'terminee'
  rdv_statut: string | null
  fiche: Fiche
  onedrive_item_id: string | null
  terminee_le: string | null
  traitee_le: string | null
  traitee_note: string | null
  updated_at: string
}

export interface Mesure { ouvrage: string; qte: string; unite: string; remarque: string }
export type Fiche = Record<string, string | string[] | Mesure[] | undefined> & { mesures?: Mesure[] }

export type Question =
  | { id: string; type: 'choix'; label: string; options: string[] }
  | { id: string; type: 'multi'; label: string; options: string[] }
  | { id: string; type: 'texte'; label: string; aide?: string; lignes?: number }

export interface Section { titre: string; questions: Question[] }

export const TYPES_TRAVAUX = ['Couverture', 'Charpente', 'Zinguerie', 'Ossature bois', 'Fenêtres de toit', 'Mixte']

export const SECTIONS: Section[] = [
  {
    titre: 'Demande',
    questions: [
      { id: 'demande', type: 'texte', label: 'Demande du client', aide: 'Ce que le client veut, avec ses mots.', lignes: 3 },
      {
        id: 'travaux', type: 'multi', label: 'Travaux envisagés',
        options: ['Rénovation couverture', 'Réparation / fuite', 'Faîtage', 'Gouttières / descentes', 'Couloir / solin / abergement', 'Fenêtre de toit', 'Charpente', 'Isolation (sarking / combles)', 'Extension / surélévation bois', 'Habillage bandeau / sous-face', 'Démoussage / traitement', 'Cheminée', 'Autre']
      },
      { id: 'delai', type: 'choix', label: 'Délai souhaité', options: ['Urgent', 'Moins d\'1 mois', '1 à 3 mois', 'Plus de 3 mois', 'Pas de date'] },
      { id: 'budget', type: 'texte', label: 'Budget / délai évoqués', aide: 'Ce que le client a dit : enveloppe, date butoir, autres devis en cours…', lignes: 2 }
    ]
  },
  {
    titre: 'Bâtiment et toiture',
    questions: [
      { id: 'batiment', type: 'choix', label: 'Bâtiment', options: ['Maison', 'Immeuble / copropriété', 'Bâtiment pro', 'Annexe / garage', 'Autre'] },
      { id: 'hauteur', type: 'choix', label: 'Hauteur', options: ['Plain-pied', 'R+1', 'R+2 et plus'] },
      { id: 'couverture', type: 'choix', label: 'Couverture existante', options: ['Tuile mécanique', 'Tuile canal', 'Tuile plate', 'Ardoise', 'Bac acier', 'Fibrociment', 'Zinc', 'Étanchéité / membrane', 'Aucune (neuf)'] },
      { id: 'pans', type: 'choix', label: 'Forme', options: ['1 pan', '2 pans', '4 pans', 'Complexe', 'Toit plat'] },
      { id: 'pente', type: 'choix', label: 'Pente', options: ['Faible', 'Moyenne', 'Forte'] }
    ]
  },
  {
    titre: 'État constaté',
    questions: [
      { id: 'etat_couverture', type: 'choix', label: 'Couverture', options: ['Bon', 'Usé', 'Tuiles cassées', 'Fuyard', 'Non visible'] },
      { id: 'etat_charpente', type: 'choix', label: 'Charpente', options: ['Bonne', 'À surveiller', 'À reprendre', 'Non visible'] },
      { id: 'etat_zinguerie', type: 'choix', label: 'Zinguerie', options: ['Bonne', 'À reprendre', 'À créer', 'Sans objet'] },
      { id: 'isolation', type: 'choix', label: 'Isolation', options: ['Aucune', 'Combles', 'Sous rampants', 'Inconnue'] },
      { id: 'ecran', type: 'choix', label: 'Écran sous-toiture', options: ['Oui', 'Non', 'Inconnu'] },
      { id: 'amiante', type: 'choix', label: 'Amiante', options: ['Non', 'Suspecté', 'Oui (diagnostic)'] },
      { id: 'constat', type: 'texte', label: 'Constat sur place', aide: 'Une ligne par point.', lignes: 4 }
    ]
  },
  {
    titre: 'Accès et chantier',
    questions: [
      { id: 'moyens', type: 'multi', label: 'Moyens d\'accès', options: ['Échelle', 'Échafaudage', 'Échafaudage roulant', 'Nacelle', 'Levage / grue', 'Ligne de vie', 'Filets'] },
      { id: 'acces', type: 'choix', label: 'Accès', options: ['Facile', 'Moyen', 'Difficile'] },
      { id: 'stationnement', type: 'choix', label: 'Stationnement', options: ['Sur la propriété', 'Dans la rue', 'Difficile', 'Autorisation voirie'] },
      { id: 'mitoyennete', type: 'choix', label: 'Mitoyenneté / voisin', options: ['Non', 'Oui'] },
      { id: 'urbanisme', type: 'choix', label: 'Urbanisme', options: ['Rien à prévoir', 'Déclaration préalable', 'Permis', 'Secteur ABF', 'À vérifier'] },
      { id: 'protections', type: 'multi', label: 'À prévoir', options: ['Bâchage', 'Protection jardin / sol', 'Benne', 'Évacuation gravats', 'Coupure électrique', 'Présence du client'] },
      { id: 'tiers', type: 'texte', label: 'Intervenants tiers', aide: 'Installateur PV, électricien, syndic… et qui fait quoi.', lignes: 2 }
    ]
  },
  {
    titre: 'À ne pas oublier',
    questions: [
      { id: 'points', type: 'texte', label: 'Points à ne pas oublier', aide: 'Pour le devis et le chantier.', lignes: 4 },
      { id: 'rapport_client', type: 'texte', label: 'Pour le rapport client', aide: 'Ce qu\'il faut mettre en avant auprès du client : urgent, à prévoir, en option…', lignes: 3 }
    ]
  }
]

export const UNITES = ['m²', 'ml', 'u', 'ens.', 'm³', 'h']

/** Boutons rapides de la rubrique Mesures : un appui crée la ligne avec la bonne unité. */
export const MESURES_RAPIDES: { ouvrage: string; unite: string }[] = [
  { ouvrage: 'Couverture', unite: 'm²' },
  { ouvrage: 'Faîtage', unite: 'ml' },
  { ouvrage: 'Arêtier', unite: 'ml' },
  { ouvrage: 'Noue', unite: 'ml' },
  { ouvrage: 'Rive', unite: 'ml' },
  { ouvrage: 'Gouttière', unite: 'ml' },
  { ouvrage: 'Descente', unite: 'ml' },
  { ouvrage: 'Solin / abergement', unite: 'ml' },
  { ouvrage: 'Chéneau', unite: 'ml' },
  { ouvrage: 'Tuiles à remplacer', unite: 'u' },
  { ouvrage: 'Chapeau / sortie de ventilation', unite: 'u' },
  { ouvrage: 'Fenêtre de toit', unite: 'u' },
  { ouvrage: 'Habillage bandeau / sous-face', unite: 'ml' },
  { ouvrage: 'Isolation', unite: 'm²' }
]

export function nbReponses(f: Fiche): number {
  return SECTIONS.flatMap((s) => s.questions).filter((q) => {
    const v = f[q.id]
    return Array.isArray(v) ? v.length > 0 : !!v
  }).length
}

/** Statut du rendez-vous (repris du Pilotage) et sa couleur. */
export const STATUTS_RDV: { nom: string; classe: string }[] = [
  { nom: 'À venir', classe: 'rdv-avenir' },
  { nom: 'Visite en cours', classe: 'rdv-encours' },
  { nom: 'Devis à faire', classe: 'rdv-devis' },
  { nom: 'Devis envoyé', classe: 'rdv-envoye' },
  { nom: 'Accepté', classe: 'rdv-accepte' },
  { nom: 'Refusé', classe: 'rdv-refuse' },
  { nom: 'Sans suite', classe: 'rdv-sanssuite' }
]

export function statutRdv(v: Pick<Visite, 'statut' | 'rdv_statut'>): { nom: string; classe: string } {
  if (v.statut === 'en_cours') return STATUTS_RDV[1]
  const nom = v.rdv_statut ?? (v.statut === 'terminee' ? 'Devis à faire' : 'À venir')
  return STATUTS_RDV.find((s) => s.nom === nom) ?? { nom, classe: 'rdv-sanssuite' }
}
