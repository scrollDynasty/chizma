import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { ApiError, fetchMe, readToken, type User, writeToken } from "./api";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  signIn: (token: string, user: User) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(readToken);

  const me = useQuery({
    queryKey: ["me", token],
    queryFn: async ({ signal }) => {
      try {
        return await fetchMe(signal);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
          writeToken(null);
          setToken(null);
          return null;
        }
        throw error;
      }
    },
    enabled: token !== null,
    staleTime: 5 * 60_000,
    retry: false,
  });

  const signIn = useCallback(
    (newToken: string, user: User) => {
      writeToken(newToken);
      queryClient.setQueryData(["me", newToken], user);
      setToken(newToken);
    },
    [queryClient],
  );

  const signOut = useCallback(() => {
    writeToken(null);
    setToken(null);
    queryClient.removeQueries({ queryKey: ["me"] });
  }, [queryClient]);

  const value = useMemo<AuthState>(
    () => ({
      user: token ? (me.data ?? null) : null,
      isLoading: token !== null && me.isPending,
      signIn,
      signOut,
    }),
    [token, me.data, me.isPending, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside <AuthProvider>");
  return value;
}
