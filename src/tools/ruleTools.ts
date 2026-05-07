import type { ToolDef } from '../pipeline/agent.js';

export const checkStudentEligibility: ToolDef = {
  name: 'check_student_eligibility',
  description:
    'Checks if submitted documents qualify the applicant for the "Etudiant" community. Requires a valid identity document and a valid student card or current-year enrollment certificate.',
  inputSchema: {
    type: 'object',
    properties: {
      hasValidIdentityDocument: {
        type: 'boolean',
        description:
          'True if a valid, non-expired passport or carte identite was submitted',
      },
      studentDocumentType: {
        type: 'string',
        enum: ['carte_etudiant', 'certificat_scolarite', 'none'],
        description: 'Type of student proof document submitted',
      },
      isStudentDocumentValid: {
        type: 'boolean',
        description: 'True if the student document passed conformity validation',
      },
      academicYear: {
        type: 'string',
        description: 'Academic year from the student document',
      },
      institution: { type: 'string', description: 'Educational institution' },
    },
    required: ['hasValidIdentityDocument', 'studentDocumentType', 'isStudentDocumentValid'],
  },
  handler(input) {
    const { hasValidIdentityDocument, studentDocumentType, isStudentDocumentValid, academicYear, institution } =
      input as {
        hasValidIdentityDocument: boolean;
        studentDocumentType: 'carte_etudiant' | 'certificat_scolarite' | 'none';
        isStudentDocumentValid: boolean;
        academicYear?: string;
        institution?: string;
      };

    const requirements = [
      "Document d'identité valide (passeport ou carte d'identité nationale)",
      "Carte étudiante valide OU certificat de scolarité de l'année académique en cours",
    ];
    const missingRequirements: string[] = [];
    const evidence: string[] = [];

    if (!hasValidIdentityDocument) {
      missingRequirements.push("Document d'identité valide non fourni");
    } else {
      evidence.push("Document d'identité valide");
    }

    if (studentDocumentType === 'none') {
      missingRequirements.push(
        'Aucune preuve de statut étudiant (carte étudiante ou certificat de scolarité requis)'
      );
    } else if (!isStudentDocumentValid) {
      missingRequirements.push('Document étudiant invalide ou expiré');
    } else {
      const label =
        studentDocumentType === 'carte_etudiant' ? 'Carte étudiante' : 'Certificat de scolarité';
      const yearPart = academicYear ? ` (${academicYear})` : '';
      const institutionPart = institution ? ` — ${institution}` : '';
      evidence.push(`${label}${yearPart}${institutionPart}`);
    }

    return {
      category: 'etudiant',
      isEligible: missingRequirements.length === 0,
      requirements,
      missingRequirements,
      evidence,
    };
  },
};

export const checkFamilleNombreuseEligibility: ToolDef = {
  name: 'check_famille_nombreuse_eligibility',
  description:
    'Checks if submitted documents qualify the applicant for the "Famille nombreuse" community. Requires a valid identity document and proof of 3 or more children (CAF attestation or livret de famille).',
  inputSchema: {
    type: 'object',
    properties: {
      hasValidIdentityDocument: { type: 'boolean' },
      familyDocumentType: {
        type: 'string',
        enum: ['attestation_caf', 'livret_famille', 'none'],
        description: 'Type of family document submitted',
      },
      isDocumentValid: {
        type: 'boolean',
        description: 'True if the family document passed conformity validation',
      },
      numberOfChildren: {
        type: 'number',
        description: 'Number of children from the family document',
      },
    },
    required: ['hasValidIdentityDocument', 'familyDocumentType', 'isDocumentValid'],
  },
  handler(input) {
    const { hasValidIdentityDocument, familyDocumentType, isDocumentValid, numberOfChildren } =
      input as {
        hasValidIdentityDocument: boolean;
        familyDocumentType: 'attestation_caf' | 'livret_famille' | 'none';
        isDocumentValid: boolean;
        numberOfChildren?: number;
      };

    const requirements = [
      "Document d'identité valide",
      'Attestation CAF récente (moins de 3 mois) ou livret de famille avec 3 enfants minimum',
    ];
    const missingRequirements: string[] = [];
    const evidence: string[] = [];

    if (!hasValidIdentityDocument) {
      missingRequirements.push("Document d'identité valide non fourni");
    } else {
      evidence.push("Document d'identité valide");
    }

    if (familyDocumentType === 'none') {
      missingRequirements.push(
        'Aucun document familial (attestation CAF ou livret de famille requis)'
      );
    } else if (!isDocumentValid) {
      missingRequirements.push('Document familial invalide');
    } else if (numberOfChildren === undefined) {
      missingRequirements.push("Nombre d'enfants non déterminable");
    } else if (numberOfChildren < 3) {
      missingRequirements.push(
        `Famille nombreuse requiert 3 enfants minimum (${numberOfChildren} trouvé${numberOfChildren > 1 ? 's' : ''})`
      );
    } else {
      const sourceLabel =
        familyDocumentType === 'attestation_caf' ? 'attestation CAF' : 'livret de famille';
      evidence.push(`${numberOfChildren} enfants déclarés (${sourceLabel})`);
    }

    return {
      category: 'famille_nombreuse',
      isEligible: missingRequirements.length === 0,
      requirements,
      missingRequirements,
      evidence,
    };
  },
};

export const checkJeuneParentEligibility: ToolDef = {
  name: 'check_jeune_parent_eligibility',
  description:
    'Checks if submitted documents qualify the applicant for the "Jeune parent" community. Requires a valid identity document and proof of a child born within the last 12 months.',
  inputSchema: {
    type: 'object',
    properties: {
      hasValidIdentityDocument: { type: 'boolean' },
      childDocumentType: {
        type: 'string',
        enum: ['livret_famille', 'acte_naissance', 'none'],
        description: "Type of document proving a child's recent birth",
      },
      isDocumentValid: { type: 'boolean' },
      youngestChildDateOfBirth: {
        type: 'string',
        description: "Youngest child's date of birth in YYYY-MM-DD format",
      },
    },
    required: ['hasValidIdentityDocument', 'childDocumentType', 'isDocumentValid'],
  },
  handler(input) {
    const { hasValidIdentityDocument, childDocumentType, isDocumentValid, youngestChildDateOfBirth } =
      input as {
        hasValidIdentityDocument: boolean;
        childDocumentType: 'livret_famille' | 'acte_naissance' | 'none';
        isDocumentValid: boolean;
        youngestChildDateOfBirth?: string;
      };

    const requirements = [
      "Document d'identité valide",
      "Livret de famille ou acte de naissance d'un enfant né dans les 12 derniers mois",
    ];
    const missingRequirements: string[] = [];
    const evidence: string[] = [];

    if (!hasValidIdentityDocument) {
      missingRequirements.push("Document d'identité valide non fourni");
    } else {
      evidence.push("Document d'identité valide");
    }

    if (childDocumentType === 'none') {
      missingRequirements.push("Aucun document prouvant la naissance récente d'un enfant");
    } else if (!isDocumentValid) {
      missingRequirements.push('Document de naissance invalide');
    } else if (!youngestChildDateOfBirth) {
      missingRequirements.push("Date de naissance de l'enfant non déterminée");
    } else {
      const birthDate = new Date(youngestChildDateOfBirth);
      const twelveMonthsAgo = new Date();
      twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
      const ageInMonths = Math.floor(
        (Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
      );

      if (birthDate < twelveMonthsAgo) {
        missingRequirements.push(
          `L'enfant le plus jeune a ${ageInMonths} mois — la limite est de 12 mois`
        );
      } else {
        const sourceLabel =
          childDocumentType === 'acte_naissance' ? 'acte de naissance' : 'livret de famille';
        evidence.push(
          `Enfant né le ${youngestChildDateOfBirth} (${ageInMonths} mois) — ${sourceLabel}`
        );
      }
    }

    return {
      category: 'jeune_parent',
      isEligible: missingRequirements.length === 0,
      requirements,
      missingRequirements,
      evidence,
    };
  },
};

export const makeAdhesionDecision: ToolDef = {
  name: 'make_adhesion_decision',
  description:
    'Makes the final community adhesion decision from all three eligibility check results. Returns the formal accept/reject decision with full details.',
  inputSchema: {
    type: 'object',
    properties: {
      applicantName: { type: 'string', description: 'Full name of the applicant' },
      etudiantResult: {
        type: 'object',
        properties: {
          isEligible: { type: 'boolean' },
          missingRequirements: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'array', items: { type: 'string' } },
        },
        required: ['isEligible', 'missingRequirements', 'evidence'],
      },
      familleNombreuseResult: {
        type: 'object',
        properties: {
          isEligible: { type: 'boolean' },
          missingRequirements: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'array', items: { type: 'string' } },
        },
        required: ['isEligible', 'missingRequirements', 'evidence'],
      },
      jeuneParentResult: {
        type: 'object',
        properties: {
          isEligible: { type: 'boolean' },
          missingRequirements: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'array', items: { type: 'string' } },
        },
        required: ['isEligible', 'missingRequirements', 'evidence'],
      },
    },
    required: ['applicantName', 'etudiantResult', 'familleNombreuseResult', 'jeuneParentResult'],
  },
  handler(input) {
    const { applicantName, etudiantResult, familleNombreuseResult, jeuneParentResult } = input as {
      applicantName: string;
      etudiantResult: { isEligible: boolean; missingRequirements: string[]; evidence: string[] };
      familleNombreuseResult: { isEligible: boolean; missingRequirements: string[]; evidence: string[] };
      jeuneParentResult: { isEligible: boolean; missingRequirements: string[]; evidence: string[] };
    };

    const acceptedCategories: string[] = [];
    const rejectedCategories: Array<{ category: string; reason: string }> = [];

    const checks = [
      { name: 'Etudiant', result: etudiantResult },
      { name: 'Famille nombreuse', result: familleNombreuseResult },
      { name: 'Jeune parent', result: jeuneParentResult },
    ];

    for (const { name, result } of checks) {
      if (result.isEligible) {
        acceptedCategories.push(name);
      } else {
        rejectedCategories.push({
          category: name,
          reason: result.missingRequirements.join('; ') || 'Critères non remplis',
        });
      }
    }

    const isAccepted = acceptedCategories.length > 0;
    const summary = isAccepted
      ? `DEMANDE ACCEPTÉE — ${applicantName} est éligible pour: ${acceptedCategories.join(', ')}.`
      : `DEMANDE REFUSÉE — ${applicantName} ne remplit les critères d'aucune communauté disponible.`;

    return {
      applicantName,
      isAccepted,
      acceptedCategories,
      rejectedCategories,
      summary,
      timestamp: new Date().toISOString(),
    };
  },
};
