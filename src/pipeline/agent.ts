import {
  BedrockRuntimeClient,
  ConverseStreamCommand,
  type ContentBlock,
  type Message,
  type Tool,
} from '@aws-sdk/client-bedrock-runtime';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (input: Record<string, unknown>) => Record<string, unknown>;
}

export type AgentEvent =
  | { type: 'text'; author: string; text: string; partial: boolean }
  | { type: 'tool_result'; toolName: string; data: Record<string, unknown> };

export interface AgentResult {
  text: string;
  toolCallResults: Array<{ name: string; result: Record<string, unknown> }>;
}

interface BlockAcc {
  type: 'text' | 'tool_use';
  text: string;
  toolUseId: string;
  toolName: string;
  inputJson: string;
}

export class BedrockAgent {
  private readonly client: BedrockRuntimeClient;

  constructor(
    public readonly name: string,
    private readonly instruction: string,
    private readonly tools: ToolDef[],
    private readonly modelId: string
  ) {
    this.client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'eu-west-1',
    });
  }

  async run(
    content: ContentBlock[],
    context: string,
    onEvent: (e: AgentEvent) => void
  ): Promise<AgentResult> {
    const messages: Message[] = [{ role: 'user', content }];
    let fullText = '';
    const toolCallResults: Array<{ name: string; result: Record<string, unknown> }> = [];

    const bedrockTools = this.tools.map((t) => ({
      toolSpec: {
        name: t.name,
        description: t.description,
        inputSchema: { json: t.inputSchema },
      },
    })) as Tool[];

    const systemPrompt = context
      ? `${this.instruction}\n\n---\nContexte des étapes précédentes du pipeline:\n${context}`
      : this.instruction;

    while (true) {
      const response = await this.client.send(
        new ConverseStreamCommand({
          modelId: this.modelId,
          system: [{ text: systemPrompt }],
          messages,
          toolConfig: bedrockTools.length > 0 ? { tools: bedrockTools } : undefined,
          inferenceConfig: { maxTokens: 5120, temperature: 0 },
        })
      );

      const blockAccumulators = new Map<number, BlockAcc>();
      const outputContent: ContentBlock[] = [];
      let stopReason = 'end_turn';

      for await (const event of response.stream ?? []) {
        if (event.contentBlockStart) {
          const idx = event.contentBlockStart.contentBlockIndex ?? 0;
          const start = event.contentBlockStart.start;
          if (start?.toolUse) {
            blockAccumulators.set(idx, {
              type: 'tool_use',
              text: '',
              toolUseId: start.toolUse.toolUseId ?? '',
              toolName: start.toolUse.name ?? '',
              inputJson: '',
            });
          } else {
            blockAccumulators.set(idx, {
              type: 'text',
              text: '',
              toolUseId: '',
              toolName: '',
              inputJson: '',
            });
          }
        }

        if (event.contentBlockDelta) {
          const idx = event.contentBlockDelta.contentBlockIndex ?? 0;
          const delta = event.contentBlockDelta.delta;
          let acc = blockAccumulators.get(idx);

          // Fallback: text block that started without a contentBlockStart event
          if (!acc && delta?.text) {
            acc = { type: 'text', text: '', toolUseId: '', toolName: '', inputJson: '' };
            blockAccumulators.set(idx, acc);
          }

          if (acc?.type === 'text' && delta?.text) {
            acc.text += delta.text;
            onEvent({ type: 'text', author: this.name, text: delta.text, partial: true });
          } else if (acc?.type === 'tool_use' && delta?.toolUse?.input) {
            acc.inputJson += delta.toolUse.input;
          }
        }

        if (event.contentBlockStop) {
          const idx = event.contentBlockStop.contentBlockIndex ?? 0;
          const acc = blockAccumulators.get(idx);
          if (acc) {
            if (acc.type === 'text' && acc.text) {
              outputContent.push({ text: acc.text } as ContentBlock);
            } else if (acc.type === 'tool_use') {
              outputContent.push({
                toolUse: {
                  toolUseId: acc.toolUseId,
                  name: acc.toolName,
                  input: JSON.parse(acc.inputJson || '{}'),
                },
              } as ContentBlock);
            }
            blockAccumulators.delete(idx);
          }
        }

        if (event.messageStop) {
          stopReason = event.messageStop.stopReason ?? 'end_turn';
        }
      }

      const textFromRound = outputContent
        .filter((b): b is { text: string } => 'text' in b)
        .map((b) => b.text)
        .join('');

      fullText += textFromRound;
      messages.push({ role: 'assistant', content: outputContent });

      if (stopReason === 'end_turn' || stopReason === 'max_tokens') {
        onEvent({ type: 'text', author: this.name, text: '', partial: false });
        break;
      }

      if (stopReason === 'tool_use') {
        const toolResultBlocks: ContentBlock[] = [];

        for (const block of outputContent) {
          if ('toolUse' in block && block.toolUse) {
            const toolUseId = block.toolUse.toolUseId ?? '';
            const name = block.toolUse.name ?? '';
            const input = block.toolUse.input;
            const tool = this.tools.find((t) => t.name === name);
            const result = tool
              ? tool.handler(input as Record<string, unknown>)
              : { error: `Unknown tool: ${name}` };

            toolCallResults.push({ name, result });
            onEvent({ type: 'tool_result', toolName: name, data: result });

            toolResultBlocks.push({
              toolResult: {
                toolUseId,
                content: [{ json: result }],
              },
            } as ContentBlock);
          }
        }

        messages.push({ role: 'user', content: toolResultBlocks });
      } else {
        onEvent({ type: 'text', author: this.name, text: '', partial: false });
        break;
      }
    }

    return { text: fullText, toolCallResults };
  }
}
