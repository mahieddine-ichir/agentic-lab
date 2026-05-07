import express from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import type { ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createAdhesionPipeline } from './pipeline.js';

const app = express();
const s3 = new S3Client({ region: process.env.AWS_REGION ?? 'eu-west-1' });

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

app.get('/api/config', (_req, res) => {
  res.json({
    modelId: process.env.BEDROCK_MODEL_ID ?? 'eu.anthropic.claude-3-5-sonnet-20241022-v2:0',
  });
});

app.post('/api/analyze', upload.array('documents', 10), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    const { community, fraudEnabled: fraudEnabledStr } = req.body as Record<string, string>;
    const files = (req.files as Express.Multer.File[]) ?? [];
    const fraudEnabled = fraudEnabledStr !== 'false';

    if (!community) throw new Error('Communauté non sélectionnée');
    if (!files.length) throw new Error('Aucun document fourni');

    const documentBlocks: ContentBlock[] = files.map((f) => {
      if (f.mimetype === 'application/pdf') {
        return {
          document: {
            format: 'pdf' as const,
            name: sanitizeDocName(f.originalname ?? 'document'),
            source: { bytes: f.buffer },
          },
        } as ContentBlock;
      }
      return {
        image: {
          format: mimeToImageFormat(f.mimetype),
          source: { bytes: f.buffer },
        },
      } as ContentBlock;
    });

    const textIntro = `Je souhaite adhérer à la communauté "${community}". Je vous soumets ${files.length} document(s). Analysez-les et donnez-moi la décision d'adhésion.`;

    const pipeline = createAdhesionPipeline({ fraudEnabled });

    await pipeline.run(textIntro, documentBlocks, (event) => {
      switch (event.type) {
        case 'step':
          send({ type: 'step', step: event.step, label: event.label });
          break;
        case 'text':
          if (event.text || !event.partial) {
            send({
              type: 'text',
              author: event.author,
              text: event.text,
              partial: event.partial,
            });
          }
          break;
        case 'tool_result':
          if (event.toolName === 'make_adhesion_decision') {
            send({ type: 'decision', data: event.data });
          }
          if (event.toolName === 'evaluate_fraud_risk') {
            send({ type: 'fraud_result', data: event.data });
          }
          break;
        case 'done':
          send({ type: 'done' });
          break;
      }
    });
  } catch (err) {
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  } finally {
    res.end();
  }
});

app.post('/api/analyze-agent', upload.array('documents', 10), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const requestId = randomUUID();
  const uploadedKeys: string[] = [];

  try {
    const { community } = req.body as Record<string, string>;
    const files = (req.files as Express.Multer.File[]) ?? [];

    if (!community) throw new Error('Communauté non sélectionnée');
    if (!files.length) throw new Error('Aucun document fourni');

    const bucket = process.env.DOCUMENTS_BUCKET;
    const agentId = process.env.BEDROCK_AGENT_ID;
    const agentAliasId = process.env.BEDROCK_AGENT_ALIAS_ID;

    if (!bucket || !agentId || !agentAliasId) {
      throw new Error('Agent Bedrock non configuré (DOCUMENTS_BUCKET, BEDROCK_AGENT_ID, BEDROCK_AGENT_ALIAS_ID requis)');
    }

    for (const file of files) {
      const ext = file.originalname.split('.').pop() ?? 'bin';
      const key = `uploads/${requestId}/${randomUUID()}.${ext}`;
      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }));
      uploadedKeys.push(key);
    }

    send({ type: 'step', step: 1, label: 'Agent Bedrock en cours...' });

    const inputText = [
      `Je souhaite adhérer à la communauté "${community}".`,
      `${files.length} document(s) disponible(s) sur S3:`,
      `  Bucket: ${bucket}`,
      `  Clés: ${uploadedKeys.join(', ')}`,
      `Analysez ces documents et rendez une décision d'adhésion complète.`,
    ].join('\n');

    const { invokeBedrockAgent } = await import('./src/bedrock-agent/agentService.js');
    await invokeBedrockAgent({
      agentId,
      agentAliasId,
      inputText,
      onChunk: (text) => send({ type: 'text', author: 'bedrock_agent', text, partial: true }),
    });

    send({ type: 'text', author: 'bedrock_agent', text: '', partial: false });
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  } finally {
    for (const key of uploadedKeys) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: process.env.DOCUMENTS_BUCKET!, Key: key }));
      } catch {}
    }
    res.end();
  }
});

function sanitizeDocName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')           // strip extension
    .replace(/[^a-zA-Z0-9 \-()[\]]/g, ' ')  // replace invalid chars with space
    .replace(/  +/g, ' ')              // collapse consecutive spaces
    .trim() || 'document';
}

function mimeToImageFormat(mime: string): 'jpeg' | 'png' | 'gif' | 'webp' {
  switch (mime) {
    case 'image/jpg':
    case 'image/jpeg':
      return 'jpeg';
    case 'image/png':
      return 'png';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'jpeg';
  }
}

const PORT = parseInt(process.env.PORT ?? '8080', 10);
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur port ${PORT}`);
});
