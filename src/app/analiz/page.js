"use client";

import { useState, useEffect } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Typography, Box, Alert, CircularProgress } from "@mui/material";
import Link from "next/link"; // Dashboard'a geri dönmek için
import { supabase } from "../../lib/supabase";
import "./analiz-style.css";

export default function AnalizPage() {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [analysis, setAnalysis] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [previousAnalyses, setPreviousAnalyses] = useState([]);

  // "Eski analizler" tablosu için DataGrid'e uygun satırlar
  const [analysisRows, setAnalysisRows] = useState([]);

  useEffect(() => {
    const fetchFiles = async () => {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Kullanıcı oturumu bulunamadı. Lütfen giriş yapın.");
        return;
      }

      const { data, error } = await supabase
        .from("beyanname")
        .select("*")
        .eq("user_id", user.id)
        .order("donem_yil", { ascending: false })
        .order("donem_ay", { ascending: false });

      if (error) {
        setError(`Beyannameler yüklenemedi: ${error.message}`);
      } else {
        setFiles(data || []);
      }
    };

    const fetchPreviousAnalyses = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) return;

      // Geçmiş analizleri çekiyoruz
      const res = await fetch("/api/previous-analyses", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (res.ok) {
        setPreviousAnalyses(result.analyses || []);
        // DataGrid satırlarını hazırlayalım
        const rows = (result.analyses || []).map((item) => ({
          id: item.id, // DataGrid, "id" alanını primary key olarak kullanır
          created_at: item.created_at,
          pdf_url: item.pdf_url,
        }));
        setAnalysisRows(rows);
      } else {
        setError(`Önceki analizler yüklenemedi: ${result.error}`);
      }
    };

    fetchFiles();
    fetchPreviousAnalyses();
  }, []);

  // Seçili beyannameleri ChatGPT'ye gönderen fonksiyon
  const handleAnalyze = async () => {
    if (selectedFiles.length === 0) {
      setError("Lütfen en az bir beyanname seçiniz.");
      return;
    }
    setLoading(true);
    setError("");
    setAnalysis("");
    setPdfUrl("");

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      setError("Oturum alınamadı. Lütfen tekrar giriş yapın.");
      return;
    }

    const combinedData = selectedFiles.map((file) => ({
      firma_adi: file.firma_adi,
      vergi_no: file.vergi_no,
      donem_yil: file.donem_yil,
      donem_ay: file.donem_ay,
      json_data: file.json_data,
    }));

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ data: combinedData }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "API isteği başarısız oldu.");
      }

      // API'den dönen analiz metni
      setAnalysis(data.response);
      setPdfUrl(data.pdf_url);
    } catch (err) {
      setError(`Analiz başarısız: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Eski analizler tablosunun kolonları
  const oldAnalysisColumns = [
    {
      field: "id",
      headerName: "Analiz ID",
      width: 120,
    },
    {
      field: "created_at",
      headerName: "Tarih",
      flex: 1,
      renderCell: (params) => {
        // "2025-03-16T20:45:45.123Z" => "16.03.2025 23:45:45"
        const dateStr = new Date(params.value).toLocaleString("tr-TR");
        return <span>{dateStr}</span>;
      },
    },
    {
      field: "pdf_url",
      headerName: "PDF",
      width: 120,
      renderCell: (params) => {
        if (!params.value) return "Yok";
        return (
          <a href={params.value} target="_blank" rel="noopener noreferrer">
            İndir
          </a>
        );
      },
    },
  ];

  return (
    <Box className="analiz-container">
      {/* Üst Header */}
      <Box className="analiz-header">
        <Typography variant="h4">📂 Beyanname Analizi</Typography>
        {/* Dashboard link */}
        <Link href="/dashboard" className="nav-link">
          Dashboard
        </Link>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <div className="table-wrapper">
        <DataGrid
          className="data-table"
          rows={files.map((file) => ({ ...file, id: file.id }))}
          columns={[
            { field: "firma_adi", headerName: "Firma Adı", flex: 1 },
            { field: "vergi_no", headerName: "Vergi No", flex: 1 },
            { field: "donem_yil", headerName: "Yıl", width: 100 },
            { field: "donem_ay", headerName: "Ay", width: 100 },
          ]}
          checkboxSelection
          disableRowSelectionOnClick
          onRowSelectionModelChange={(newSelection) => {
            const selectedRows = files.filter((row) => newSelection.includes(row.id));
            setSelectedFiles(selectedRows);
          }}
        />
      </div>

      <Button
        variant="contained"
        color="primary"
        onClick={handleAnalyze}
        disabled={loading || selectedFiles.length === 0}
      >
        {loading ? <CircularProgress size={24} /> : `Beyanname AI'ye gönder (${selectedFiles.length})`}
      </Button>

      {/* Analiz Sonucu */}
      {analysis && (
        <Box className="analiz-result">
          <Typography variant="h5">Analiz Sonucu</Typography>
          <Typography>{analysis}</Typography>
          {pdfUrl && (
            <p>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
                PDF İndir
              </a>
            </p>
          )}
        </Box>
      )}

      {/* Önceki Analizler */}
      <Box className="previous-analyses" mt={4}>
        <Typography variant="h5">Önceki Analizler</Typography>
        {analysisRows.length === 0 ? (
          <Typography>Henüz herhangi bir analiz kaydı yok.</Typography>
        ) : (
          <div style={{ height: 300 }}>
            <DataGrid
              rows={analysisRows}
              columns={oldAnalysisColumns}
              className="data-table"
              disableRowSelectionOnClick
              pageSizeOptions={[5, 10, 25]}
            />
          </div>
        )}
      </Box>
    </Box>
  );
}
