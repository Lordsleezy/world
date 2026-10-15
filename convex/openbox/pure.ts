/** Pure town rules. No database, no network, no paid calls. */

export const DAILY_LLM_BUDGET = 320;
export const PER_CHARACTER_LLM_BUDGET = 24;
export const MIN_LLM_GAP_MS = 5_000;

export type BrainName = 'gemini' | 'ollama' | 'haiku' | 'grok';
export type JobStatus = 'green' | 'red' | 'unknown';

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const STREET = /\b\d{1,6}\s+[A-Za-z0-9.'-]+(?:\s+[A-Za-z0-9.'-]+){0,3}\s(?:St|Street|Ave|Avenue|Rd|Road|Blvd|Dr|Drive|Lane|Ln|Way|Ct|Court)\b\.?/gi;
const PRIVATE_LABEL = /\b(buyer|customer|recipient|ship\s*to|address|email|phone)\b[:\s#-]*[^\n,;]{0,80}/gi;

export function pacificParts(now = Date.now()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const bag: Record<string, string> = {};
  for (const part of fmt.formatToParts(new Date(now))) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  return {
    hour: Number(bag.hour ?? 0),
    minute: Number(bag.minute ?? 0),
    weekday: bag.weekday ?? '',
    dayKey: `${bag.year}-${bag.month}-${bag.day}`,
  };
}

export function pacificDayKey(now = Date.now()) {
  return pacificParts(now).dayKey;
}

export function pacificHour(now = Date.now()) {
  return pacificParts(now).hour;
}

export function pacificLabel(now = Date.now()) {
  const p = pacificParts(now);
  const h = p.hour % 12 || 12;
  const ampm = p.hour < 12 ? 'am' : 'pm';
  return `${p.weekday} ${h}:${String(p.minute).padStart(2, '0')}${ampm} Pacific`;
}

/** Strip anything a brain should never see. */
export function sanitizeText(input: string) {
  return input
    .replace(EMAIL, '[private]')
    .replace(PHONE, '[private]')
    .replace(STREET, '[private]')
    .replace(PRIVATE_LABEL, '[private]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
}

export function looksPrivate(input: string) {
  return /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(input) || /@/.test(input);
}

const DROP_KEYS = /buyer|email|address|phone|name|recipient|token|secret|password/i;

export function sanitizeFeed(body: unknown): {
  jobs: { source: string; status: JobStatus; summary: string }[];
  sales: { channel: string; amount: number; text: string }[];
} {
  const jobs: { source: string; status: JobStatus; summary: string }[] = [];
  const sales: { channel: string; amount: number; text: string }[] = [];
  if (!body || typeof body !== 'object') return { jobs, sales };
  const raw = body as { jobs?: unknown; sales?: unknown };
  if (Array.isArray(raw.jobs)) {
    for (const row of raw.jobs) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const source = String(rec.source ?? '').slice(0, 40);
      if (!source) continue;
      const level = String(rec.level ?? rec.status ?? 'info');
      const status: JobStatus = level === 'error' || level === 'red' ? 'red' : 'green';
      const summary = sanitizeText(String(rec.summary ?? rec.message ?? rec.event ?? source));
      if (looksPrivate(summary)) continue;
      jobs.push({ source, status, summary: summary || source });
    }
  }
  if (Array.isArray(raw.sales)) {
    for (const row of raw.sales) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      for (const key of Object.keys(rec)) {
        if (DROP_KEYS.test(key) && key !== 'channel') delete rec[key];
      }
      const channel = sanitizeText(String(rec.channel ?? 'the market')).slice(0, 24) || 'the market';
      const amount = Number(rec.amount);
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000) continue;
      const dollars = Math.round(amount);
      const item = sanitizeText(String(rec.item ?? 'an item'));
      const noun = !item || item === '[private]' || looksPrivate(item) ? 'an item' : item;
      sales.push({
        channel,
        amount: dollars,
        text: `${noun} sold on ${channel} for $${dollars}`,
      });
    }
  }
  return { jobs, sales };
}

export function weatherFor(jobs: { status: JobStatus }[], recentSale: boolean): 'sun' | 'cloud' | 'storm' {
  if (jobs.some((j) => j.status === 'red')) return 'storm';
  if (recentSale && jobs.length > 0 && jobs.every((j) => j.status === 'green')) return 'sun';
  if (recentSale) return 'sun';
  return 'cloud';
}

export function importanceOf(text: string) {
  const t = text.toLowerCase();
  if (/collapse|storm|grudge|crush|sold|warning|sky/.test(t)) return 8;
  if (/reflect|believe|opinion|rival|friend/.test(t)) return 6;
  if (/conversation|talked|argu/.test(t)) return 5;
  return 2;
}

export function hashEmbedding(text: string, dimensions = 1024) {
  const values = new Array<number>(dimensions).fill(0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const grams = tokens.length ? tokens : ['empty'];
  for (const token of grams) {
    let h = 2166136261;
    for (let i = 0; i < token.length; i++) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % dimensions;
    values[idx] += (h & 1) === 0 ? 1 : -1;
  }
  let norm = 0;
  for (const n of values) norm += n * n;
  norm = Math.sqrt(norm) || 1;
  return values.map((n) => n / norm);
}

export type Routine = { description: string; emoji: string; duration: number; social: boolean };

const SLEEP: Routine = { description: 'asleep at home', emoji: '💤', duration: 5 * 60_000, social: false };
const TIRED: Routine = {
  description: 'turning in early. everyone is tired',
  emoji: '🌙',
  duration: 5 * 60_000,
  social: false,
};

export function routineActivity(opts: {
  name: string;
  job?: string;
  hour: number;
  exhausted: boolean;
  jobStatus?: JobStatus;
  celebrating?: boolean;
}): Routine {
  if (opts.exhausted) return TIRED;
  const hour = opts.hour;
  if (hour >= 23 || hour < 6) return SLEEP;
  if (opts.job && opts.jobStatus === 'red' && hour >= 8 && hour < 18) {
    return {
      description: 'slumped at the desk, a warning over their head',
      emoji: '⚠️',
      duration: 4 * 60_000,
      social: false,
    };
  }
  if (opts.celebrating && hour >= 8 && hour < 20) {
    return { description: 'cheering a sale and counting coins', emoji: '🪙', duration: 3 * 60_000, social: true };
  }
  if (hour < 8) {
    return { description: 'waking up and making a plan', emoji: '🌅', duration: 3 * 60_000, social: false };
  }
  if (hour < 12) {
    return workRoutine(opts.name, opts.job, 'morning');
  }
  if (hour < 14) {
    return { description: 'eating lunch and listening to gossip', emoji: '🍞', duration: 3 * 60_000, social: true };
  }
  if (hour < 18) {
    return workRoutine(opts.name, opts.job, 'afternoon');
  }
  if (hour < 21) {
    return { description: 'wandering the street and talking', emoji: '💬', duration: 3 * 60_000, social: true };
  }
  return { description: 'heading home for the night', emoji: '🏠', duration: 4 * 60_000, social: false };
}

function workRoutine(name: string, job: string | undefined, half: 'morning' | 'afternoon'): Routine {
  const table: Record<string, [string, string]> = {
    Sentinel: ['walking the blocks, checking on everyone', '🧭'],
    Ellis: ['sorting the morning post at the eBay desk', '📦'],
    Amara: ['opening the Amazon stall and counting stock', '🏪'],
    Maren: ['carrying letters from Depop and Mercari', '✉️'],
    Felix: ['reconciling fees in a tight little ledger', '📒'],
    Crier: ['reading the alert bell and deciding what to shout', '🔔'],
    Nia: ['baking the first loaves', '🥖'],
    Otto: ['planing a board in the workshop', '🪵'],
    Jun: ['shelving books and eavesdropping politely', '📚'],
    Rosa: ['weeding the common garden', '🌿'],
    Cal: ['checking locks before the day gets loud', '🔦'],
    Wren: ['sketching a mural only they understand', '🎨'],
    Hana: ['pulling espresso and judging the weather', '☕'],
    Moss: ['mending a net by the river', '🐟'],
  };
  const row = table[name] ?? ['working at their own pace', '🛠️'];
  const description = half === 'afternoon' ? row[0].replace('morning', 'afternoon') : row[0];
  return {
    description: job ? description : description,
    emoji: row[1],
    duration: 4 * 60_000,
    social: false,
  };
}

export function scriptedLine(name: string, hour = pacificHour()) {
  if (hour >= 23 || hour < 6) {
    return 'I should be asleep. Say it again in the morning.';
  }
  const lines: Record<string, string> = {
    Sentinel: 'I heard you. I will not pretend that makes you right.',
    Ellis: 'Make it quick. The desk is already a mess.',
    Amara: 'If this is about the stall, speak plainly.',
    Maren: 'I have letters to deliver. Talk while you walk.',
    Felix: 'I will believe it when it is in the ledger.',
    Crier: 'Should I ring the bell, or is this just for me?',
    Nia: 'You can have a heel of bread and one honest sentence.',
    Otto: 'I am in the middle of a cut. Hold the thought.',
    Jun: 'That is interesting. It is not necessarily true.',
    Rosa: 'The garden does not care. I might.',
    Cal: 'Keep your voice down. Some of us are listening for trouble.',
    Wren: 'I will paint it the way I saw it, not the way you said it.',
    Hana: 'Sit down or order something. I am not a podium.',
    Moss: 'The river is louder than you. Try again.',
  };
  return lines[name] ?? 'I have my own day to finish.';
}

export function skyReaction(name: string) {
  const lines: Record<string, string> = {
    Sentinel: 'The sky spoke. I will think about it, and I may ignore it.',
    Ellis: 'A voice from nowhere does not clear my queue.',
    Amara: 'If the sky wants a discount, the answer is no.',
    Maren: 'I deliver letters. I do not deliver commandments.',
    Felix: 'Unrecorded. Therefore not yet real.',
    Crier: 'I might shout it. I might not. It depends if it is true.',
    Nia: 'I nodded, then went back to the oven.',
    Otto: 'I do not take orders from weather.',
    Jun: 'I wrote it down as a claim, not a fact.',
    Rosa: 'The plants did not look up.',
    Cal: 'I checked the roofs. No one was standing on them.',
    Wren: 'I will use the words only if they fit the wall.',
    Hana: 'I wiped the counter and did not answer.',
    Moss: 'Sounded like wind. Might have been a person. Same difference.',
  };
  return lines[name] ?? 'I heard something. I have not decided what I think.';
}

export function diaryLine(name: string, hour: number, jobStatus?: JobStatus, saleText?: string) {
  if (saleText && hour >= 8 && hour < 21) return `${name} heard that ${saleText}.`;
  if (jobStatus === 'red' && hour >= 8 && hour < 18) {
    return `${name} found the work in trouble and could not pretend otherwise.`;
  }
  if (hour < 6 || hour >= 23) return `${name} slept. The town kept its own hours.`;
  if (hour < 8) return `${name} woke and decided what the day was for.`;
  if (hour < 18) return `${name} spent the working hours on their own tasks.`;
  return `${name} lingered in the street as the light went.`;
}

export function safeEqual(a: string, b: string) {
  const left = Array.from(a);
  const right = Array.from(b);
  let diff = left.length ^ right.length;
  const n = Math.max(left.length, right.length);
  for (let i = 0; i < n; i++) {
    diff |= (left[i] ?? '').charCodeAt(0) ^ (right[i] ?? '').charCodeAt(0);
  }
  return diff === 0;
}
