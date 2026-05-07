import { LlmAgent, SequentialAgent, Gemini } from '@google/adk';
import { createDocumentProcessorAgent } from './src/agents/documentProcessorAgent.js';
import { createFraudAgent } from './src/agents/fraudAgent.js';
import { createEligibilityAgent } from './src/agents/eligibilityAgent.js';
import { createDecisionAgent } from './src/agents/decisionAgent.js';
import { ClaudeLlm } from './src/models/claudeLlm.js';

export function createRootAgent(apiKey?: string, options: { fraudEnabled?: boolean } = {}) {
  const model = new Gemini({
    model: 'gemini-2.5-flash',
    apiKey: apiKey,
  });

  const visionModel = new Gemini({
    model: 'gemini-2.5-pro',
    apiKey: apiKey,
  });

  const subAgents = [
    createDocumentProcessorAgent(visionModel),
  ];

  if (options.fraudEnabled !== false) {
    subAgents.push(createFraudAgent(model));
  }

  const claudeSonnet = new ClaudeLlm({ model: 'claude-sonnet-4-6', apiKey: process.env.ANTHROPIC_API_KEY });

  subAgents.push(createEligibilityAgent(model), createDecisionAgent(claudeSonnet));

  const adhesionPipeline = new SequentialAgent({
    name: 'adhesion_pipeline',
    description:
      "Pipeline séquentiel: traitement des documents, détection de fraude, vérification d'éligibilité, décision finale.",
    subAgents: subAgents,
  });

  return new LlmAgent({
    name: 'community_adhesion_orchestrator',
    model,
    description:
      "Orchestrateur du processus d'adhésion aux communautés. Accueille le demandeur et délègue au pipeline de traitement dès réception des documents.",
    instruction: `Tu gères les demandes d'adhésion aux communautés de proximité.

Communautés disponibles:
- Etudiant: carte étudiante valide OU certificat de scolarité de l'année en cours + pièce d'identité
- Famille nombreuse: 3 enfants ou plus (attestation CAF < 3 mois ou livret de famille) + pièce d'identité
- Jeune parent: enfant né dans les 12 derniers mois (livret de famille ou acte de naissance) + pièce d'identité

Comportement:
1. Si aucun document soumis: accueille le demandeur, présente les 3 catégories et les documents nécessaires (pièce d'identité obligatoire + document justificatif selon la catégorie visée), puis demande-lui de soumettre ses documents.

2. Dès que le demandeur décrit ou soumet ses documents: délègue immédiatement au pipeline adhesion_pipeline qui gérera la validation, la vérification des règles et la décision finale.

Ne procède jamais toi-même à la validation — délègue toujours au pipeline.`,
    subAgents: [adhesionPipeline],
  });
}

