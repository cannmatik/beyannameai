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
  const [passwordStrength, setPasswordStrength] = useState(2); // 0: Basit, 1: Orta, 2: Güçlü

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
    let length = 8;
    let options = { numbers: true, uppercase: true, lowercase: true };

    if (passwordStrength === 1) { // Orta
      length = 10;
      options.symbols = true;
    } else if (passwordStrength === 2) { // Güçlü
      length = 12;
      options.symbols = true;
    }

    const newPassword = generate({ length, ...options });
    setPassword(newPassword);
    setConfirmPassword(newPassword);
  };

  const strengthLabels = ["Basit", "Orta", "Güçlü"];

  return (
    <div
      className="auth-page"
      style={{ background: "linear-gradient(135deg, #ffffff 0%, #f8ebeb 100%)" }}
    >
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
            <div className="password-container">
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
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </button>
            </div>
            <div className="password-strength-container">
              <div className="strength-slider">
                <input
                  type="range"
                  min="0"
                  max="2"
                  value={passwordStrength}
                  onChange={(e) => setPasswordStrength(parseInt(e.target.value))}
                  className="strength-range"
                />
                <div className="strength-labels">
                  {strengthLabels.map((label, index) => (
                    <span key={index} className={passwordStrength === index ? "active" : ""}>
                      {label}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                className="generate-password-btn"
                onClick={generatePassword}
              >
                Şifre Oluştur
              </button>
            </div>
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