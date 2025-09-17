"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import {
  TextField,
  Button,
  Box,
  Typography,
  InputAdornment,
  IconButton,
} from "@mui/material";
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
      <Link href="/" className="home-icon-link">
        <HomeIcon className="home-icon" />
      </Link>
      <main className="main-content">
        <div className="card">
          <h2 className="card-title">Giriş Yap</h2>
          {error && <div className="error-message">{error}</div>}

          <form onSubmit={handleLogin}>
            <TextField
              type="email"
              variant="outlined"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              className="form-input"
              sx={{ mb: 2 }}
              id="email" // <-- EKLENDİ
              name="email" // <-- EKLENDİ
              autoComplete="email" // <-- EKLENDİ
            />
            <TextField
              type={showPassword ? "text" : "password"}
              variant="outlined"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              className="form-input"
              sx={{ mb: 2 }}
              id="password" // <-- EKLENDİ
              name="password" // <-- EKLENDİ
              autoComplete="current-password" // <-- EKLENDİ
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
            <Button
              type="submit"
              variant="contained"
              fullWidth
              className="form-button"
            >
              Giriş
            </Button>
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