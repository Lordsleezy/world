import { ReactNode } from 'react';
import { ConvexReactClient, ConvexProvider } from 'convex/react';

function SetupScreen() {
  return (
    <main className="min-h-screen bg-brown-900 text-brown-100 p-8 max-w-2xl mx-auto">
      <h1 className="font-display text-5xl">Open Box</h1>
      <p className="mt-4">
        The town frontend is built. It starts living after a Convex deployment URL is set as
        VITE_CONVEX_URL and the site is rebuilt.
      </p>
    </main>
  );
}

export default function ConvexClientProvider({ children }: { children: ReactNode }) {
  const url = import.meta.env.VITE_CONVEX_URL as string | undefined;
  if (!url) return <SetupScreen />;
  const convex = new ConvexReactClient(url, { unsavedChangesWarning: false });
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
