import { SequentialPipeline, type PipelineAgentConfig } from './src/pipeline/pipeline.js';
import { createDocumentProcessorAgent } from './src/agents/documentProcessorAgent.js';
import { createFraudAgent } from './src/agents/fraudAgent.js';
import { createEligibilityAgent } from './src/agents/eligibilityAgent.js';
import { createDecisionAgent } from './src/agents/decisionAgent.js';

const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? 'amazon.nova-2-lite-v1:0';

export function createAdhesionPipeline(
  options: { fraudEnabled?: boolean } = {}
): SequentialPipeline {
  const configs: PipelineAgentConfig[] = [
    {
      agent: createDocumentProcessorAgent(MODEL_ID),
      label: 'Analyse des documents',
      needsDocuments: true,
    },
  ];

  if (options.fraudEnabled !== false) {
    configs.push({
      agent: createFraudAgent(MODEL_ID),
      label: 'Détection de fraude',
      needsDocuments: true,
    });
  }

  configs.push(
    {
      agent: createEligibilityAgent(MODEL_ID),
      label: "Vérification d'éligibilité",
      needsDocuments: false,
    },
    {
      agent: createDecisionAgent(MODEL_ID),
      label: 'Décision finale',
      needsDocuments: false,
    }
  );

  return new SequentialPipeline(configs);
}
