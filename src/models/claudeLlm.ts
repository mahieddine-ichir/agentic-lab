import Anthropic from '@anthropic-ai/sdk';
import { BaseLlm } from '@google/adk';
import type { LlmRequest, LlmResponse, BaseLlmConnection } from '@google/adk';
import type { Content, Part } from '@google/genai';

export class ClaudeLlm extends BaseLlm {
  static readonly supportedModels: Array<string | RegExp> = [/claude-.*/];

  private client: Anthropic;

  constructor({ model, apiKey }: { model: string; apiKey?: string }) {
    super({ model });
    this.client = new Anthropic({ apiKey });
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    stream?: boolean,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    const system = this.extractSystem(llmRequest);
    const messages = this.toAnthropicMessages(llmRequest.contents);
    const tools = this.toAnthropicTools(llmRequest);

    const params: Anthropic.Messages.MessageCreateParamsNonStreaming = {
      model: this.model,
      max_tokens: 8192,
      messages,
      ...(system && { system }),
      ...(tools.length > 0 && { tools }),
    };

    if (stream) {
      const streamResp = this.client.messages.stream(
        params as Anthropic.Messages.MessageStreamParams,
        { signal: abortSignal },
      );
      const toolAccum: { id: string; name: string; inputJson: string }[] = [];

      for await (const event of streamResp) {
        if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
          toolAccum.push({ id: event.content_block.id, name: event.content_block.name, inputJson: '' });
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            yield { content: { role: 'model', parts: [{ text: event.delta.text }] }, partial: true };
          } else if (event.delta.type === 'input_json_delta') {
            const last = toolAccum[toolAccum.length - 1];
            if (last) last.inputJson += event.delta.partial_json;
          }
        } else if (event.type === 'message_stop') {
          const parts: Part[] = toolAccum.map(tu => ({
            functionCall: { id: tu.id, name: tu.name, args: JSON.parse(tu.inputJson || '{}') },
          }));
          if (parts.length > 0) yield { content: { role: 'model', parts }, turnComplete: true };
          else yield { turnComplete: true };
        }
      }
    } else {
      const response = await this.client.messages.create(params, { signal: abortSignal });
      yield this.fromAnthropicResponse(response);
    }
  }

  async connect(_llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    throw new Error('Live connection not supported for Claude models');
  }

  private extractSystem(llmRequest: LlmRequest): string {
    const si = llmRequest.config?.systemInstruction;
    if (!si) return '';
    if (typeof si === 'string') return si;
    if ('parts' in si && Array.isArray((si as { parts?: Part[] }).parts)) {
      return ((si as { parts?: Part[] }).parts ?? []).map((p: Part) => p.text ?? '').filter(Boolean).join('\n');
    }
    if (Array.isArray(si)) {
      return (si as Part[]).map((p: Part) => p.text ?? '').filter(Boolean).join('\n');
    }
    return (si as Part).text ?? '';
  }

  private toAnthropicMessages(contents: Content[]): Anthropic.Messages.MessageParam[] {
    const messages: Anthropic.Messages.MessageParam[] = [];

    for (const content of contents) {
      const role: 'user' | 'assistant' = content.role === 'model' ? 'assistant' : 'user';
      const userBlocks: Anthropic.Messages.ToolResultBlockParam[] = [];
      const assistantBlocks: (Anthropic.Messages.TextBlockParam | Anthropic.Messages.ToolUseBlockParam)[] = [];

      for (const part of content.parts ?? []) {
        if (part.text) {
          if (role === 'assistant') {
            assistantBlocks.push({ type: 'text', text: part.text });
          } else {
            messages.push({ role: 'user', content: part.text });
          }
        } else if (part.functionCall && role === 'assistant') {
          assistantBlocks.push({
            type: 'tool_use',
            id: part.functionCall.id ?? `call_${Date.now()}`,
            name: part.functionCall.name ?? '',
            input: (part.functionCall.args ?? {}) as Record<string, unknown>,
          });
        } else if (part.functionResponse && role === 'user') {
          userBlocks.push({
            type: 'tool_result',
            tool_use_id: part.functionResponse.id ?? '',
            content: JSON.stringify(part.functionResponse.response ?? {}),
          });
        }
      }

      if (role === 'assistant' && assistantBlocks.length > 0) {
        messages.push({ role: 'assistant', content: assistantBlocks });
      } else if (role === 'user' && userBlocks.length > 0) {
        messages.push({ role: 'user', content: userBlocks });
      }
    }

    return messages;
  }

  private toAnthropicTools(llmRequest: LlmRequest): Anthropic.Messages.Tool[] {
    const tools: Anthropic.Messages.Tool[] = [];
    for (const toolGroup of llmRequest.config?.tools ?? []) {
      if ('functionDeclarations' in toolGroup) {
        for (const fd of toolGroup.functionDeclarations ?? []) {
          tools.push({
            name: fd.name ?? '',
            description: fd.description ?? '',
            input_schema: {
              type: 'object' as const,
              properties: (fd.parameters?.properties as Record<string, unknown>) ?? {},
              required: (fd.parameters?.required as string[]) ?? [],
            },
          });
        }
      }
    }
    return tools;
  }

  private fromAnthropicResponse(response: Anthropic.Messages.Message): LlmResponse {
    const parts: Part[] = response.content.map(block => {
      if (block.type === 'text') return { text: block.text };
      if (block.type === 'tool_use') {
        return {
          functionCall: {
            id: block.id,
            name: block.name,
            args: block.input as Record<string, unknown>,
          },
        };
      }
      return {};
    });

    return {
      content: { role: 'model', parts },
      usageMetadata: {
        promptTokenCount: response.usage.input_tokens,
        candidatesTokenCount: response.usage.output_tokens,
        totalTokenCount: response.usage.input_tokens + response.usage.output_tokens,
      },
    };
  }
}