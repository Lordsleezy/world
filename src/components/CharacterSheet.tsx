import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useGodToken } from '../godToken';

const BRAINS = ['gemini', 'ollama', 'haiku', 'grok'] as const;

export default function CharacterSheet({ name }: { name: string }) {
  const token = useGodToken() ?? '';
  const sheet = useQuery(api.openbox.god.sheet, token && name ? { token, name } : 'skip');
  const setBrain = useMutation(api.openbox.god.setBrain);
  if (!sheet) return null;
  return (
    <div className="mt-4 text-sm space-y-3">
      <p>
        Brain{' '}
        <select
          className="text-black"
          value={sheet.brain}
          onChange={(e) =>
            setBrain({
              token,
              name,
              provider: e.target.value as (typeof BRAINS)[number],
            })
          }
        >
          {BRAINS.map((brain) => (
            <option key={brain} value={brain}>
              {brain}
            </option>
          ))}
        </select>
        {sheet.tier === 'main' ? ' · main character' : ' · citizen'}
        {sheet.job ? ` · ${sheet.job}` : ''}
      </p>
      <div>
        <h3 className="font-display text-xl">Plan</h3>
        <p>{sheet.diary.find((row) => row.kind === 'plan')?.text ?? sheet.plan}</p>
      </div>
      <div>
        <h3 className="font-display text-xl">Lately</h3>
        <ul>
          {sheet.diary.map((row) => (
            <li key={row.at}>
              {row.kind}: {row.text}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="font-display text-xl">Memories</h3>
        <ul>
          {sheet.memories.map((row) => (
            <li key={row.description}>
              ({row.type}, {row.importance}) {row.description}
            </li>
          ))}
          {sheet.memories.length === 0 && <li>Nothing important enough to keep yet.</li>}
        </ul>
      </div>
      <div>
        <h3 className="font-display text-xl">Relationships</h3>
        <ul>
          {sheet.relations.map((row) => (
            <li key={row.other}>
              {row.other} ({row.score > 0 ? '+' : ''}
              {row.score}): {row.opinion}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
