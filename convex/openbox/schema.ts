import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const openboxTables = {
  godSessions: defineTable({
    token: v.string(),
    email: v.string(),
    expiresAt: v.number(),
  }).index('token', ['token']),

  llmDays: defineTable({
    dayKey: v.string(),
    count: v.number(),
    lastAt: v.number(),
  }).index('dayKey', ['dayKey']),

  llmCharacters: defineTable({
    dayKey: v.string(),
    name: v.string(),
    count: v.number(),
  }).index('day_name', ['dayKey', 'name']),

  brains: defineTable({
    name: v.string(),
    provider: v.union(
      v.literal('gemini'),
      v.literal('ollama'),
      v.literal('haiku'),
      v.literal('grok'),
    ),
    tier: v.union(v.literal('main'), v.literal('citizen')),
  }).index('name', ['name']),

  townJobs: defineTable({
    source: v.string(),
    status: v.union(v.literal('green'), v.literal('red'), v.literal('unknown')),
    summary: v.string(),
    updatedAt: v.number(),
  }).index('source', ['source']),

  townDiary: defineTable({
    name: v.string(),
    at: v.number(),
    kind: v.union(
      v.literal('routine'),
      v.literal('plan'),
      v.literal('reflection'),
      v.literal('god'),
      v.literal('work'),
    ),
    text: v.string(),
  }).index('name', ['name', 'at']),

  relationships: defineTable({
    owner: v.string(),
    other: v.string(),
    score: v.number(),
    opinion: v.string(),
    updatedAt: v.number(),
  }).index('owner', ['owner', 'other']),

  builders: defineTable({
    externalId: v.string(),
    name: v.string(),
    status: v.string(),
    url: v.string(),
    updatedAt: v.string(),
    summary: v.string(),
  }).index('externalId', ['externalId']),

  worldClock: defineTable({
    key: v.string(),
    lastDrowsy: v.number(),
    lastFloor: v.number(),
    floorNote: v.string(),
    weather: v.union(v.literal('sun'), v.literal('cloud'), v.literal('storm')),
    lastPlanDay: v.string(),
    lastReflectDay: v.string(),
    lastBackupDay: v.string(),
    memoryWrites: v.number(),
    pulses: v.number(),
    saleText: v.string(),
    saleAt: v.number(),
    focus: v.optional(v.string()),
  }).index('key', ['key']),

  backupLog: defineTable({
    at: v.number(),
    note: v.string(),
  }),
};
