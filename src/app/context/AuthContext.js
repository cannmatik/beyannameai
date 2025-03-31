"use client";

import { createContext, useContext, useState, useEffect } from "react";
import { supabase, checkAdmin } from "@/lib/supabase";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [isAdmin, setIsAdmin] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAuthStatus = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      setUser(user);
      if (user) {
        const adminStatus = await checkAdmin();
        setIsAdmin(adminStatus);
      } else {
        setIsAdmin(false);
      }
      setLoading(false);
    };
    fetchAuthStatus();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setIsAdmin(null);
        setLoading(false);
      } else if (event === "SIGNED_IN") {
        setUser(session?.user);
        fetchAuthStatus();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ isAdmin, user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);