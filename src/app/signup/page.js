"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import "@/app/styles/global-style.css";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: "http://localhost:3000/login",
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setInfo("Kayıt başarılı! Lütfen e-postanızı kontrol edin.");
    }
  };

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link href="/" className="auth-home-button">Ana Sayfa</Link>
      </header>

      <main className="auth-main">
        <div className="auth-card">
          <h2 className="auth-title">Kayıt Ol</h2>

          {info && <div className="auth-info">{info}</div>}
          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSignup} className="auth-form">
            <input
              type="email"
              placeholder="E-posta adresi"
              className="auth-input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              type="password"
              placeholder="Şifre"
              className="auth-input"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button type="submit" className="auth-button">
              Kayıt Ol
            </button>
          </form>

          <p className="auth-text">
            Zaten hesabınız var mı?{" "}
            <Link href="/login" className="auth-link">
              Giriş yap
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}