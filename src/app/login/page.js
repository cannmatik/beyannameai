"use client";

import { useState, useEffect } from "react";
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
  Checkbox,
  FormControlLabel,
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
  const [rememberMe, setRememberMe] = useState(false);

  // Component mount olduğunda önce session ve remembered email kontrolü
  useEffect(() => {
    const session = supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        router.push("/dashboard"); // Oturum varsa direkt yönlendir
      }
    });

    const savedEmail = localStorage.getItem("rememberedEmail");
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, [router]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
    } else {
      // Beni Hatırla seçiliyse emaili localStorage'a kaydet
      if (rememberMe) {
        localStorage.setItem("rememberedEmail", email);
      } else {
        localStorage.removeItem("rememberedEmail");
      }

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

          <form onSubmit={handleLogin} autoComplete="on">
            <TextField
              id="email"
              name="email"
              type="email"
              label="E-posta"
              placeholder="E-posta"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              className="form-input"
              sx={{ mb: 2 }}
              autoComplete="email"
            />

            <TextField
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              label="Şifre"
              placeholder="Şifre"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              className="form-input"
              sx={{ mb: 2 }}
              autoComplete="current-password"
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
              inputProps={{ autoComplete: "current-password" }}
            />

            {/* Beni Hatırla Checkbox */}
            <FormControlLabel
              control={
                <Checkbox
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  color="primary"
                />
              }
              label="Beni Hatırla"
              sx={{ mb: 2 }}
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
