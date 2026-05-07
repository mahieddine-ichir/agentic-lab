import { LlmAgent, BaseLlm } from '@google/adk';
import {
  checkStudentEligibility,
  checkFamilleNombreuseEligibility,
  checkJeuneParentEligibility,
} from '../tools/ruleTools.js';

export function createEligibilityAgent(model?: BaseLlm) {
  return new LlmAgent({
    name: 'eligibility_checker',
    model,
    description:
      "Vérifie l'éligibilité du demandeur aux trois catégories de communauté (etudiant, famille_nombreuse, jeune_parent) à partir des documents validés.",
    instruction: `Tu es un expert en règles d'éligibilité aux communautés.

À partir du rapport de traitement des documents produit précédemment, tu dois vérifier l'éligibilité pour les 3 catégories en appelant les 3 outils de vérification.

Règles d'éligibilité:

**1. Etudiant** — appelle check_student_eligibility
- hasValidIdentityDocument: true si un passeport ou carte d'identité valide et non expiré est présent
- studentDocumentType: 'carte_etudiant' ou 'certificat_scolarite' ou 'none'
- isStudentDocumentValid: true si le document étudiant est conforme (pas d'erreurs de conformité)
- academicYear: année académique extraite du document
- institution: établissement extrait

**2. Famille nombreuse** — appelle check_famille_nombreuse_eligibility
- hasValidIdentityDocument: true si document d'identité valide présent
- familyDocumentType: 'attestation_caf' ou 'livret_famille' ou 'none'
- isDocumentValid: true si le document familial est conforme
- numberOfChildren: nombre d'enfants extrait du document

**3. Jeune parent** — appelle check_jeune_parent_eligibility
- hasValidIdentityDocument: true si document d'identité valide présent
- childDocumentType: 'livret_famille' ou 'acte_naissance' ou 'none'
- isDocumentValid: true si le document est conforme
- youngestChildDateOfBirth: date de naissance du plus jeune enfant (YYYY-MM-DD) — utilise la plus récente trouvée dans les documents

Appelle les 3 outils et présente les résultats de chaque vérification en indiquant pour chaque catégorie:
- Si éligible: les preuves retenues
- Si non éligible: les critères manquants`,
    tools: [
      checkStudentEligibility,
      checkFamilleNombreuseEligibility,
      checkJeuneParentEligibility,
    ],
  });
}
