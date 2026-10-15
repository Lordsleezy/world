import { ActionCtx } from '../_generated/server';
import { internal } from '../_generated/api';
import { LLMMessage, chatCompletion } from '../util/llm';
import { BrainName } from './pure';

export async function speak(
  ctx: ActionCtx,
  args: {
    name: string;
    messages: LLMMessage[];
    max_tokens?: number;
    stop?: string[] | string;
    temperature?: number;
    brain?: string;
  },
): Promise<{ text: string; provider: BrainName } | null> {
  const gate = await ctx.runMutation(internal.openbox.budget.reserve, {
    name: args.name,
    brain: args.brain,
  });
  if (!gate.ok) return null;
  try {
    const { content } = await chatCompletion({
      messages: args.messages,
      max_tokens: args.max_tokens ?? 180,
      stop: args.stop,
      temperature: args.temperature ?? 0.7,
      brain: gate.provider,
    });
    const text = content.trim();
    if (!text) return null;
    return { text, provider: gate.provider };
  } catch (err) {
    console.error('speak fell back', args.name, err instanceof Error ? err.message : err);
    return null;
  }
}
