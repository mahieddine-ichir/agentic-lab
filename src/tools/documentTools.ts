import { FunctionTool } from '@google/adk';
import { z } from 'zod';

export const validateDocumentConformity = new FunctionTool({
  name: 'validate_document_conformity',
  description:
    'Validates a French administrative document. Checks required fields are present and the document is not expired or outdated. Returns conformity status with errors and warnings.',
  parameters: z.object({
    documentType: z
      .enum([
        'passport',
        'carte_identite',
        'attestation_caf',
        'livret_famille',
        'carte_etudiant',
        'certificat_scolarite',
        'acte_naissance',
      ])
      .describe('Type of document to validate'),
    lastName: z.string().optional().describe('Last name on the document'),
    firstName: z.string().optional().describe('First name on the document'),
    dateOfBirth: z
      .string()
      .optional()
      .describe('Date of birth in YYYY-MM-DD format'),
    documentNumber: z
      .string()
      .optional()
      .describe('Document number or reference'),
    expirationDate: z
      .string()
      .optional()
      .describe('Expiration date in YYYY-MM-DD format'),
    attestationDate: z
      .string()
      .optional()
      .describe('Attestation issue date for CAF documents (YYYY-MM-DD)'),
    numberOfChildren: z
      .number()
      .optional()
      .describe('Number of children declared (CAF or livret de famille)'),
    institution: z
      .string()
      .optional()
      .describe('Educational institution name (student documents)'),
    academicYear: z
      .string()
      .optional()
      .describe('Academic year string e.g. "2024-2025"'),
  }),
  execute: ({
    documentType,
    lastName,
    firstName,
    dateOfBirth,
    documentNumber,
    expirationDate,
    attestationDate,
    numberOfChildren,
    institution,
    academicYear,
  }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const today = new Date();

    const checkExpiry = (dateStr: string | undefined, label: string) => {
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (date < today) {
        errors.push(`${label} expiré(e) le ${dateStr}`);
      } else {
        const daysLeft =
          (date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
        if (daysLeft < 90) {
          warnings.push(`${label} expire bientôt (${dateStr})`);
        }
      }
    };

    switch (documentType) {
      case 'passport':
      case 'carte_identite': {
        const label =
          documentType === 'passport' ? 'Passeport' : "Carte d'identité";
        if (!lastName) errors.push(`${label}: nom de famille manquant`);
        if (!firstName) errors.push(`${label}: prénom manquant`);
        if (!dateOfBirth) errors.push(`${label}: date de naissance manquante`);
        if (!documentNumber)
          errors.push(`${label}: numéro de document manquant`);
        checkExpiry(expirationDate, label);
        break;
      }

      case 'attestation_caf':
        if (!lastName)
          errors.push("Attestation CAF: nom de l'allocataire manquant");
        if (!firstName)
          errors.push("Attestation CAF: prénom de l'allocataire manquant");
        if (numberOfChildren === undefined)
          errors.push("Attestation CAF: nombre d'enfants manquant");
        if (!attestationDate) {
          errors.push("Attestation CAF: date d'attestation manquante");
        } else {
          const attDate = new Date(attestationDate);
          const threeMonthsAgo = new Date();
          threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
          if (attDate < threeMonthsAgo) {
            errors.push(
              `Attestation CAF datant de plus de 3 mois (émise le ${attestationDate})`
            );
          }
        }
        break;

      case 'livret_famille':
        if (!lastName)
          warnings.push('Livret de famille: nom du titulaire non extrait');
        if (numberOfChildren === 0)
          warnings.push('Livret de famille: aucun enfant inscrit');
        break;

      case 'carte_etudiant':
        if (!lastName) errors.push('Carte étudiante: nom manquant');
        if (!firstName) errors.push('Carte étudiante: prénom manquant');
        if (!institution)
          errors.push('Carte étudiante: établissement manquant');
        if (!academicYear)
          errors.push("Carte étudiante: année académique manquante");
        checkExpiry(expirationDate, 'Carte étudiante');
        break;

      case 'certificat_scolarite':
        if (!lastName)
          errors.push('Certificat de scolarité: nom étudiant manquant');
        if (!firstName)
          errors.push('Certificat de scolarité: prénom étudiant manquant');
        if (!institution)
          errors.push('Certificat de scolarité: établissement manquant');
        if (!academicYear) {
          errors.push('Certificat de scolarité: année académique manquante');
        } else {
          const currentYear = today.getFullYear();
          const isCurrentOrPrevYear =
            academicYear.includes(currentYear.toString()) ||
            academicYear.includes((currentYear - 1).toString());
          if (!isCurrentOrPrevYear) {
            errors.push(
              `Certificat de scolarité: année ${academicYear} ne correspond pas à l'année académique en cours`
            );
          }
        }
        break;

      case 'acte_naissance':
        if (!lastName)
          errors.push('Acte de naissance: nom de famille manquant');
        if (!firstName) errors.push('Acte de naissance: prénom manquant');
        if (!dateOfBirth)
          errors.push('Acte de naissance: date de naissance manquante');
        break;
    }

    return {
      documentType,
      isConform: errors.length === 0,
      errors,
      warnings,
    };
  },
});
