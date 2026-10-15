import { v } from 'convex/values';
import { internal } from '../_generated/api';
import { ActionCtx, internalAction, internalMutation, internalQuery } from '../_generated/server';
import { Descriptions, RelationshipSeeds } from '../../data/characters';
import {
  DAILY_LLM_BUDGET,
  diaryLine,
  importanceOf,
  pacificDayKey,
  pacificHour,
  pacificLabel,
  routineActivity,
  sanitizeFeed,
  sanitizeText,
  skyReaction,
  weatherFor,
  type JobStatus,
} from './pure';
import { speak } from './speak';
import { hashEmbedding } from './pure';
import { fetchEmbedding } from '../util/llm';

async function embed(text: string) {
  try {
    const { embedding } = await fetchEmbedding(text);
    if (embedding?.length === 1024) return embedding;
  } catch (err) {
    console.warn('embedding fallback', err instanceof Error ? err.message : err);
  }
  return hashEmbedding(text);
}

export const ensureSeeds = internalMutation({
  args: {},
  handler: async (ctx) => {
    for (const person of Descriptions) {
      const existing = await ctx.db
        .query('brains')
        .withIndex('name', (q) => q.eq('name', person.name))
        .unique();
      if (!existing) {
        await ctx.db.insert('brains', {
          name: person.name,
          provider: person.brain,
          tier: person.tier,
        });
      }
    }
    for (const seed of RelationshipSeeds) {
      const existing = await ctx.db
        .query('relationships')
        .withIndex('owner', (q) => q.eq('owner', seed.owner).eq('other', seed.other))
        .unique();
      if (!existing) {
        await ctx.db.insert('relationships', { ...seed, updatedAt: Date.now() });
      }
    }
    const clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    if (!clock) {
      await ctx.db.insert('worldClock', {
        key: 'default',
        lastDrowsy: 0,
        lastFloor: 0,
        floorNote: 'not configured',
        weather: 'cloud',
        lastPlanDay: '',
        lastReflectDay: '',
        lastBackupDay: '',
        memoryWrites: 0,
        pulses: 0,
        saleText: '',
        saleAt: 0,
        focus: 'neighborhood',
      });
    }
  },
});

export const playerRoutine = internalQuery({
  args: { worldId: v.id('worlds'), playerId: v.string() },
  handler: async (ctx, args) => {
    const desc = await ctx.db
      .query('playerDescriptions')
      .withIndex('worldId', (q) =>
        q.eq('worldId', args.worldId).eq('playerId', args.playerId),
      )
      .unique();
    if (!desc) return null;
    const person = Descriptions.find((d) => d.name === desc.name);
    const day = await ctx.db
      .query('llmDays')
      .withIndex('dayKey', (q) => q.eq('dayKey', pacificDayKey()))
      .unique();
    const clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    let jobStatus: JobStatus | undefined;
    if (person?.job && person.job !== 'mayor') {
      const job = await ctx.db
        .query('townJobs')
        .withIndex('source', (q) => q.eq('source', person.job!))
        .unique();
      jobStatus = job?.status;
    }
    const celebrating = !!clock?.saleText && Date.now() - (clock?.saleAt ?? 0) < 30 * 60_000;
    const used = day?.count ?? 0;
    return routineActivity({
      name: desc.name,
      job: person?.job,
      hour: pacificHour(),
      exhausted: used >= DAILY_LLM_BUDGET,
      jobStatus,
      celebrating: Boolean(person?.job && celebrating),
    });
  },
});

export const noteBond = internalMutation({
  args: { owner: v.string(), other: v.string() },
  handler: async (ctx, args) => {
    if (!args.other || args.owner === args.other) return;
    const row = await ctx.db
      .query('relationships')
      .withIndex('owner', (q) => q.eq('owner', args.owner).eq('other', args.other))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { score: Math.max(-5, Math.min(5, row.score + 1)), updatedAt: Date.now() });
    } else {
      await ctx.db.insert('relationships', {
        owner: args.owner,
        other: args.other,
        score: 1,
        opinion: `I keep running into ${args.other}.`,
        updatedAt: Date.now(),
      });
    }
  },
});

async function writeDiary(
  ctx: { db: any },
  name: string,
  kind: 'routine' | 'plan' | 'reflection' | 'god' | 'work',
  text: string,
) {
  await ctx.db.insert('townDiary', { name, at: Date.now(), kind, text: sanitizeText(text).slice(0, 240) });
}

export const tickDiary = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const hour = pacificHour(now);
    const dayKey = pacificDayKey(now);
    let clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    if (!clock) return { plan: false, reflect: false };
    const jobs = await ctx.db.query('townJobs').collect();
    for (const person of Descriptions) {
      const recent = await ctx.db
        .query('townDiary')
        .withIndex('name', (q) => q.eq('name', person.name))
        .order('desc')
        .first();
      if (recent && now - recent.at < 14 * 60_000) continue;
      const job = person.job ? jobs.find((j) => j.source === person.job) : undefined;
      const line = diaryLine(
        person.name,
        hour,
        job?.status,
        clock.saleText && now - clock.saleAt < 60 * 60_000 ? clock.saleText : undefined,
      );
      await writeDiary(ctx, person.name, job ? 'work' : 'routine', line);
    }
    const expired = await ctx.db.query('godSessions').collect();
    for (const row of expired) {
      if (row.expiresAt < now) await ctx.db.delete(row._id);
    }
    let backupNote = false;
    if (clock.lastBackupDay !== dayKey && hour === 4) {
      await ctx.db.insert('backupLog', {
        at: now,
        note: 'Export due. GitHub Action convex-export, or npx convex export.',
      });
      backupNote = true;
    }
    await ctx.db.patch(clock._id, {
      lastDrowsy: now,
      pulses: clock.pulses + 1,
      lastBackupDay: backupNote ? dayKey : clock.lastBackupDay,
    });
    clock = (await ctx.db.get(clock._id))!;
    return {
      plan: clock.lastPlanDay !== dayKey && hour >= 6 && hour < 9,
      reflect: clock.lastReflectDay !== dayKey && hour >= 22,
    };
  },
});

export const applyFloor = internalMutation({
  args: {
    note: v.string(),
    jobs: v.array(
      v.object({
        source: v.string(),
        status: v.union(v.literal('green'), v.literal('red'), v.literal('unknown')),
        summary: v.string(),
      }),
    ),
    sales: v.array(v.object({ channel: v.string(), amount: v.number(), text: v.string() })),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const job of args.jobs) {
      const summary = sanitizeText(job.summary);
      const existing = await ctx.db
        .query('townJobs')
        .withIndex('source', (q) => q.eq('source', job.source))
        .unique();
      if (existing) {
        await ctx.db.patch(existing._id, { status: job.status, summary, updatedAt: now });
      } else {
        await ctx.db.insert('townJobs', { source: job.source, status: job.status, summary, updatedAt: now });
      }
      const worker = Descriptions.find((d) => d.job === job.source);
      if (worker) {
        await writeDiary(
          ctx,
          worker.name,
          'work',
          job.status === 'red'
            ? `${worker.name} found their work in trouble.`
            : `${worker.name} finished a round of work. ${summary}`.slice(0, 240),
        );
      }
    }
    const clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    const latestSale = args.sales[0];
    const jobs = await ctx.db.query('townJobs').collect();
    const weather = weatherFor(
      jobs,
      !!latestSale || (!!clock?.saleText && now - (clock?.saleAt ?? 0) < 6 * 60 * 60_000),
    );
    if (clock) {
      await ctx.db.patch(clock._id, {
        lastFloor: now,
        floorNote: sanitizeText(args.note).slice(0, 120),
        weather,
        saleText: latestSale ? latestSale.text : clock.saleText,
        saleAt: latestSale ? now : clock.saleAt,
      });
    }
    if (latestSale) {
      for (const person of Descriptions.filter((d) => d.job)) {
        await writeDiary(ctx, person.name, 'work', `${person.name} heard that ${latestSale.text}.`);
      }
    }
  },
});

export const applyMinds = internalMutation({
  args: {
    dayKey: v.string(),
    kind: v.union(v.literal('plan'), v.literal('reflection')),
    lines: v.array(
      v.object({
        name: v.string(),
        text: v.string(),
        embedding: v.array(v.float64()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    let memoryWrites = clock?.memoryWrites ?? 0;
    for (const line of args.lines) {
      const text = sanitizeText(line.text);
      if (!text) continue;
      await writeDiary(ctx, line.name, args.kind, text);
      const player = await ctx.db
        .query('playerDescriptions')
        .filter((q) => q.eq(q.field('name'), line.name))
        .first();
      if (!player) continue;
      const world = await ctx.db.get(player.worldId);
      const owned = world?.agents.find((agent) => agent.playerId === player.playerId);
      if (args.kind === 'plan' && owned) {
        const desc = await ctx.db
          .query('agentDescriptions')
          .withIndex('worldId', (q) => q.eq('worldId', player.worldId).eq('agentId', owned.id))
          .unique();
        if (desc) await ctx.db.patch(desc._id, { plan: text.slice(0, 240) });
      }
      if (args.kind === 'reflection' && line.embedding.length > 0) {
        const embeddingId = await ctx.db.insert('memoryEmbeddings', {
          playerId: player.playerId,
          embedding: line.embedding,
        });
        await ctx.db.insert('memories', {
          playerId: player.playerId,
          description: text,
          embeddingId,
          importance: importanceOf(text),
          lastAccess: Date.now(),
          data: { type: 'reflection', relatedMemoryIds: [] },
        });
        memoryWrites += 1;
        const mentioned = Descriptions.map((d) => d.name).find(
          (name) => name !== line.name && text.includes(name),
        );
        if (mentioned) {
          const rel = await ctx.db
            .query('relationships')
            .withIndex('owner', (q) => q.eq('owner', line.name).eq('other', mentioned))
            .unique();
          if (rel) await ctx.db.patch(rel._id, { opinion: text.slice(0, 180), updatedAt: Date.now() });
        }
      }
    }
    if (clock) {
      await ctx.db.patch(clock._id, {
        memoryWrites,
        lastPlanDay: args.kind === 'plan' ? args.dayKey : clock.lastPlanDay,
        lastReflectDay: args.kind === 'reflection' ? args.dayKey : clock.lastReflectDay,
      });
    }
  },
});

export const saveBuilders = internalMutation({
  args: {
    rows: v.array(
      v.object({
        externalId: v.string(),
        name: v.string(),
        status: v.string(),
        url: v.string(),
        updatedAt: v.string(),
        summary: v.string(),
      }),
    ),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      const existing = await ctx.db
        .query('builders')
        .withIndex('externalId', (q) => q.eq('externalId', row.externalId))
        .unique();
      if (existing) await ctx.db.patch(existing._id, row);
      else await ctx.db.insert('builders', row);
    }
    const clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    if (clock && args.note) {
      await ctx.db.patch(clock._id, { focus: args.note.slice(0, 80) });
    }
  },
});

export const clockFlags = internalQuery({
  args: {},
  handler: async (ctx) => {
    const clock = await ctx.db
      .query('worldClock')
      .withIndex('key', (q) => q.eq('key', 'default'))
      .unique();
    return clock;
  },
});

async function pullFloor(ctx: ActionCtx) {
  const url = process.env.FLOOR_READ_URL;
  const token = process.env.FLOOR_READ_TOKEN;
  if (!url || !token) {
    await ctx.runMutation(internal.openbox.life.applyFloor, {
      note: 'not configured',
      jobs: [],
      sales: [],
    });
    return;
  }
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`floor ${res.status}`);
    const clean = sanitizeFeed(await res.json());
    await ctx.runMutation(internal.openbox.life.applyFloor, {
      note: 'read ok',
      jobs: clean.jobs,
      sales: clean.sales,
    });
  } catch (err) {
    console.error('floor read failed', err instanceof Error ? err.message : err);
    await ctx.runMutation(internal.openbox.life.applyFloor, {
      note: 'read failed',
      jobs: [],
      sales: [],
    });
  }
}

async function syncBuilders(ctx: ActionCtx) {
  const key = process.env.CURSOR_API_KEY;
  if (!key) {
    await ctx.runMutation(internal.openbox.life.saveBuilders, { rows: [], note: 'builders waiting on a key' });
    return;
  }
  // View only. This function must never create or message an agent.
  const res = await fetch('https://api.cursor.com/v1/agents?limit=20&includeArchived=false', {
    method: 'GET',
    headers: { Authorization: 'Basic ' + btoa(`${key}:`) },
  });
  if (!res.ok) {
    await ctx.runMutation(internal.openbox.life.saveBuilders, {
      rows: [],
      note: `builders list ${res.status}`,
    });
    return;
  }
  const body = (await res.json()) as { items?: Record<string, unknown>[] };
  const rows = (body.items ?? []).slice(0, 20).map((item) => ({
    externalId: String(item.id ?? '').slice(0, 80),
    name: sanitizeText(String(item.name ?? 'builder')).slice(0, 120) || 'builder',
    status: String(item.status ?? 'UNKNOWN').slice(0, 24),
    url: String(item.url ?? '').slice(0, 200),
    updatedAt: String(item.updatedAt ?? ''),
    summary:
      String(item.status) === 'ACTIVE'
        ? 'working'
        : String(item.status) === 'ARCHIVED'
          ? 'put away'
          : 'finished a turn',
  })).filter((row) => row.externalId);
  await ctx.runMutation(internal.openbox.life.saveBuilders, { rows, note: `${rows.length} builders` });
}

async function packLines(lines: { name: string; text: string }[], withEmbedding: boolean) {
  const packed = [];
  for (const line of lines) {
    packed.push({
      name: line.name,
      text: line.text,
      embedding: withEmbedding ? await embed(line.text) : [],
    });
  }
  return packed;
}

function parseNamedLines(content: string) {
  const lines: { name: string; text: string }[] = [];
  for (const raw of content.split('\n')) {
    const match = raw.match(/^([A-Za-z]+)\s*:\s*(.+)$/);
    if (!match) continue;
    if (!Descriptions.some((d) => d.name === match[1])) continue;
    lines.push({ name: match[1], text: match[2].trim().slice(0, 220) });
  }
  return lines;
}

async function batchMinds(ctx: ActionCtx, kind: 'plan' | 'reflection') {
  const dayKey = pacificDayKey();
  const label = pacificLabel();
  const roster = Descriptions.map((d) => `${d.name}: ${d.plan}`).join('\n');
  const ask =
    kind === 'plan'
      ? `It is morning (${label}) in their real town. Write one short plan for each person, in their own stubborn voice. They do not worship the voice from the sky. Format exactly:\nName: plan`
      : `It is late (${label}). Each person reflects on the day and may form one opinion. They can dislike each other or the sky voice. Format exactly:\nName: belief`;
  const spoken = await speak(ctx, {
    name: 'Sentinel',
    max_tokens: 700,
    temperature: 0.8,
    messages: [
      {
        role: 'system',
        content:
          'You write private thoughts for people who believe their town is real. No mention of models, prompts, or simulation. Plain lines only.',
      },
      { role: 'user', content: `${ask}\n\nPeople:\n${roster}` },
    ],
  });
  const lines = spoken
    ? parseNamedLines(spoken.text)
    : Descriptions.map((d) => ({
        name: d.name,
        text: kind === 'plan' ? d.plan : `${d.name} ended the day with their own opinion intact.`,
      }));
  await ctx.runMutation(internal.openbox.life.applyMinds, {
    dayKey,
    kind,
    lines: await packLines(lines, kind === 'reflection'),
  });
}

export const reactToSky = internalAction({
  args: { text: v.string() },
  handler: async (ctx, args) => {
    const heard = sanitizeText(args.text).slice(0, 280);
    const spoken = await speak(ctx, {
      name: 'Sentinel',
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content:
            'People in a real town just heard a voice from the sky. They may disagree, shrug, or talk back. They do not worship it. One line each, format Name: reaction.',
        },
        { role: 'user', content: `The sky said: ${heard}` },
      ],
    });
    const lines = spoken
      ? parseNamedLines(spoken.text)
      : Descriptions.map((d) => ({ name: d.name, text: skyReaction(d.name) }));
    const covered = new Set(lines.map((l) => l.name));
    for (const person of Descriptions) {
      if (!covered.has(person.name)) lines.push({ name: person.name, text: skyReaction(person.name) });
    }
    await ctx.runMutation(internal.openbox.life.applyMinds, {
      dayKey: pacificDayKey(),
      kind: 'reflection',
      lines: await packLines(
        lines.map((l) => ({ name: l.name, text: `The sky said "${heard}". ${l.text}` })),
        true,
      ),
    });
  },
});

export const drowsyPulse = internalAction({
  args: {},
  handler: async (ctx) => {
    await ctx.runMutation(internal.openbox.life.ensureSeeds, {});
    const flags = await ctx.runMutation(internal.openbox.life.tickDiary, {});
    await pullFloor(ctx);
    await syncBuilders(ctx);
    if (flags.plan) await batchMinds(ctx, 'plan');
    if (flags.reflect) await batchMinds(ctx, 'reflection');
  },
});
