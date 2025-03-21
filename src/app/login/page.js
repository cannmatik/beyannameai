"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import HomeIcon from "@mui/icons-material/Home";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import "@/app/styles/login.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

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

  const handleForgotPassword = () => {
    alert("Bu özellik şu an kullanım dışı, çok yakında!");
  };

  return (
    <div
      className="page-container"
      style={{ background: "linear-gradient(135deg, #ffffff 0%, #f8ebeb 100%)" }} // Inline stil
    >
      <Link href="/" className="home-icon-link">
        <HomeIcon className="home-icon" />
      </Link>
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
            <div className="password-container">
              <input
                type={showPassword ? "text" : "password"}
                className="form-input"
                placeholder="Şifre"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </button>
            </div>
            <div className="options-container">
              <label className="remember-me">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                />
                Beni Hatırla
              </label>
              <span className="forgot-password-link" onClick={handleForgotPassword}>
                Şifremi Unuttum
              </span>
            </div>
            <button type="submit" className="form-button">
              Giriş
            </button>
          </form>

          <p className="auth-text">
            Hesabınız yok mu?{" "}
            <Link href="/signup" className="auth-link">
              Kayıt Ol
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}