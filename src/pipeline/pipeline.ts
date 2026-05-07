import type { ContentBlock } from '@aws-sdk/client-bedrock-runtime';
import type { BedrockAgent, AgentEvent } from './agent.js';

export type PipelineEvent =
  | { type: 'step'; step: number; label: string; agentName: string }
  | AgentEvent
  | { type: 'done' };

export interface PipelineAgentConfig {
  agent: BedrockAgent;
  label: string;
  needsDocuments: boolean;
}

export class SequentialPipeline {
  constructor(private readonly agentConfigs: PipelineAgentConfig[]) {}

  async run(
    textIntro: string,
    documentBlocks: ContentBlock[],
    onEvent: (e: PipelineEvent) => void
  ): Promise<void> {
    let accumulatedContext = '';

    for (let i = 0; i < this.agentConfigs.length; i++) {
      const { agent, label, needsDocuments } = this.agentConfigs[i];

      onEvent({ type: 'step', step: i + 1, label, agentName: agent.name });

      const content: ContentBlock[] = needsDocuments
        ? [
            {
              text: accumulatedContext
                ? `${textIntro}\n\nAnalyses précédentes:\n${accumulatedContext}`
                : textIntro,
            } as ContentBlock,
            ...documentBlocks,
          ]
        : [{ text: `Contexte des analyses précédentes:\n${accumulatedContext}` } as ContentBlock];

      const result = await agent.run(content, accumulatedContext, (e) => onEvent(e));

      accumulatedContext += `\n\n=== ${agent.name} (${label}) ===\n${result.text}`;
    }

    onEvent({ type: 'done' });
  }
}
