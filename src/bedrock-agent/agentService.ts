import { BedrockAgentRuntimeClient, InvokeAgentCommand } from '@aws-sdk/client-bedrock-agent-runtime';
import { randomUUID } from 'crypto';

const client = new BedrockAgentRuntimeClient({
  region: process.env.AWS_REGION ?? 'eu-west-1',
});

export async function invokeBedrockAgent(params: {
  agentId: string;
  agentAliasId: string;
  inputText: string;
  onChunk: (text: string) => void;
}): Promise<void> {
  const response = await client.send(new InvokeAgentCommand({
    agentId: params.agentId,
    agentAliasId: params.agentAliasId,
    sessionId: randomUUID(),
    inputText: params.inputText,
    enableTrace: false,
  }));

  for await (const event of response.completion ?? []) {
    if (event.chunk?.bytes) {
      params.onChunk(new TextDecoder().decode(event.chunk.bytes));
    }
  }
}
