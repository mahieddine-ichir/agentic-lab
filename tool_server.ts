import express from 'express';
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

const app = express();
app.use(express.json());

const tools = {
  validate_document_conformity: validateDocumentConformity,
  check_document_authenticity: checkDocumentAuthenticity,
  cross_check_document_consistency: crossCheckDocumentConsistency,
  evaluate_fraud_risk: evaluateFraudRisk,
  check_student_eligibility: checkStudentEligibility,
  check_famille_nombreuse_eligibility: checkFamilleNombreuseEligibility,
  check_jeune_parent_eligibility: checkJeuneParentEligibility,
  make_adhesion_decision: makeAdhesionDecision,
};

// Generic tool execution endpoint or specific ones
Object.entries(tools).forEach(([name, tool]) => {
  app.post(`/tools/${name}`, async (req, res) => {
    try {
      console.log(`Executing tool: ${name}`, req.body);
      const result = await (tool as any).execute(req.body);
      res.json(result);
    } catch (error) {
      console.error(`Error executing tool ${name}:`, error);
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  });
});

app.get('/openapi.json', (req, res) => {
  // Simple OpenAPI generation logic or static file
  res.sendFile('openapi.json', { root: './playbooks' });
});

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Tool server listening on port ${PORT}`);
});
