"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import "@/app/styles/dashboard-style.css";
import { Button, Box, Typography, TextField } from "@mui/material";

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [companyData, setCompanyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [file, setFile] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // 1) Kullanıcı var mı?
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);

      // 2) Admin kontrolü
      const { data: adminData, error: adminError } = await supabase
        .from("admin")
        .select("id")
        .eq("id", user.id)
        .maybeSingle();
      setIsAdmin(!!adminData && !adminError);

      // 3) Firma bilgisi kontrolü
      const { data, error } = await supabase
        .from("company_info")
        .select("id, user_id, firma_adi, vergi_no, created_at, firma_sektor")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching company info:", error.message);
        setError("Firma bilgisi alınırken hata oluştu: " + error.message);
        setShowPopup(true);
      } else if (!data) {
        setShowPopup(true); // Kayıt yoksa popup göster
      } else {
        setCompanyData(data); // Kayıt varsa state'e set et
      }
      setLoading(false);
    };

    fetchData();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleFileChange = (e) => {
    const uploadedFile = e.target.files?.[0];
    if (uploadedFile) {
      setFile(uploadedFile);
    }
  };

  const handleFileUpload = async () => {
    if (!file || !user) return;

    setLoading(true);
    setError("");

    try {
      // 1) Dosyayı iso-8859-9 ile oku
      const fileReader = new FileReader();
      const decoder = new TextDecoder("iso-8859-9");

      const fileContent = await new Promise((resolve, reject) => {
        fileReader.onload = () => {
          const decodedText = decoder.decode(fileReader.result);
          resolve(decodedText);
        };
        fileReader.onerror = () => reject(fileReader.error);
        fileReader.readAsArrayBuffer(file);
      });

      // 2) XML parse et
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(fileContent, "text/xml");

      // 3) Verileri çek
      const vergiNo =
        xmlDoc.querySelector("mukellef > vergiNo")?.textContent || "Belirtilmemiş";
      const firmaAdi =
        xmlDoc.querySelector("mukellef > soyadi")?.textContent || "Belirtilmemiş";

      // 4) Veritabanı kontrolü
      const { data: existing, error: existingError } = await supabase
        .from("company_info")
        .select("id, firma_sektor")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existingError) {
        throw new Error("Firma kontrolü sırasında hata: " + existingError.message);
      }

      let supabaseResponse;
      if (!existing) {
        // Kayıt yoksa INSERT
        supabaseResponse = await supabase
          .from("company_info")
          .insert([
            {
              user_id: user.id,
              firma_adi: firmaAdi,
              vergi_no: vergiNo,
              firma_sektor: null,
            },
          ])
          .select()
          .single();
      } else {
        // Kayıt varsa UPDATE
        supabaseResponse = await supabase
          .from("company_info")
          .update({
            firma_adi: firmaAdi,
            vergi_no: vergiNo,
          })
          .eq("id", existing.id)
          .select()
          .single();
      }

      if (supabaseResponse.error) {
        throw supabaseResponse.error;
      }

      setCompanyData(supabaseResponse.data);
      setShowPopup(false);
    } catch (err) {
      setError("Dosya yüklenirken hata oluştu: " + err.message);
    } finally {
      setLoading(false);
      setFile(null);
    }
  };

  // Diğer sayfalara geçişi engelleme
  const restrictNavigation = (path) => {
    if (!companyData && path !== "/dashboard") {
      setError("Önce bir beyanname (XML) yüklemelisiniz!");
      return false;
    }
    return true;
  };

  return (
    <Box className="dashboard-container">
      {/* Navbar */}
      <Box className="navbar">
        <Link href="/dashboard">
          <Button
            className={`nav-button ${pathname === "/dashboard" ? "active" : ""}`}
          >
            Kontrol Paneli
          </Button>
        </Link>
        <Link href="/analiz" onClick={(e) => !restrictNavigation("/analiz") && e.preventDefault()}>
          <Button
            className={`nav-button ${pathname === "/analiz" ? "active" : ""}`}
            disabled={!companyData}
          >
            Analiz
          </Button>
        </Link>
        <Link
          href="/dashboard/file-management"
          onClick={(e) => !restrictNavigation("/dashboard/file-management") && e.preventDefault()}
        >
          <Button
            className={`nav-button ${
              pathname === "/dashboard/file-management" ? "active" : ""
            }`}
            disabled={!companyData}
          >
            Dosya Yönetimi
          </Button>
        </Link>
        {isAdmin && (
          <>
            <Link
              href="/dashboard/prompts"
              onClick={(e) => !restrictNavigation("/dashboard/prompts") && e.preventDefault()}
            >
              <Button
                className={`nav-button ${
                  pathname === "/dashboard/prompts" ? "active" : ""
                }`}
                disabled={!companyData}
              >
                Prompt Düzenle
              </Button>
            </Link>
            <Link href="/admin" onClick={(e) => !restrictNavigation("/admin") && e.preventDefault()}>
              <Button
                className={`nav-button ${pathname === "/admin" ? "active" : ""}`}
                disabled={!companyData}
              >
                Admin Yönetimi
              </Button>
            </Link>
          </>
        )}
        <Button onClick={handleLogout} className="logout-button">
          Çıkış Yap
        </Button>
      </Box>

      {loading && <div className="loading-bar">⏳ Yükleniyor...</div>}
      {error && <div className="error-message">⚠️ {error}</div>}

      <h1 className="page-title">Kontrol Paneli</h1>

      {showPopup && (
        <Box sx={{ marginTop: "24px" }}>
          <div className="error-message">
            Firma bilgisi bulunamadı. Lütfen bir beyanname (XML) yükleyin.
          </div>
          <Box sx={{ marginTop: "16px" }}>
            <TextField
              type="file"
              inputProps={{ accept: ".xml" }}
              onChange={handleFileChange}
              sx={{ marginRight: "16px" }}
            />
            <Button
              variant="contained"
              onClick={handleFileUpload}
              disabled={!file || loading}
            >
              Dosyayı Yükle
            </Button>
          </Box>
        </Box>
      )}

      {companyData && (
        <Box sx={{ marginTop: "24px" }}>
          <h2 className="section-title">Şirket Bilgileri</h2>
          <Box className="company-card">
            <Box className="company-info-row">
              <Typography className="info-label">Firma ID:</Typography>
              <Typography className="info-value">{companyData.id || "Bilinmiyor"}</Typography>
            </Box>
            <Box className="company-info-row">
              <Typography className="info-label">Kullanıcı ID:</Typography>
              <Typography className="info-value">{companyData.user_id || "Bilinmiyor"}</Typography>
            </Box>
            <Box className="company-info-row">
              <Typography className="info-label">Firma Adı:</Typography>
              <Typography className="info-value">{companyData.firma_adi || "Belirtilmemiş"}</Typography>
            </Box>
            <Box className="company-info-row">
              <Typography className="info-label">Vergi Numarası (VKN):</Typography>
              <Typography className="info-value">{companyData.vergi_no || "Belirtilmemiş"}</Typography>
            </Box>
            <Box className="company-info-row">
              <Typography className="info-label">Kayıt Tarihi:</Typography>
              <Typography className="info-value">
                {companyData.created_at
                  ? new Date(companyData.created_at).toLocaleString()
                  : "Bilinmiyor"}
              </Typography>
            </Box>
            <Box className="company-info-row">
              <Typography className="info-label">Firma Sektörü:</Typography>
              <Typography className="info-value">{companyData.firma_sektor || "Belirtilmemiş"}</Typography>
            </Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}