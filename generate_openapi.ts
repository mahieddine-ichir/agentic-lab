import { zodToJsonSchema } from 'zod-to-json-schema';
import { validateDocumentConformity } from './src/tools/documentTools.js';
import {
  checkDocumentAuthenticity,
  crossCheckDocumentConsistency,
  evaluateFraudRisk,
} from './src/tools/fraudTools.js';
import {
  checkStudentEligibility,
  checkFamilleNombreuseEligibility,
  checkJeuneParentEligibility,
  makeAdhesionDecision,
} from './src/tools/ruleTools.js';
import * as fs from 'fs';

const tools: Record<string, any> = {
  validate_document_conformity: validateDocumentConformity,
  check_document_authenticity: checkDocumentAuthenticity,
  cross_check_document_consistency: crossCheckDocumentConsistency,
  evaluate_fraud_risk: evaluateFraudRisk,
  check_student_eligibility: checkStudentEligibility,
  check_famille_nombreuse_eligibility: checkFamilleNombreuseEligibility,
  check_jeune_parent_eligibility: checkJeuneParentEligibility,
  make_adhesion_decision: makeAdhesionDecision,
};

const openapi = {
  openapi: '3.0.0',
  info: {
    title: 'Community Adhesion Tools',
    version: '1.0.0',
    description: 'API for document validation and eligibility rules used by Vertex AI Agents.',
  },
  servers: [
    { url: 'https://TOOL_SERVER_URL', description: 'Production server' }
  ],
  paths: {} as any,
};

for (const [name, tool] of Object.entries(tools)) {
  const schema = zodToJsonSchema(tool.parameters, { target: 'openApi3' });
  openapi.paths[`/tools/${name}`] = {
    post: {
      operationId: name,
      summary: tool.description,
      requestBody: {
        content: {
          'application/json': {
            schema,
          },
        },
      },
      responses: {
        '200': {
          description: 'Successful execution',
          content: {
            'application/json': {
              schema: { type: 'object' },
            },
          },
        },
      },
    },
  };
}

fs.writeFileSync('./playbooks/openapi.json', JSON.stringify(openapi, null, 2));
console.log('OpenAPI spec generated in playbooks/openapi.json');
