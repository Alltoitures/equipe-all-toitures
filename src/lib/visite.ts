/**
 * Questionnaire de la fiche de visite. Modifiable librement : ajouter une question ici
 * suffit pour qu'elle apparaisse dans l'application et dans la fiche PDF.
 */

export interface Visite {
  id: string
  pilotage_id: string | null
  civilite: string | null
  client_nom: string
  contact: string | null
  nom_affiche: string | null
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
  devis_ref: string | null
  devis_montant: number | null
  devis_envoye_le: string | null
  relance_prevue: string | null
  accepte_le: string | null
  motif_perte: string | null
  devis_maj_le: string | null
}

/** Civilité : les trois premières sont des particuliers, les autres des professionnels (raison sociale + interlocuteur). */
export const CIVILITES = ['M.', 'Mme', 'M. et Mme', 'Entreprise', 'Syndic / Copro', 'Collectivité'] as const
export const estPro = (c: string | null | undefined) => !!c && !['M.', 'Mme', 'M. et Mme'].includes(c)

/** Nom tel qu'on l'affiche : « Mme COMTE », « FONCIA (M. Durand) ». */
export function nomClient(v: Pick<Visite, 'civilite' | 'client_nom' | 'contact'>): string {
  if (v.civilite && !estPro(v.civilite)) return `${v.civilite} ${v.client_nom}`
  return v.contact ? `${v.client_nom} (${v.contact})` : v.client_nom
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
      { id: 'delai', type: 'choix', label: 'Délai souhaité', options: ['Urgent', 'Moins d\'1 mois', '1 à 3 mois', 'Plus de 3 mois', 'Pas de date'] }
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
      { id: 'protections', type: 'multi', label: 'À prévoir', options: ['Bâchage', 'Protection jardin / sol', 'Benne', 'Évacuation gravats', 'Coupure électrique', 'Présence du client'] }
    ]
  },
  {
    titre: 'À ne pas oublier',
    questions: [
      { id: 'points', type: 'texte', label: 'Points à ne pas oublier', aide: 'Pour le devis et le chantier.', lignes: 4 }
    ]
  }
]

export const UNITES = ['m²', 'ml', 'u', 'ens.', 'm³', 'h']

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
