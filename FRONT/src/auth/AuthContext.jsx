import { createContext, useContext, useSyncExternalStore } from "react";
import { services } from "../api/index.js";

const AuthContext = createContext(null);

export function AuthProvider({ children, api = services }) {
  const session = useSyncExternalStore(api.session.subscribe, api.session.getSnapshot, api.session.getSnapshot);
  return <AuthContext.Provider value={{
    // Токен восстановлен локально; его действительность проверяется backend при запросах.
    hasSession: Boolean(session.token),
    username: session.username,
    login: api.auth.login,
    register: api.auth.register,
    logout: api.auth.logout,
  }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("Оберните приложение в AuthProvider");
  return auth;
}
