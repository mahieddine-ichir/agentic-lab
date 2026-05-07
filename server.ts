import express from 'express';
import multer from 'multer';
import {
  InMemoryRunner,
  getFunctionResponses,
} from '@google/adk';
import { createRootAgent } from './agent.js';

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/gif',
      'application/pdf',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

app.use(express.static('public'));

app.post(
  '/api/analyze',
  upload.array('documents', 10),
  async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const send = (data: object) =>
      res.write(`data: ${JSON.stringify(data)}\n\n`);

    try {
      const { community, apiKey, fraudEnabled: fraudEnabledStr } = req.body as Record<string, string>;
      const files = (req.files as Express.Multer.File[]) ?? [];
      const fraudEnabled = fraudEnabledStr !== 'false';

      if (!community) throw new Error('Communauté non sélectionnée');
      if (!files.length) throw new Error('Aucun document fourni');
      if (!apiKey) throw new Error('Clé API Gemini manquante');

      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [
        {
          text: `Je souhaite adhérer à la communauté "${community}". Je vous soumets ${files.length} document(s). Analysez-les et donnez-moi la décision d'adhésion.`,
        },
        ...files.map((f) => ({
          inlineData: {
            mimeType: f.mimetype,
            data: f.buffer.toString('base64'),
          },
        })),
      ];

      // Build step map dynamically based on fraud toggle
      const dynamicStepMap: Record<string, { step: number; label: string }> = {
        document_processor: { step: 1, label: 'Analyse des documents' },
      };

      if (fraudEnabled) {
        dynamicStepMap.fraud_detector = { step: 2, label: 'Détection de fraude' };
        dynamicStepMap.eligibility_checker = { step: 3, label: "Vérification d'éligibilité" };
        dynamicStepMap.decision_maker = { step: 4, label: 'Décision finale' };
      } else {
        dynamicStepMap.eligibility_checker = { step: 2, label: "Vérification d'éligibilité" };
        dynamicStepMap.decision_maker = { step: 3, label: 'Décision finale' };
      }

      const runner = new InMemoryRunner({
        agent: createRootAgent(apiKey, { fraudEnabled }),
        appName: 'community_adhesion',
      });

      let currentStep = 0;

      for await (const event of runner.runEphemeral({
        userId: `user-${Date.now()}`,
        newMessage: { role: 'user', parts },
      })) {
        if ((event as { errorCode?: string }).errorCode) {
          const e = event as { errorCode: string; errorMessage?: string };
          send({ type: 'error', message: `${e.errorCode}: ${e.errorMessage ?? 'Unknown error'}` });
          continue;
        }

        // Detect agent step transitions via transfer
        const transferTarget = event.actions?.transferToAgent;
        if (transferTarget && dynamicStepMap[transferTarget]) {
          const { step, label } = dynamicStepMap[transferTarget];
          if (step !== currentStep) {
            currentStep = step;
            send({ type: 'step', step, label });
          }
        }

        // Detect current step from event author
        if (event.author && dynamicStepMap[event.author]) {
          const { step, label } = dynamicStepMap[event.author];
          if (step !== currentStep) {
            currentStep = step;
            send({ type: 'step', step, label });
          }
        }

        // Stream text content (filter out function call/response parts)
        const textContent = event.content?.parts
          ?.filter(
            (p): p is { text: string } =>
              'text' in p && typeof (p as { text: unknown }).text === 'string'
          )
          .map((p) => p.text)
          .join('');

        if (textContent?.trim() && event.author && event.author !== 'user') {
          send({
            type: 'text',
            author: event.author,
            text: textContent,
            partial: event.partial ?? false,
          });
        }

        // Detect structured tool responses
        for (const resp of getFunctionResponses(event)) {
          if (resp.name === 'make_adhesion_decision') {
            send({ type: 'decision', data: resp.response });
          }
          if (resp.name === 'evaluate_fraud_risk') {
            send({ type: 'fraud_result', data: resp.response });
          }
        }
      }

      send({ type: 'done' });
    } catch (err) {
      send({
        type: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      res.end();
    }
  }
);

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur port ${PORT}`);
});
