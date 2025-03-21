"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { generate } from "generate-password";
import HomeIcon from "@mui/icons-material/Home";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import "@/app/styles/signup.css";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor!");
      return;
    }

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

  const generatePassword = () => {
    const newPassword = generate({
      length: 12,
      numbers: true,
      symbols: true,
      uppercase: true,
      lowercase: true,
    });
    setPassword(newPassword);
    setConfirmPassword(newPassword);
  };

  return (
    <div className="auth-page">
      <Link href="/" className="home-icon-link">
        <HomeIcon className="home-icon" />
      </Link>
      <main className="auth-main">
        <div className="auth-card">
          <h2 className="auth-title">Kayıt Ol</h2>

          {info && <div className="auth-info">{info}</div>}
          {error && <div className="auth-error">{error}</div>}

          <form onSubmit={handleSignup}>
            <input
              type="email"
              placeholder="E-posta adresi"
              className="auth-input"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <div className="password-container">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Şifre"
                className="auth-input"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </button>
            </div>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Şifreyi Onayla"
              className="auth-input"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <button
              type="button"
              className="generate-password-btn"
              onClick={generatePassword}
            >
              Şifre Oluştur
            </button>
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