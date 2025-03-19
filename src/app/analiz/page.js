"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import {
  Button,
  Typography,
  Box,
  CircularProgress,
  Snackbar,
  Alert as MuiAlert,
} from "@mui/material";
import Link from "next/link";
import { v4 as uuidv4 } from "uuid";
import "./analiz-style.css";

export default function AnalizPage() {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [analysisRows, setAnalysisRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "info" });
  const intervalRef = useRef(null);

  useEffect(() => {
    fetchAllData();

    intervalRef.current = setInterval(() => {
      fetchAllData();
    }, 30000);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, []);

  const fetchAllData = async () => {
    try {
      await Promise.all([
        fetchBeyanname(),
        fetchQueue(),
        fetchPreviousAnalyses(),
      ]);
    } catch (err) {
      setError(`Veriler çekilirken hata oluştu: ${err.message}`);
    }
  };

  const refreshSession = async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error || !session) {
      setError("Oturum geçersiz veya bulunamadı.");
      return null;
    }
    return session;
  };

  // Beyanname verilerini çek
  const fetchBeyanname = async () => {
    const session = await refreshSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("beyanname")
      .select("*")
      .eq("user_id", session.user.id)
      .order("donem_yil", { ascending: false })
      .order("donem_ay", { ascending: false });
    if (error) throw new Error(error.message);
    setFiles(data || []);
  };

  // Kuyruk verilerini çek
  const fetchQueue = async () => {
    const session = await refreshSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    setQueueItems(data || []);
  };

  // Eski analizleri çek
  const fetchPreviousAnalyses = async () => {
    const session = await refreshSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Boş ya da hatalı kaydı filtrele
    const validData = (data || []).filter(
      (row) => row.unique_id && row.analysis_response
    );
    setAnalysisRows(validData);
  };

  // Analize gönder
  const handleEnqueue = async () => {
    if (!selectedFiles.length) {
      setError("Lütfen en az bir beyanname seçin.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const session = await refreshSession();
      if (!session) throw new Error("Oturum bulunamadı.");

      const uniqueId = uuidv4();
      const payload = {
        unique_id: uniqueId,
        user_id: session.user.id,
        beyanname_ids: selectedFiles.map((f) => f.id),
        json_data: selectedFiles.map((f) => f.json_data),
      };

      // Kuyruğa ekleyen API endpoint (örneğin /api/queue-analyze)
      const res = await fetch("/api/queue-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorMsg = await res.text();
        throw new Error(`Analiz kuyruğa eklenemedi: ${errorMsg}`);
      }

      // Kuyruğu güncelle
      await fetchQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Durum sorgulama
  const checkStatus = async (uniqueId) => {
    setSnackbar({ open: true, message: "Sorgulanıyor...", severity: "info" });
    try {
      const session = await refreshSession();
      if (!session) throw new Error("Oturum bulunamadı.");

      const res = await fetch(`/api/check-status?unique_id=${uniqueId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();

      if (!res.ok) throw new Error(result.error || "Durum sorgulama başarısız.");

      if (result.completed) {
        setSnackbar({
          open: true,
          message: "Tamamlandı. Veriler çekiliyor...",
          severity: "success",
        });
        // Tüm tablo verilerini yenile
        await fetchAllData();
      } else if (result.status === "failed" && result.logs) {
        setSnackbar({
          open: true,
          message: `Analiz FAILED. Hata: ${result.logs.error_message}`,
          severity: "error",
        });
      } else {
        setSnackbar({
          open: true,
          message: "Henüz tamamlanmadı :Sorgera Beyanname AI Raporunuzu Oluşturuyor...",
          severity: "info",
        });
      }
    } catch (err) {
      setError(err.message);
      setSnackbar({
        open: true,
        message: "Hata oluştu.",
        severity: "error",
      });
    }
  };

  // Kuyruktan sil
  const deleteQueueItem = async (id) => {
    try {
      const session = await refreshSession();
      if (!session) throw new Error("Oturum bulunamadı.");

      // .eq("user_id", session.user.id) sorgusu tablonuzda user_id varsa
      // kullanıcıya ait kaydı sildiğinizden emin olmak için kullanılıyor.
      const { error } = await supabase
        .from("analysis_queue")
        .delete()
        .eq("id", id)
        .eq("user_id", session.user.id);

      if (error) throw new Error(`Silme işlemi başarısız: ${error.message}`);

      setSnackbar({
        open: true,
        message: "Kayıt başarıyla silindi.",
        severity: "success",
      });
      await fetchQueue();
    } catch (err) {
      setError(err.message);
      setSnackbar({
        open: true,
        message: `Silme hatası: ${err.message}`,
        severity: "error",
      });
    }
  };

  // PDF oluşturma ve yükleme
  const generateAndUploadPdf = async (uniqueId, analysisResponse) => {
    try {
      const session = await refreshSession();
      if (!session) throw new Error("Oturum bulunamadı.");

      const payload = {
        unique_id: uniqueId,
        analysis_response: analysisResponse,
      };

      // PDF oluşturan API endpoint (örneğin /api/generate-pdf)
      const res = await fetch("/api/generate-pdf", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "PDF oluşturma başarısız");

      await fetchAllData();

      // PDF URL varsa direkt yeni sekmede aç
      if (result.pdfUrl) {
        window.open(result.pdfUrl, "_blank");
      }
    } catch (err) {
      setError(`PDF oluşturulurken hata oluştu: ${err.message}`);
    }
  };

  // PDF indirme
  const downloadPdf = (uniqueId) => {
    const row = analysisRows.find((r) => r.unique_id === uniqueId);
    if (row && row.pdf_url) {
      window.open(row.pdf_url, "_blank");
    } else {
      setError("PDF URL bulunamadı.");
    }
  };

  // Beyanname kolonları
  const beyannameCols = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Yıl", width: 100 },
    { field: "donem_ay", headerName: "Ay", width: 100 },
    { field: "beyanname_turu", headerName: "Beyanname Türü", flex: 1 },
  ];

  // Kuyruk kolonları
  const queueCols = [
    { field: "unique_id", headerName: "ID", width: 230 },
    { field: "status", headerName: "Durum", width: 100 },
    {
      field: "created_at",
      headerName: "Tarih",
      width: 160,
      renderCell: ({ value }) => new Date(value).toLocaleString("tr-TR"),
    },
    {
      field: "action",
      headerName: "İşlem",
      width: 250,
      renderCell: ({ row }) => (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          {row.status === "completed" ? (
            <Button variant="contained" color="success">
              Tamamlandı
            </Button>
          ) : row.status === "failed" ? (
            <Typography sx={{ color: "red" }}>İşlem Başarısız</Typography>
          ) : (
            <Button variant="contained" onClick={() => checkStatus(row.unique_id)}>
              Durum Sorgula
            </Button>
          )}

          {/* Silme butonu her satırda */}
          <Button
            variant="contained"
            color="error"
            onClick={() => deleteQueueItem(row.id)}
          >
            Sil
          </Button>
        </Box>
      ),
    },
  ];

  // Analiz kolonları
  const analysisCols = [
    { field: "unique_id", headerName: "ID", width: 230 },
    {
      field: "analysis_response",
      headerName: "Analiz",
      flex: 1,
      renderCell: ({ value }) =>
        value ? (value.length > 100 ? value.slice(0, 100) + "..." : value) : "Veri yok",
    },
    {
      field: "client_pdf",
      headerName: "PDF",
      width: 150,
      renderCell: ({ row }) =>
        row.pdf_url ? (
          <Button
            variant="contained"
            color="success"
            onClick={() => downloadPdf(row.unique_id)}
          >
            PDF İndir
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={!row.unique_id || !row.analysis_response}
            onClick={() => generateAndUploadPdf(row.unique_id, row.analysis_response)}
          >
            PDF Oluştur
          </Button>
        ),
    },
    {
      field: "created_at",
      headerName: "Tarih",
      width: 160,
      renderCell: ({ value }) => new Date(value).toLocaleString("tr-TR"),
    },
  ];

  const handleSnackbarClose = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box className="analiz-container">
      <Box className="analiz-header">
        <Typography variant="h4">Beyanname Analiz Platformu</Typography>
        <Link href="/dashboard" className="nav-link">
          Dashboard
        </Link>
      </Box>

      {error && (
        <MuiAlert severity="error" onClose={() => setError("")}>
          {error}
        </MuiAlert>
      )}

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <MuiAlert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </MuiAlert>
      </Snackbar>

      <Typography variant="h6" sx={{ mt: 2 }}>
        Beyannameler
      </Typography>
      <div className="table-wrapper">
        <DataGrid
          className="data-table"
          rows={files}
          columns={beyannameCols}
          checkboxSelection
          onRowSelectionModelChange={(sel) => {
            const selected = files.filter((row) => sel.includes(row.id));
            setSelectedFiles(selected);
          }}
          disableSelectionOnClick
          getRowId={(row) => row.id}
        />
      </div>

      <Button
        variant="contained"
        disabled={loading || !selectedFiles.length}
        onClick={handleEnqueue}
        sx={{ mt: 2 }}
      >
        {loading ? (
          <CircularProgress size={20} />
        ) : (
          `Analize Gönder (${selectedFiles.length})`
        )}
      </Button>

      <Typography variant="h6" sx={{ mt: 4 }}>
        Analiz Kuyruğu
      </Typography>
      <div style={{ height: 300 }}>
        <DataGrid
          className="data-table"
          rows={queueItems}
          columns={queueCols}
          getRowId={(row) => row.id}
        />
      </div>

      <Typography variant="h6" sx={{ mt: 4 }}>
        Tamamlanmış Analizler
      </Typography>
      <div style={{ height: 300 }}>
        <DataGrid
          className="data-table"
          rows={analysisRows}
          columns={analysisCols}
          getRowId={(row) => row.id}
        />
      </div>
    </Box>
  );
}
