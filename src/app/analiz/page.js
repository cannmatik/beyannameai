"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Typography, Box, Alert, CircularProgress } from "@mui/material";
import Link from "next/link";
import "./analiz-style.css";

export default function AnalizPage() {
  // Beyanname, kuyruk ve geçmiş analizler için state'ler
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [queueItems, setQueueItems] = useState([]);
  const [analysisRows, setAnalysisRows] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingPull, setLoadingPull] = useState({});  
  const [pullStatus, setPullStatus] = useState(""); // Durum mesajı

  useEffect(() => {
    fetchBeyanname();
    fetchQueue();
    fetchPreviousAnalyses();
  }, []);

  // Beyanname kayıtlarını çek
  async function fetchBeyanname() {
    setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setError("Lütfen giriş yapınız.");
        return;
      }
      const { data, error } = await supabase
        .from("beyanname")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("donem_yil", { ascending: false })
        .order("donem_ay", { ascending: false });
      if (error) throw new Error(error.message);
      setFiles(data || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // Kuyruk (analysis_queue) kayıtlarını çek
  async function fetchQueue() {
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/list-queue", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Kuyruk listesi çekilemedi.");
      setQueueItems(json.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // Önceki analizleri (beyanname_analysis) çek
  async function fetchPreviousAnalyses() {
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/previous-analyses", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Önceki analizler çekilemedi.");
      setAnalysisRows(json.analyses || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // Seçilen beyanname dosyalarını kuyruk ekle (pending)
  async function handleEnqueue() {
    if (selectedFiles.length === 0) {
      setError("Lütfen en az bir beyanname seçiniz.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Giriş yapınız (session yok).");

      const payloadData = selectedFiles.map((f) => ({
        firma_adi: f.firma_adi,
        vergi_no: f.vergi_no,
        donem_yil: f.donem_yil,
        donem_ay: f.donem_ay,
        json_data: f.json_data,
      }));

      const res = await fetch("/api/queue-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ data: payloadData }),
      });
      const js = await res.json();
      if (!res.ok) throw new Error(js.error || "Kuyruğa eklenemedi.");
      await fetchQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ChatGPT'den manuel çek (pending/error kayıtları için)
  async function handlePull(queueId) {
    setError("");
    setPullStatus("Cevap çekiliyor...");
    setLoadingPull((prev) => ({ ...prev, [queueId]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Giriş yapınız.");
      const res = await fetch(`/api/manual-pull?queue_id=${queueId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "ChatGPT çekilemedi.");

      setPullStatus("Analiz tamamlandı.");
      // Kuyruk ve geçmiş analizleri yenile
      await fetchQueue();
      await fetchPreviousAnalyses();
      // Durum mesajını 3 saniye sonra temizle
      setTimeout(() => setPullStatus(""), 3000);
    } catch (err) {
      setError(err.message);
      setPullStatus("");
    } finally {
      setLoadingPull((prev) => ({ ...prev, [queueId]: false }));
    }
  }

  // DataGrid kolonları
  const beyannameCols = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Yıl", width: 100 },
    { field: "donem_ay", headerName: "Ay", width: 100 },
  ];

  const queueCols = [
    { field: "id", headerName: "ID", width: 230 },
    { field: "status", headerName: "Durum", width: 100 },
    {
      field: "pdf_url",
      headerName: "PDF",
      width: 100,
      renderCell: (p) => {
        if (!p.value) return "—";
        return <a href={p.value} target="_blank">PDF</a>;
      },
    },
    {
      field: "created_at",
      headerName: "Tarih",
      width: 160,
      renderCell: (p) => {
        if (!p.value) return "";
        return new Date(p.value).toLocaleString("tr-TR");
      },
    },
    {
      field: "islem",
      headerName: "İşlem",
      width: 150,
      renderCell: (p) => {
        const row = p.row;
        if (row.status === "pending") {
          return <Button variant="contained" onClick={() => handlePull(row.id)}>GPT'den Çek</Button>;
        } else if (row.status === "error") {
          return <Button variant="contained" color="error" onClick={() => handlePull(row.id)}>Tekrar Dene</Button>;
        }
        return "—";
      },
    },
  ];

  const oldAnalysisCols = [
    { field: "id", headerName: "ID", width: 220 },
    {
      field: "pdf_url",
      headerName: "PDF",
      width: 150,
      renderCell: (p) => {
        if (!p.value) return "—";
        return <a href={p.value} target="_blank">İndir</a>;
      },
    },
    {
      field: "analysis_response",
      headerName: "GPT Metin",
      flex: 1,
      renderCell: (p) => {
        if (!p.value) return "";
        const t = p.value;
        return t.length > 70 ? t.substring(0,70) + "..." : t;
      },
    },
    {
      field: "created_at",
      headerName: "Tarih",
      width: 160,
      renderCell: (p) => {
        if (!p.value) return "";
        return new Date(p.value).toLocaleString("tr-TR");
      },
    },
  ];

  return (
    <Box className="analiz-container">
      <Box className="analiz-header">
        <Typography variant="h4">Beyanname Analiz Platformu</Typography>
        <Link href="/dashboard" className="nav-link">Dashboard</Link>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {pullStatus && <Alert severity="info">{pullStatus}</Alert>}

      <Typography variant="h6" sx={{ mt: 2 }}>Beyanname Tablosu</Typography>
      <div className="table-wrapper">
        <DataGrid
          className="data-table"
          rows={files.map((f) => ({ ...f, id: f.id }))}
          columns={beyannameCols}
          checkboxSelection
          disableRowSelectionOnClick
          onRowSelectionModelChange={(sel) => {
            const secilen = files.filter((row) => sel.includes(row.id));
            setSelectedFiles(secilen);
          }}
        />
      </div>
      <Button variant="contained" disabled={loading || selectedFiles.length === 0} onClick={handleEnqueue}>
        {loading ? <CircularProgress size={20} /> : `Seçili (${selectedFiles.length}) Analize Gönder`}
      </Button>

      <Typography variant="h6" sx={{ mt: 4 }}>Kuyruk (Pending / Error)</Typography>
      <div style={{ height: 300 }}>
        <DataGrid
          className="data-table"
          rows={queueItems.map((q) => ({ ...q, id: q.id }))}
          columns={queueCols}
          pageSizeOptions={[5, 10, 25]}
        />
      </div>

      <Typography variant="h6" sx={{ mt: 4 }}>Geçmiş Analizler</Typography>
      <div style={{ height: 300 }}>
        <DataGrid
          className="data-table"
          rows={analysisRows.map((a) => ({ ...a, id: a.id }))}
          columns={oldAnalysisCols}
          pageSizeOptions={[5, 10, 25]}
        />
      </div>
    </Box>
  );
}
