import { FormEvent, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { useGodToken } from '../godToken';

function pacificHour() {
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return Number(hour);
}

export function skyClass(weather: string | undefined) {
  const hour = pacificHour();
  const night = hour >= 20 || hour < 6;
  const dusk = hour >= 18 && hour < 20;
  if (weather === 'storm') return night ? 'sky-storm sky-night' : 'sky-storm';
  if (night) return 'sky-night';
  if (dusk) return 'sky-dusk';
  if (weather === 'sun') return 'sky-sun';
  return 'sky-cloud';
}

export default function GodPanel() {
  const token = useGodToken() ?? '';
  const panel = useQuery(api.openbox.god.panel, token ? { token } : 'skip');
  const proclaim = useMutation(api.openbox.god.proclaim);
  const setWorld = useMutation(api.openbox.god.setWorld);
  const [sky, setSky] = useState('');
  const [note, setNote] = useState('');

  if (!panel) return null;
  const paused = panel.world.status === 'stoppedByDeveloper';

  const onSky = async (event: FormEvent) => {
    event.preventDefault();
    if (!sky.trim()) return;
    await proclaim({ token, text: sky.trim() });
    setSky('');
    setNote('They heard you. They may disagree.');
  };

  return (
    <section className="mb-4 text-sm leading-snug">
      <h2 className="font-display text-2xl">God panel</h2>
      <p className="mt-1">
        Brains {panel.budget.used}/{panel.budget.limit} today, {panel.budget.remaining} left.
        {panel.budget.remaining === 0 ? ' The town is turning in early.' : ''}
      </p>
      <p>
        World {panel.world.status}. Weather {panel.world.weather}. Floor: {panel.world.floorNote}.
        Drowsy pulses {panel.world.pulses}. Memories written {panel.world.memoryWrites}.
      </p>
      <p className="text-xs opacity-80">
        Convex free tier is about 1M function calls, 20 GB-hours, and 0.5 GB of database a month.
        Live seconds only run while this page is open. Exact usage is in the Convex dashboard.
      </p>
      <div className="mt-2 flex gap-2">
        <button
          className="bg-clay-700 text-white px-3 py-2"
          onClick={() => setWorld({ token, paused: !paused })}
        >
          {paused ? 'Resume town' : 'Pause town'}
        </button>
      </div>
      <ul className="mt-3 space-y-1">
        {panel.jobs.map((job) => (
          <li key={job.source}>
            {job.status === 'red' ? '⚠' : '●'} {job.source}: {job.summary}
          </li>
        ))}
        {panel.jobs.length === 0 && <li>Store district is waiting for a read-only key.</li>}
      </ul>
      {panel.world.saleText && <p className="mt-2">Latest: {panel.world.saleText}</p>}
      <h3 className="mt-3 font-display text-xl">Workshop</h3>
      <ul className="space-y-1">
        {panel.builders.map((builder) => (
          <li key={builder.name + builder.status}>
            {builder.name} — {builder.summary}
            {builder.url ? (
              <>
                {' '}
                <a className="underline" href={builder.url} target="_blank" rel="noreferrer">
                  open
                </a>
              </>
            ) : null}
          </li>
        ))}
        {panel.builders.length === 0 && <li>{panel.world.focus}</li>}
      </ul>
      <form onSubmit={onSky} className="mt-3">
        <label className="block text-xs">
          Speak from the sky
          <input
            className="mt-1 w-full text-black px-2 py-1"
            value={sky}
            onChange={(e) => setSky(e.target.value)}
            maxLength={280}
          />
        </label>
        <button className="mt-2 bg-brown-700 px-3 py-2" type="submit">
          Say it
        </button>
        {note && <p className="mt-1">{note}</p>}
      </form>
    </section>
  );
}
