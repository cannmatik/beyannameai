"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import "../globals.css"; // Tek global import => tailwind + theme

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <div className="page-container">
      <header className="header-bar">
        <Link href="/">Ana Sayfa</Link>
      </header>

      <main className="main-content">
        <div className="card">
          <h2 className="card-title">Giriş Yap</h2>
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleLogin}>
            <input
              type="email"
              className="form-input"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <input
              type="password"
              className="form-input"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button type="submit" className="form-button">
              Giriş
            </button>
          </form>

          <p style={{ marginTop: "1rem" }}>
            Hesabınız yok mu?{" "}
            <Link href="/signup" style={{ fontWeight: 600, color: "#0d6efd" }}>
              Kayıt Ol
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
