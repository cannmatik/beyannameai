"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Typography, Box, Alert, CircularProgress } from "@mui/material";
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
  const [loadingPull, setLoadingPull] = useState({});
  const [pullStatus, setPullStatus] = useState({});

  useEffect(() => {
    const fetchInitialData = async () => {
      await Promise.all([fetchBeyanname(), fetchQueue(), fetchPreviousAnalyses()]);
    };
    fetchInitialData();

    const intervalId = setInterval(() => fetchQueue(), 5000);
    return () => clearInterval(intervalId);
  }, []);

  const fetchData = async (endpoint, setter, supabaseQuery = null) => {
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      let data;
      if (supabaseQuery) {
        const { data: queryData, error } = await supabaseQuery(session.user.id);
        if (error) throw new Error(error.message);
        data = queryData;
      } else {
        const res = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(`Hata: ${await res.text()}`);
        data = (await res.json()).analyses || [];
      }
      setter(data || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchBeyanname = () =>
    fetchData(
      null,
      setFiles,
      (userId) =>
        supabase
          .from("beyanname")
          .select("*")
          .eq("user_id", userId)
          .order("donem_yil", { ascending: false })
          .order("donem_ay", { ascending: false })
    );

  const fetchQueue = () =>
    fetchData(
      null,
      setQueueItems,
      (userId) =>
        supabase.from("analysis_queue").select("*").eq("user_id", userId)
    );

  const fetchPreviousAnalyses = () =>
    fetchData("/api/previous-analyses", setAnalysisRows);

  const handleEnqueue = async () => {
    if (!selectedFiles.length) {
      setError("Lütfen en az bir beyanname seçiniz.");
      return;
    }
    setError("");
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Giriş yapınız.");

      // Her dosya için duplicate kontrolü kaldırıldı, hepsi kuyruğa eklenecek.
      const payloadData = selectedFiles.map(file => ({
        unique_id: uuidv4(), // Her seferinde yeni uuid oluşturuluyor.
        analysis_uuid: uuidv4(),
        firma_adi: file.firma_adi,
        vergi_no: file.vergi_no,
        donem_yil: file.donem_yil,
        donem_ay: file.donem_ay,
        json_data: file.json_data, // Claude için payload
        user_id: session.user.id,
      }));

      const res = await fetch("/api/queue-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ data: payloadData }),
      });
      if (!res.ok) throw new Error(`Kuyruğa eklenemedi: ${await res.text()}`);
      await fetchQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (queueId) => {
    setError("");
    setLoadingPull((prev) => ({ ...prev, [queueId]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Giriş yapınız.");

      // POST isteği gönderiyoruz
      const res = await fetch(`/api/manual-pull?queue_id=${queueId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Durum kontrolü başarısız: ${await res.text()}`);
      const json = await res.json();
      if (json.success) {
        setPullStatus((prev) => ({ ...prev, [queueId]: "Rapor tamam, çekiliyor" }));
        await Promise.all([fetchQueue(), fetchPreviousAnalyses()]);
        setTimeout(() => setPullStatus((prev) => ({ ...prev, [queueId]: "" })), 3000);
      } else {
        setError(json.error || "Analiz sırasında hata oluştu.");
        setPullStatus((prev) => ({ ...prev, [queueId]: "" }));
      }
    } catch (err) {
      setError(err.message);
      setPullStatus((prev) => ({ ...prev, [queueId]: "" }));
    } finally {
      setLoadingPull((prev) => ({ ...prev, [queueId]: false }));
    }
  };

  const handleDelete = async (queueId) => {
    setError("");
    setLoadingPull((prev) => ({ ...prev, [queueId]: true }));

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Giriş yapınız.");

      const res = await fetch(`/api/delete-queue?queue_id=${queueId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(`Silme başarısız: ${await res.text()}`);
      await fetchQueue();
      setPullStatus((prev) => ({ ...prev, [queueId]: "Kayıt silindi" }));
      setTimeout(() => setPullStatus((prev) => ({ ...prev, [queueId]: "" }), 2000));
    } catch (err) {
      setError(err.message);
      setPullStatus((prev) => ({ ...prev, [queueId]: "" }));
    } finally {
      setLoadingPull((prev) => ({ ...prev, [queueId]: false }));
    }
  };

  const beyannameCols = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Yıl", width: 100 },
    { field: "donem_ay", headerName: "Ay", width: 100 },
  ];

  const queueCols = [
    { field: "id", headerName: "ID", width: 230 },
    { field: "status", headerName: "Durum", width: 100 },
    { field: "pdf_url", headerName: "PDF", width: 100, renderCell: (p) => p.value ? <a href={p.value} target="_blank">PDF</a> : "—" },
    { field: "created_at", headerName: "Tarih", width: 160, renderCell: (p) => p.value ? new Date(p.value).toLocaleString("tr-TR") : "" },
    {
      field: "islem",
      headerName: "İşlem",
      width: 300,
      renderCell: ({ row }) => (
        <Box sx={{ display: "flex", gap: 1 }}>
          {(row.status === "pending" || row.status === "processing") && (
            <Button variant="contained" color="warning" onClick={() => checkStatus(row.id)}>
              Durum Sorgula
            </Button>
          )}
          {row.status === "error" && (
            <Button variant="contained" color="error" onClick={() => checkStatus(row.id)}>
              Hata - Sorgula
            </Button>
          )}
          {row.status === "completed" && (
            <Button variant="contained" color="success" onClick={() => checkStatus(row.id)}>
              Raporu Çek
            </Button>
          )}
          <Button variant="contained" color="error" onClick={() => handleDelete(row.id)}>
            Sil
          </Button>
        </Box>
      ),
    },
  ];

  const oldAnalysisCols = [
    { field: "id", headerName: "ID", width: 220 },
    { field: "pdf_url", headerName: "PDF", width: 150, renderCell: (p) => p.value ? <a href={p.value} target="_blank">İndir</a> : "—" },
    { field: "analysis_response", headerName: "Claude Metin", flex: 1, renderCell: (p) => p.value ? (p.value.length > 70 ? p.value.substring(0, 70) + "..." : p.value) : "" },
    { field: "created_at", headerName: "Tarih", width: 160, renderCell: (p) => p.value ? new Date(p.value).toLocaleString("tr-TR") : "" },
  ];

  return (
    <Box className="analiz-container">
      <Box className="analiz-header">
        <Typography variant="h4">Beyanname Analiz Platformu</Typography>
        <Link href="/dashboard" className="nav-link">Dashboard</Link>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}
      {Object.keys(pullStatus).map((queueId) => pullStatus[queueId] && (
        <Alert
          key={queueId}
          severity={pullStatus[queueId].includes("Rapor tamam") || pullStatus[queueId].includes("Rapor hazır") ? "success" : pullStatus[queueId].includes("Kayıt silindi") ? "info" : "warning"}
        >
          {pullStatus[queueId]}
          {loadingPull[queueId] && <CircularProgress size={16} sx={{ ml: 1 }} />}
        </Alert>
      ))}

      <Typography variant="h6" sx={{ mt: 2 }}>Beyanname Tablosu</Typography>
      <div className="table-wrapper">
        <DataGrid
          className="data-table"
          rows={files}
          columns={beyannameCols}
          checkboxSelection
          disableRowSelectionOnClick
          onRowSelectionModelChange={(sel) => setSelectedFiles(files.filter((row) => sel.includes(row.id)))}
        />
      </div>
      <Button variant="contained" disabled={loading || !selectedFiles.length} onClick={handleEnqueue}>
        {loading ? <CircularProgress size={20} /> : `Analize Gönder (${selectedFiles.length})`}
      </Button>

      <Typography variant="h6" sx={{ mt: 4 }}>Kuyruk</Typography>
      <div style={{ height: 300 }}>
        <DataGrid className="data-table" rows={queueItems} columns={queueCols} pageSizeOptions={[5, 10, 25]} />
      </div>

      <Typography variant="h6" sx={{ mt: 4 }}>Geçmiş Analizler</Typography>
      <div style={{ height: 300 }}>
        <DataGrid className="data-table" rows={analysisRows} columns={oldAnalysisCols} pageSizeOptions={[5, 10, 25]} />
      </div>
    </Box>
  );
}
