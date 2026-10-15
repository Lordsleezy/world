import { FormEvent, ReactNode, useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { GodTokenProvider } from '../godToken';

const STORAGE_KEY = 'openbox-god-token';

export default function GodGate({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [email, setEmail] = useState('pgg124@gmail.com');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState('');
  const login = useMutation(api.openbox.god.login);

  if (token) {
    return <GodTokenProvider value={token}>{children}</GodTokenProvider>;
  }

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const result = await login({ email, passphrase });
      sessionStorage.setItem(STORAGE_KEY, result.token);
      setToken(result.token);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message.replace(/^\[CONVEX.*?\]\s*/, ''));
    }
  };

  return (
    <main className="min-h-screen bg-brown-900 text-brown-100 flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-brown-800 border-4 border-brown-900 p-6 shadow-solid">
        <h1 className="font-display text-4xl text-center">Open Box</h1>
        <p className="mt-3 text-sm leading-relaxed">
          This town is private. Only the allowlisted god can watch it, because the store district shows real business health.
        </p>
        <label className="block mt-4 text-xs">
          Email
          <input
            className="mt-1 w-full text-black px-2 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
        </label>
        <label className="block mt-3 text-xs">
          Passphrase
          <input
            className="mt-1 w-full text-black px-2 py-2"
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="mt-3 text-red-200 text-sm">{error}</p>}
        <button className="mt-4 w-full bg-clay-700 text-white py-3 font-display text-2xl" type="submit">
          Enter
        </button>
      </form>
    </main>
  );
}
