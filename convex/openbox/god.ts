import { ConvexError, v } from 'convex/values';
import { internal } from '../_generated/api';
import { mutation, query } from '../_generated/server';
import { startEngine, stopEngine } from '../aiTown/main';
import { Descriptions } from '../../data/characters';
import { checkLogin, requireSession, sessionOk } from './auth';
import { DAILY_LLM_BUDGET, PER_CHARACTER_LLM_BUDGET, pacificDayKey, sanitizeText } from './pure';

export const login = mutation({
  args: { email: v.string(), passphrase: v.string() },
  handler: async (ctx, args) => {
    const email = checkLogin(args.email, args.passphrase);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await ctx.db.insert('godSessions', {
      token,
      email,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    });
    return { token, email };
  },
});

export const panel = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    if (!(await sessionOk(ctx.db, args.token))) return null;
    const dayKey = pacificDayKey();
    const day = await ctx.db
      .query('llmDays')
      .withIndex('dayKey', (q) => q.eq('dayKey', dayKey))
      .unique();
    const clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    const world = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .first();
    const jobs = await ctx.db.query('townJobs').collect();
    const brains = await ctx.db.query('brains').collect();
    const perCharacter = await ctx.db
      .query('llmCharacters')
      .withIndex('day_name', (q) => q.eq('dayKey', dayKey))
      .collect();
    const builders = await ctx.db.query('builders').collect();
    const backups = await ctx.db.query('backupLog').order('desc').take(3);
    const used = day?.count ?? 0;
    return {
      budget: {
        used,
        limit: DAILY_LLM_BUDGET,
        remaining: Math.max(0, DAILY_LLM_BUDGET - used),
        perCharacterLimit: PER_CHARACTER_LLM_BUDGET,
        perCharacter: perCharacter.map((row) => ({ name: row.name, count: row.count })),
      },
      world: {
        status: world?.status ?? 'missing',
        weather: clock?.weather ?? 'cloud',
        floorNote: clock?.floorNote ?? 'not configured',
        lastFloor: clock?.lastFloor ?? 0,
        lastDrowsy: clock?.lastDrowsy ?? 0,
        pulses: clock?.pulses ?? 0,
        memoryWrites: clock?.memoryWrites ?? 0,
        saleText: clock?.saleText ?? '',
        focus: clock?.focus ?? 'neighborhood',
      },
      jobs: jobs.map((job) => ({ source: job.source, status: job.status, summary: job.summary })),
      brains: brains.map((b) => ({ name: b.name, provider: b.provider, tier: b.tier })),
      builders: builders.map((b) => ({
        name: b.name,
        status: b.status,
        url: b.url,
        summary: b.summary,
      })),
      backups: backups.map((b) => ({ at: b.at, note: b.note })),
      people: Descriptions.map((d) => d.name),
    };
  },
});

export const sheet = query({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    if (!(await sessionOk(ctx.db, args.token))) return null;
    const diary = await ctx.db
      .query('townDiary')
      .withIndex('name', (q) => q.eq('name', args.name))
      .order('desc')
      .take(8);
    const relations = await ctx.db
      .query('relationships')
      .withIndex('owner', (q) => q.eq('owner', args.name))
      .collect();
    const brain = await ctx.db
      .query('brains')
      .withIndex('name', (q) => q.eq('name', args.name))
      .unique();
    const player = await ctx.db
      .query('playerDescriptions')
      .filter((q) => q.eq(q.field('name'), args.name))
      .first();
    const memories = player
      ? await ctx.db
          .query('memories')
          .withIndex('playerId', (q) => q.eq('playerId', player.playerId))
          .order('desc')
          .take(6)
      : [];
    const person = Descriptions.find((d) => d.name === args.name);
    return {
      name: args.name,
      plan: person?.plan ?? '',
      tier: brain?.tier ?? person?.tier ?? 'main',
      brain: brain?.provider ?? person?.brain ?? 'gemini',
      job: person?.job ?? '',
      diary: diary.map((d) => ({ kind: d.kind, text: d.text, at: d.at })),
      relations: relations.map((r) => ({ other: r.other, score: r.score, opinion: r.opinion })),
      memories: memories.map((m) => ({ description: m.description, importance: m.importance, type: m.data.type })),
    };
  },
});

export const proclaim = mutation({
  args: { token: v.string(), text: v.string() },
  handler: async (ctx, args) => {
    await requireSession(ctx.db, args.token);
    const text = sanitizeText(args.text);
    if (!text) throw new ConvexError('Say something.');
    await ctx.scheduler.runAfter(0, internal.openbox.life.reactToSky, { text });
    return { ok: true };
  },
});

export const setBrain = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    provider: v.union(v.literal('gemini'), v.literal('ollama'), v.literal('haiku'), v.literal('grok')),
  },
  handler: async (ctx, args) => {
    await requireSession(ctx.db, args.token);
    if (!Descriptions.some((d) => d.name === args.name)) throw new ConvexError('Unknown person.');
    const existing = await ctx.db
      .query('brains')
      .withIndex('name', (q) => q.eq('name', args.name))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { provider: args.provider });
    else await ctx.db.insert('brains', { name: args.name, provider: args.provider, tier: 'main' });
    return { ok: true };
  },
});

export const setWorld = mutation({
  args: { token: v.string(), paused: v.boolean() },
  handler: async (ctx, args) => {
    await requireSession(ctx.db, args.token);
    const worldStatus = await ctx.db
      .query('worldStatus')
      .filter((q) => q.eq(q.field('isDefault'), true))
      .unique();
    if (!worldStatus) throw new ConvexError('World is not created yet.');
    if (args.paused) {
      await ctx.db.patch(worldStatus._id, { status: 'stoppedByDeveloper' });
      await stopEngine(ctx, worldStatus.worldId);
    } else {
      await ctx.db.patch(worldStatus._id, { status: 'running', lastViewed: Date.now() });
      await startEngine(ctx, worldStatus.worldId);
    }
    return { ok: true };
  },
});
