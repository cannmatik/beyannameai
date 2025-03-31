"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { generate } from "generate-password";
import {
  TextField,
  Button,
  Box,
  Typography,
  InputAdornment,
  IconButton,
  Slider,
} from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import "@/app/styles/signup.css";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLength, setPasswordLength] = useState(12); // Varsayılan şifre uzunluğu
  const [showPasswordGenerator, setShowPasswordGenerator] = useState(false); // Şifre oluşturma alanını kontrol eden state

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
      length: passwordLength,
      numbers: true,
      symbols: true,
      uppercase: true,
      lowercase: true,
    });
    setPassword(newPassword);
    setConfirmPassword(newPassword);
    setShowPasswordGenerator(true); // Şifre oluşturma alanını göster
  };

  const resetPasswordFields = () => {
    setPassword("");
    setConfirmPassword("");
    setShowPasswordGenerator(false); // Şifre oluşturma alanını gizle
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(password);
    alert("Şifre kopyalandı!");
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
            <TextField
              type="email"
              variant="outlined"
              placeholder="E-posta adresi"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              className="auth-input"
              sx={{ mb: 2 }}
            />
            <TextField
              type={showPassword ? "text" : "password"}
              variant="outlined"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              className="auth-input"
              sx={{ mb: 2 }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      sx={{ color: "#bd2f2c" }}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              type={showPassword ? "text" : "password"}
              variant="outlined"
              placeholder="Şifreyi Onayla"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
              className="auth-input"
              sx={{ mb: 2 }}
            />

            {/* Şifre Oluşturma Butonu ve Koşullu Alan */}
            <Button
              type="button"
              variant="contained"
              fullWidth
              className="generate-password-btn"
              onClick={showPasswordGenerator ? resetPasswordFields : generatePassword}
              sx={{ mb: 2 }}
            >
              {showPasswordGenerator ? "Şifremi Kendim Oluşturacağım" : "Şifre Oluştur"}
            </Button>

            {/* Şifre oluşturma alanı sadece showPasswordGenerator true ise görünecek */}
            {showPasswordGenerator && (
              <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>
                  Şifre Uzunluğu: {passwordLength}
                </Typography>
                <Slider
                  value={passwordLength}
                  onChange={(e, newValue) => setPasswordLength(newValue)}
                  min={8}
                  max={20}
                  step={1}
                  sx={{ mb: 2, color: "#bd2f2c" }}
                />
                <Box sx={{ display: "flex", gap: 2 }}>
                  <Button
                    type="button"
                    variant="contained"
                    fullWidth
                    className="generate-password-btn"
                    onClick={generatePassword}
                  >
                    Yeniden Oluştur
                  </Button>
                  <Button
                    type="button"
                    variant="outlined"
                    fullWidth
                    className="copy-password-btn"
                    onClick={copyToClipboard}
                    startIcon={<ContentCopyIcon />}
                  >
                    Kopyala
                  </Button>
                </Box>
              </Box>
            )}

            <Button
              type="submit"
              variant="contained"
              fullWidth
              className="auth-button"
            >
              Kayıt Ol
            </Button>
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