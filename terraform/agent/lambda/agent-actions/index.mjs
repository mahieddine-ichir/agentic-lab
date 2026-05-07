import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const bedrock = new BedrockRuntimeClient({ region: process.env.AWS_REGION });
const s3 = new S3Client({ region: process.env.AWS_REGION });
const MODEL_ID = process.env.BEDROCK_MODEL_ID ?? "anthropic.claude-3-haiku-20240307-v1:0";

function param(parameters, name) {
  return parameters?.find(p => p.name === name)?.value ?? "";
}

async function fetchDocs(bucket, keysStr) {
  if (!bucket || !keysStr) return [];
  const keys = keysStr.split(",").map(k => k.trim()).filter(Boolean);
  return Promise.all(keys.map(async key => {
    const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const bytes = await res.Body.transformToByteArray();
    const ct = res.ContentType ?? "image/jpeg";
    if (ct === "application/pdf") {
      const name = key.split("/").pop()
        .replace(/\.[^.]+$/, "")
        .replace(/[^a-zA-Z0-9 \-()[\]]/g, " ")
        .replace(/  +/g, " ")
        .trim() || "document";
      return { document: { format: "pdf", name, source: { bytes } } };
    }
    const fmt = ct.includes("png") ? "png" : ct.includes("gif") ? "gif" : ct.includes("webp") ? "webp" : "jpeg";
    return { image: { format: fmt, source: { bytes } } };
  }));
}

async function converse(system, userBlocks) {
  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL_ID,
    system: [{ text: system }],
    messages: [{ role: "user", content: userBlocks }],
    inferenceConfig: { maxTokens: 4096, temperature: 0 },
  }));
  return res.output?.message?.content?.find(b => "text" in b)?.text ?? "";
}

function respond(actionGroup, fn, body) {
  return {
    messageVersion: "1.0",
    response: {
      actionGroup,
      function: fn,
      functionResponse: { responseBody: { TEXT: { body } } },
    },
  };
}

const ELIGIBILITY_CRITERIA = {
  "Etudiant": "Être inscrit dans un établissement d'enseignement supérieur. Fournir une pièce d'identité ET une carte étudiante ou certificat de scolarité valide pour l'année en cours.",
  "Famille nombreuse": "Avoir 3 enfants ou plus à charge. Fournir une pièce d'identité ET une attestation CAF de moins de 3 mois ou un livret de famille.",
  "Jeune parent": "Avoir un enfant né dans les 12 derniers mois. Fournir une pièce d'identité ET un livret de famille ou acte de naissance de l'enfant.",
};

export const handler = async (event) => {
  const { actionGroup, function: fn, parameters } = event;
  try {
    let result = "";

    if (actionGroup === "DocumentAnalysis" && fn === "analyze_documents") {
      const docs = await fetchDocs(param(parameters, "s3_bucket"), param(parameters, "s3_keys"));
      const community = param(parameters, "community");
      result = await converse(
        `Tu es un expert en analyse documentaire pour les demandes d'adhésion à la communauté "${community}". Extrais et résume: nom complet du demandeur, type de documents fournis, informations clés, et conformité aux exigences.`,
        [{ text: `Analysez ces documents pour une demande à la communauté "${community}".` }, ...docs]
      );

    } else if (actionGroup === "FraudDetection" && fn === "evaluate_fraud") {
      const docs = await fetchDocs(param(parameters, "s3_bucket"), param(parameters, "s3_keys"));
      const analysis = param(parameters, "analysis_summary");
      result = await converse(
        `Tu es un expert en détection de fraude documentaire. Analyse les documents pour détecter des signes de falsification ou incohérences. Réponds avec: niveau de risque (low/medium/high), indicateurs suspects, et recommandation.`,
        [{ text: `Contexte analyse: ${analysis}. Vérifie la fraude.` }, ...docs]
      );

    } else if (actionGroup === "EligibilityCheck" && fn === "check_eligibility") {
      const community = param(parameters, "community");
      const analysis = param(parameters, "analysis_summary");
      result = await converse(
        `Tu vérifies l'éligibilité à la communauté "${community}". Critères: ${ELIGIBILITY_CRITERIA[community] ?? "Non définis"}. Indique: éligible ou non, documents conformes ou manquants, raisons précises.`,
        [{ text: `Analyse documentaire: ${analysis}` }]
      );

    } else if (actionGroup === "FinalDecision" && fn === "make_decision") {
      const community = param(parameters, "community");
      const applicant = param(parameters, "applicant_name") || "Demandeur inconnu";
      const analysis = param(parameters, "analysis_summary");
      const fraud = param(parameters, "fraud_level");
      const eligibility = param(parameters, "eligibility_result");
      result = await converse(
        `Tu produis la décision finale en JSON strict: {"isAccepted": bool, "applicantName": string, "acceptedCategories": [], "rejectedCategories": [{"category": string, "reason": string}]}. Réponds uniquement avec le JSON.`,
        [{ text: `Communauté: ${community}\nDemandeur: ${applicant}\nAnalyse: ${analysis}\nFraude: ${fraud}\nÉligibilité: ${eligibility}` }]
      );

    } else {
      result = `Action inconnue: ${actionGroup}/${fn}`;
    }

    return respond(actionGroup, fn, result);
  } catch (err) {
    return respond(actionGroup, fn, `Erreur: ${err.message}`);
  }
};
