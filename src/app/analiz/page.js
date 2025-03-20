"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Typography, Box, CircularProgress, Snackbar, Alert } from "@mui/material";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link"; 
import "./analiz-style.css";

/* MUI Icons */
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorIcon from "@mui/icons-material/Error";

export default function AnalizPage() {
  const [files, setFiles] = useState([]);
  const [combinedItems, setCombinedItems] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  const analyzeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/queue-analyze`;
  const checkStatusUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/check-status`;
  const generatePdfUrl = "/api/generate-pdf";

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    // Beyannameleri çek
    const {
      data: beyannameData,
      error: beyannameError,
    } = await supabase
      .from("beyanname")
      .select("*")
      .eq("user_id", session.user.id)
      .order("donem_yil", { ascending: false })
      .order("donem_ay", { ascending: false });
    if (beyannameError) console.error("fetchBeyanname error:", beyannameError);
    setFiles(beyannameData || []);

    // Analiz kuyruğunu çek
    const {
      data: queueData,
      error: queueError,
    } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (queueError) {
      console.error("fetchQueue error:", queueError);
      setSnackbar({
        open: true,
        message: "Analiz kuyruğu çekilemedi.",
        severity: "error",
      });
      return;
    }

    // Tamamlanmış analizleri çek
    const {
      data: analysisData,
      error: analysisError,
    } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (analysisError) console.error("fetchAnalysis error:", analysisError);

    // Kuyruk ve analiz verilerini birleştir
    const combined = queueData.map((queueItem) => {
      const analysisItem = analysisData?.find(
        (a) => a.unique_id === queueItem.unique_id
      );
      return {
        id: queueItem.id,
        unique_id: queueItem.unique_id,
        status: queueItem.status,
        created_at: queueItem.created_at,
        analysis_response: analysisItem?.analysis_response || null,
        pdf_url: analysisItem?.pdf_url || null,
      };
    });

    setCombinedItems(combined || []);
  };

  const handleAnalyze = async () => {
    if (!selectedFiles.length) {
      setSnackbar({
        open: true,
        message: "Lütfen en az bir beyanname seçin.",
        severity: "error",
      });
      return;
    }
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const uniqueId = uuidv4();
      const payload = {
        unique_id: uniqueId,
        user_id: session.user.id,
        beyanname_ids: selectedFiles.map((f) => f.id),
        json_data: selectedFiles.map((f) => f.json_data),
      };

      const res = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());

      setSnackbar({
        open: true,
        message: "Analiz kuyruğa eklendi.",
        severity: "success",
      });
      fetchAllData();
    } catch (err) {
      console.error("Analyze error:", err);
      setSnackbar({
        open: true,
        message: `Hata: ${err.message}`,
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (uniqueId) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const res = await fetch(`${checkStatusUrl}?unique_id=${uniqueId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());

      const result = await res.json();
      if (result.completed) {
        setSnackbar({
          open: true,
          message: "Analiz tamamlandı!",
          severity: "success",
        });
        fetchAllData();
      } else if (result.status === "processing") {
        setSnackbar({
          open: true,
          message: "Analiz hala devam ediyor...",
          severity: "info",
        });
      } else if (result.status === "pending") {
        setSnackbar({
          open: true,
          message: "Analiz kuyrukta bekliyor.",
          severity: "info",
        });
      } else if (result.status === "failed") {
        setSnackbar({
          open: true,
          message: "Analiz başarısız oldu.",
          severity: "error",
        });
      }
    } catch (err) {
      console.error("Check status error:", err);
      setSnackbar({
        open: true,
        message: `Durum sorgulama hatası: ${err.message}`,
        severity: "error",
      });
    }
  };

  const generatePdf = async (uniqueId, analysisResponse) => {
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const res = await fetch(generatePdfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          unique_id: uniqueId,
          analysis_response: analysisResponse,
        }),
      });

      if (!res.ok) throw new Error(await res.text());

      const { pdfUrl } = await res.json();
      setSnackbar({
        open: true,
        message: "PDF oluşturuldu ve indiriliyor...",
        severity: "success",
      });
      window.open(pdfUrl, "_blank");
      fetchAllData();
    } catch (err) {
      console.error("PDF generation error:", err);
      setSnackbar({
        open: true,
        message: `PDF oluşturma hatası: ${err.message}`,
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  /* Beyannameler tablosunun kolonları */
  const beyannameCols = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Yıl", width: 100 },
    { field: "donem_ay", headerName: "Ay", width: 100 },
    { field: "beyanname_turu", headerName: "Beyanname Türü", flex: 1 },
  ];

  /* Analizler tablosunun kolonları */
  const combinedCols = [
    { field: "unique_id", headerName: "ID", width: 220 },
    {
      field: "status",
      headerName: "Durum",
      width: 120,
      renderCell: ({ value }) => {
        if (value === "completed") {
          return <CheckCircleIcon style={{ color: "green" }} />;
        }
        if (value === "pending") {
          return <HourglassTopIcon style={{ color: "orange" }} />;
        }
        if (value === "failed") {
          return <ErrorIcon style={{ color: "red" }} />;
        }
        return null;
      },
    },
    {
      field: "created_at",
      headerName: "Tarih",
      width: 160,
      renderCell: ({ value }) => new Date(value).toLocaleString("tr-TR"),
    },
    {
      field: "analysis_response",
      headerName: "Analiz Özeti",
      flex: 1,
      renderCell: ({ value }) =>
        value ? (value.length > 100 ? value.slice(0, 100) + "..." : value) : "Analiz Bekleniyor",
    },
    {
      field: "actions",
      headerName: "İşlemler",
      width: 220,
      renderCell: ({ row }) => (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", height: "100%" }}>
          {row.status !== "completed" && row.status !== "failed" && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => checkStatus(row.unique_id)}
            >
              Durum
            </Button>
          )}
          {row.status === "completed" && !row.pdf_url && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => generatePdf(row.unique_id, row.analysis_response)}
              disabled={loading}
            >
              PDF Oluştur
            </Button>
          )}
          {row.status === "completed" && row.pdf_url && (
            <Button
              variant="contained"
              color="success"
              size="small"
              onClick={() => window.open(row.pdf_url, "_blank")}
            >
              PDF İndir
            </Button>
          )}
        </Box>
      ),
    },
  ];

  return (
    <Box className="analiz-container">
      {/* Navbar */}
      <Box className="navbar">
        <Link href="/dashboard">
          <Button className="nav-button">Kontrol Paneli</Button>
        </Link>
        <Link href="/dashboard/upload">
          <Button className="nav-button">Beyanname Yükle</Button>
        </Link>
        <Link href="/dashboard/files">
          <Button className="nav-button">Beyannamelerim</Button>
        </Link>
        <Link href="/analiz">
          <Button className="nav-button active">Analiz</Button>
        </Link>
      </Box>

      <Typography variant="h4" className="page-title">
        Beyanname Analiz Platformu
      </Typography>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Typography variant="h6" className="section-title" sx={{ mt: 2 }}>
        Beyannameler
      </Typography>
      <div className="table-wrapper">
        <DataGrid
          rows={files}
          columns={beyannameCols}
          checkboxSelection
          onRowSelectionModelChange={(sel) => {
            const selected = files.filter((row) => sel.includes(row.id));
            setSelectedFiles(selected);
          }}
          getRowId={(row) => row.id}
          className="data-table"
        />
      </div>

      <Button
        variant="contained"
        disabled={loading || !selectedFiles.length}
        onClick={handleAnalyze}
        className="analyze-button"
        sx={{ mt: 2 }}
      >
        {loading ? <CircularProgress size={20} /> : `Analize Gönder (${selectedFiles.length})`}
      </Button>

      <Typography variant="h6" className="section-title" sx={{ mt: 4 }}>
        Analizler
      </Typography>
      <div className="table-wrapper">
        <DataGrid
          rows={combinedItems}
          columns={combinedCols}
          getRowId={(row) => row.id}
          className="data-table"
        />
      </div>
    </Box>
  );
}
