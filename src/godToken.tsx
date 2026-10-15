import { createContext, useContext } from 'react';

const GodTokenContext = createContext<string | null>(null);

export const GodTokenProvider = GodTokenContext.Provider;

export function useGodToken() {
  return useContext(GodTokenContext);
}
