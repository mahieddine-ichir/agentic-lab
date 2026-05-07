import { FunctionTool } from '@google/adk';
import { z } from 'zod';

export const checkDocumentAuthenticity = new FunctionTool({
  name: 'check_document_authenticity',
  description:
    'Analyses a single document for signs of tampering or forgery based on visible characteristics, date logic, and format checks.',
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
      .describe('Type of document being analysed'),
    issueDate: z
      .string()
      .optional()
      .describe('Document issue date (YYYY-MM-DD)'),
    expirationDate: z
      .string()
      .optional()
      .describe('Document expiration date (YYYY-MM-DD)'),
    documentNumber: z
      .string()
      .optional()
      .describe('Document number as read from the document'),
    specimenIndicators: z
      .array(z.string())
      .optional()
      .describe(
        'Specimen/test document indicators explicitly visible on the document, e.g. "SPÉCIMEN", "SPECIMEN", "MODÈLE", "EXEMPLE", "VOID", "ANNULÉ", "FOR TRAINING ONLY", repeated watermark text, all-zero or sequential document number (000000000, 123456789), obviously fake name (DUPONT JEAN, DOE JOHN), or placeholder dates (01/01/1900, 31/12/9999)'
      ),
    visibleAnomalies: z
      .array(z.string())
      .optional()
      .describe(
        'Visual anomalies observed, e.g. "pixelation around digits", "inconsistent font", "cut-and-paste signs"'
      ),
    hasSecurityFeatures: z
      .boolean()
      .optional()
      .describe(
        'Whether expected security features are visible (hologram, watermark, MRZ zone, etc.)'
      ),
    imageQuality: z
      .enum(['clear', 'blurry', 'heavily_filtered'])
      .optional()
      .describe('Overall quality of the document image'),
  }),
  execute: ({
    documentType,
    issueDate,
    expirationDate,
    documentNumber,
    specimenIndicators,
    visibleAnomalies,
    hasSecurityFeatures,
    imageQuality,
  }) => {
    const suspicions: string[] = [];
    const positives: string[] = [];
    let riskScore = 0;

    // ── SPECIMEN / TEST DOCUMENT — immediate HIGH risk ──
    if (specimenIndicators && specimenIndicators.length > 0) {
      specimenIndicators.forEach((s) =>
        suspicions.push(`Document spécimen/test détecté: "${s}"`)
      );
      riskScore = 100; // short-circuit — no need to check further
      return { documentType, riskScore, riskLevel: 'high' as const, suspicions, positives };
    }

    // Also catch obvious specimen document numbers programmatically
    if (documentNumber) {
      const num = documentNumber.replace(/\s/g, '');
      const isObviousFake =
        /^0+$/.test(num) ||                   // 000000000
        /^1234/.test(num) ||                   // 123456789
        /^(SPECIMEN|EXEMPLE|MODELE|VOID|TEST)/i.test(num);
      if (isObviousFake) {
        suspicions.push(`Numéro de document factice: "${documentNumber}"`);
        riskScore = 100;
        return { documentType, riskScore, riskLevel: 'high' as const, suspicions, positives };
      }
    }

    // Date logic
    if (issueDate && expirationDate) {
      const issue = new Date(issueDate);
      const expiry = new Date(expirationDate);
      if (expiry <= issue) {
        suspicions.push(
          "Date d'expiration antérieure ou égale à la date d'émission"
        );
        riskScore += 40;
      }
    }

    // Very recent issuance (< 7 days)
    if (issueDate) {
      const daysOld =
        (Date.now() - new Date(issueDate).getTime()) / (1000 * 60 * 60 * 24);
      if (daysOld < 7) {
        suspicions.push('Document émis il y a moins de 7 jours');
        riskScore += 15;
      } else {
        positives.push('Date d\'émission cohérente');
      }
    }

    // Document number format checks
    if (documentNumber) {
      if (
        documentType === 'passport' &&
        !/^[A-Z0-9]{7,9}$/.test(documentNumber)
      ) {
        suspicions.push('Format du numéro de passeport non standard');
        riskScore += 20;
      }
      if (
        documentType === 'carte_identite' &&
        !/^[0-9A-Z]{12}$/.test(documentNumber)
      ) {
        suspicions.push("Format du numéro de carte d'identité non standard");
        riskScore += 15;
      }
    }

    // Visual anomalies
    if (visibleAnomalies && visibleAnomalies.length > 0) {
      visibleAnomalies.forEach((a) => suspicions.push(`Anomalie visuelle: ${a}`));
      riskScore += Math.min(visibleAnomalies.length * 20, 50);
    }

    // Security features
    if (
      hasSecurityFeatures === false &&
      ['passport', 'carte_identite'].includes(documentType)
    ) {
      suspicions.push(
        "Aucune caractéristique de sécurité visible sur ce document d'identité"
      );
      riskScore += 25;
    } else if (hasSecurityFeatures === true) {
      positives.push('Caractéristiques de sécurité présentes');
      riskScore = Math.max(0, riskScore - 10);
    }

    // Image quality
    if (imageQuality === 'heavily_filtered') {
      suspicions.push(
        'Image fortement filtrée ou retouchée — peut dissimuler des anomalies'
      );
      riskScore += 20;
    } else if (imageQuality === 'clear') {
      positives.push('Document clairement lisible');
    }

    const riskLevel: 'low' | 'medium' | 'high' =
      riskScore >= 50 ? 'high' : riskScore >= 25 ? 'medium' : 'low';

    return { documentType, riskScore, riskLevel, suspicions, positives };
  },
});

export const crossCheckDocumentConsistency = new FunctionTool({
  name: 'cross_check_document_consistency',
  description:
    'Verifies consistency of personal data across multiple documents: names, dates of birth, number of children, etc.',
  parameters: z.object({
    identityLastName: z.string().optional(),
    identityFirstName: z.string().optional(),
    identityDateOfBirth: z.string().optional(),
    cafLastName: z.string().optional(),
    cafFirstName: z.string().optional(),
    cafNumberOfChildren: z.number().optional(),
    livretLastName: z.string().optional(),
    livretNumberOfChildren: z.number().optional(),
    studentLastName: z.string().optional(),
    studentFirstName: z.string().optional(),
    acteNaissanceChildDateOfBirth: z
      .string()
      .optional()
      .describe('Child date of birth from acte de naissance'),
    livretYoungestChildDateOfBirth: z
      .string()
      .optional()
      .describe('Youngest child date of birth from livret de famille'),
  }),
  execute: (data) => {
    const inconsistencies: string[] = [];
    const consistencies: string[] = [];

    const norm = (s?: string) =>
      s?.toLowerCase().trim().replace(/['\-]/g, ' ').replace(/\s+/g, ' ');

    const idLast = norm(data.identityLastName);

    // Name vs CAF
    if (data.cafLastName && idLast) {
      if (norm(data.cafLastName) !== idLast) {
        inconsistencies.push(
          `Nom différent: pièce d'identité "${data.identityLastName}" ≠ CAF "${data.cafLastName}"`
        );
      } else {
        consistencies.push("Nom cohérent entre pièce d'identité et CAF");
      }
    }

    // Name vs student doc
    if (data.studentLastName && idLast) {
      if (norm(data.studentLastName) !== idLast) {
        inconsistencies.push(
          `Nom différent: pièce d'identité "${data.identityLastName}" ≠ document étudiant "${data.studentLastName}"`
        );
      } else {
        consistencies.push(
          "Nom cohérent entre pièce d'identité et document étudiant"
        );
      }
    }

    // Children count: CAF vs livret
    if (
      data.cafNumberOfChildren !== undefined &&
      data.livretNumberOfChildren !== undefined
    ) {
      const diff = Math.abs(data.cafNumberOfChildren - data.livretNumberOfChildren);
      if (diff > 1) {
        inconsistencies.push(
          `Nombre d'enfants incohérent: CAF (${data.cafNumberOfChildren}) ≠ livret de famille (${data.livretNumberOfChildren})`
        );
      } else {
        consistencies.push(
          `Nombre d'enfants cohérent (${data.cafNumberOfChildren})`
        );
      }
    }

    // Child birth date: acte vs livret
    if (
      data.acteNaissanceChildDateOfBirth &&
      data.livretYoungestChildDateOfBirth
    ) {
      if (
        data.acteNaissanceChildDateOfBirth !==
        data.livretYoungestChildDateOfBirth
      ) {
        inconsistencies.push(
          `Date de naissance de l'enfant différente: acte de naissance (${data.acteNaissanceChildDateOfBirth}) ≠ livret de famille (${data.livretYoungestChildDateOfBirth})`
        );
      } else {
        consistencies.push("Date de naissance de l'enfant cohérente");
      }
    }

    const riskLevel: 'low' | 'medium' | 'high' =
      inconsistencies.length >= 2
        ? 'high'
        : inconsistencies.length === 1
          ? 'medium'
          : 'low';

    return {
      isConsistent: inconsistencies.length === 0,
      riskLevel,
      inconsistencies,
      consistencies,
    };
  },
});

export const evaluateFraudRisk = new FunctionTool({
  name: 'evaluate_fraud_risk',
  description:
    'Aggregates individual authenticity checks and cross-document consistency into a final fraud risk assessment with a clear recommendation.',
  parameters: z.object({
    authenticityResults: z
      .array(
        z.object({
          documentType: z.string(),
          riskLevel: z.enum(['low', 'medium', 'high']),
          riskScore: z.number(),
          suspicions: z.array(z.string()),
        })
      )
      .describe('Results from check_document_authenticity for each document'),
    consistencyResult: z
      .object({
        isConsistent: z.boolean(),
        riskLevel: z.enum(['low', 'medium', 'high']),
        inconsistencies: z.array(z.string()),
      })
      .describe('Result from cross_check_document_consistency'),
  }),
  execute: ({ authenticityResults, consistencyResult }) => {
    const order = { low: 0, medium: 1, high: 2 };
    let maxRisk: 'low' | 'medium' | 'high' = 'low';
    const allSuspicions: string[] = [...consistencyResult.inconsistencies];

    for (const auth of authenticityResults) {
      allSuspicions.push(...auth.suspicions);
      if (order[auth.riskLevel] > order[maxRisk]) maxRisk = auth.riskLevel;
    }
    if (order[consistencyResult.riskLevel] > order[maxRisk]) {
      maxRisk = consistencyResult.riskLevel;
    }

    const recommendation =
      maxRisk === 'high'
        ? 'BLOQUER — risque de fraude élevé. La demande doit être rejetée.'
        : maxRisk === 'medium'
          ? 'VIGILANCE — anomalies mineures détectées. Vérification manuelle recommandée mais traitement peut continuer.'
          : 'CONTINUER — aucun indicateur de fraude significatif détecté.';

    return {
      overallRiskLevel: maxRisk,
      shouldBlock: maxRisk === 'high',
      suspicionsCount: allSuspicions.length,
      allSuspicions,
      recommendation,
    };
  },
});
