// app/dashboard/page.js
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Box,
  Button,
  Typography,
  TextField,
} from "@mui/material";
import "@/app/styles/dashboard-style.css";

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [companyData, setCompanyData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);

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
        setShowPopup(true);
      } else {
        setCompanyData(data);
      }
      setLoading(false);
    };

    fetchData();
  }, [router]);

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

      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(fileContent, "text/xml");

      const vergiNo = xmlDoc.querySelector("mukellef > vergiNo")?.textContent || "Belirtilmemiş";
      const firmaAdi = xmlDoc.querySelector("mukellef > soyadi")?.textContent || "Belirtilmemiş";

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
        supabaseResponse = await supabase
          .from("company_info")
          .insert([{ user_id: user.id, firma_adi: firmaAdi, vergi_no: vergiNo, firma_sektor: null }])
          .select()
          .single();
      } else {
        supabaseResponse = await supabase
          .from("company_info")
          .update({ firma_adi: firmaAdi, vergi_no: vergiNo })
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

  return (
    <Box className="dashboard-container">
      {loading && <div className="loading-bar">⏳ Yükleniyor...</div>}
      {error && <div className="error-message">⚠️ {error}</div>}

      <h1 className="page-title">Kontrol Paneli</h1>

      {showPopup && (
        <Box sx={{ marginTop: "24px" }}>
          <div className="error-message">
            Firma bilgisi bulunamadı. Lütfen bir beyanname (XML) yükleyin.
          </div>
          <Box sx={{ marginTop: "16px", display: "flex", gap: 2 }}>
            <TextField
              type="file"
              inputProps={{ accept: ".xml" }}
              onChange={handleFileChange}
              sx={{ flex: 1 }}
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
                {companyData.created_at ? new Date(companyData.created_at).toLocaleString() : "Bilinmiyor"}
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