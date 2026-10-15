import { ConvexError } from 'convex/values';
import { DatabaseReader } from '../_generated/server';
import { safeEqual } from './pure';

export function allowlist() {
  return (process.env.GOD_ALLOWLIST || 'pgg124@gmail.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function sessionRow(db: DatabaseReader, token: string | undefined | null) {
  if (!token) return null;
  const row = await db
    .query('godSessions')
    .withIndex('token', (q) => q.eq('token', token))
    .unique();
  if (!row || row.expiresAt < Date.now()) return null;
  if (!allowlist().includes(row.email.toLowerCase())) return null;
  return row;
}

export async function sessionOk(db: DatabaseReader, token: string | undefined | null) {
  return (await sessionRow(db, token)) !== null;
}

export async function requireSession(db: DatabaseReader, token: string | undefined | null) {
  const row = await sessionRow(db, token);
  if (!row) throw new ConvexError('Sign in again.');
  return row;
}

export function checkLogin(email: string, passphrase: string) {
  const expected = process.env.GOD_PASSPHRASE;
  if (!expected) {
    throw new ConvexError('Set GOD_PASSPHRASE on the Convex deployment, then try again.');
  }
  const normalized = email.trim().toLowerCase();
  if (!allowlist().includes(normalized) || !safeEqual(passphrase, expected)) {
    throw new ConvexError('That login was refused.');
  }
  return normalized;
}
