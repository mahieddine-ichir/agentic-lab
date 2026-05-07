export type DocumentType =
  | 'passport'
  | 'carte_identite'
  | 'attestation_caf'
  | 'livret_famille'
  | 'carte_etudiant'
  | 'certificat_scolarite'
  | 'acte_naissance'
  | 'unknown';

export type CommunityCategory = 'etudiant' | 'famille_nombreuse' | 'jeune_parent';

export interface ConformityResult {
  documentType: DocumentType;
  isConform: boolean;
  errors: string[];
  warnings: string[];
}

export interface EligibilityResult {
  category: CommunityCategory;
  isEligible: boolean;
  requirements: string[];
  missingRequirements: string[];
  evidence: string[];
}

export interface AdhesionDecision {
  applicantName: string;
  isAccepted: boolean;
  acceptedCategories: string[];
  rejectedCategories: Array<{ category: string; reason: string }>;
  summary: string;
  timestamp: string;
}
