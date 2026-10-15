import { v } from 'convex/values';
import { internalMutation } from '../_generated/server';
import { Descriptions } from '../../data/characters';
import {
  DAILY_LLM_BUDGET,
  MIN_LLM_GAP_MS,
  PER_CHARACTER_LLM_BUDGET,
  pacificDayKey,
  type BrainName,
} from './pure';

const brains = new Set<BrainName>(['gemini', 'ollama', 'haiku', 'grok']);

export const reserve = internalMutation({
  args: {
    name: v.string(),
    brain: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const dayKey = pacificDayKey();
    const now = Date.now();
    const configured = await ctx.db
      .query('brains')
      .withIndex('name', (q) => q.eq('name', args.name))
      .unique();
    const person = Descriptions.find((d) => d.name === args.name);
    const requested = (args.brain || configured?.provider || person?.brain || 'gemini') as string;
    const provider = (brains.has(requested as BrainName) ? requested : 'gemini') as BrainName;

    const day = await ctx.db
      .query('llmDays')
      .withIndex('dayKey', (q) => q.eq('dayKey', dayKey))
      .unique();
    const used = day?.count ?? 0;
    if (used >= DAILY_LLM_BUDGET) {
      return { ok: false as const, reason: 'daily', provider, used, limit: DAILY_LLM_BUDGET };
    }
    if (day && now - day.lastAt < MIN_LLM_GAP_MS) {
      return { ok: false as const, reason: 'gap', provider, used, limit: DAILY_LLM_BUDGET };
    }
    const mine = await ctx.db
      .query('llmCharacters')
      .withIndex('day_name', (q) => q.eq('dayKey', dayKey).eq('name', args.name))
      .unique();
    if ((mine?.count ?? 0) >= PER_CHARACTER_LLM_BUDGET) {
      return { ok: false as const, reason: 'character', provider, used, limit: DAILY_LLM_BUDGET };
    }
    if (day) {
      await ctx.db.patch(day._id, { count: used + 1, lastAt: now });
    } else {
      await ctx.db.insert('llmDays', { dayKey, count: 1, lastAt: now });
    }
    if (mine) {
      await ctx.db.patch(mine._id, { count: mine.count + 1 });
    } else {
      await ctx.db.insert('llmCharacters', { dayKey, name: args.name, count: 1 });
    }
    return { ok: true as const, provider, used: used + 1, limit: DAILY_LLM_BUDGET };
  },
});
