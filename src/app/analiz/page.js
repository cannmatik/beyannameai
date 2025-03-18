// app/analiz/page.js
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
  const [statusMessages, setStatusMessages] = useState({});
  const [pdfExists, setPdfExists] = useState({});

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    await Promise.all([fetchBeyanname(), fetchQueue(), fetchPreviousAnalyses()]);
    checkExistingPdfs();
  };

  const refreshSession = async () => {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
      setError("Oturum geçersiz.");
      return null;
    }
    return session;
  };

  const fetchBeyanname = async () => {
    const session = await refreshSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("beyanname")
      .select("*")
      .eq("user_id", session.user.id)
      .order("donem_yil", { ascending: false })
      .order("donem_ay", { ascending: false });
    if (error) setError(error.message);
    else setFiles(data || []);
  };

  const fetchQueue = async () => {
    const session = await refreshSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setQueueItems(data || []);
  };

  const fetchPreviousAnalyses = async () => {
    const session = await refreshSession();
    if (!session) return;
    const { data, error } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else {
      const validData = data.filter(row => row.unique_id && row.analysis_response);
      setAnalysisRows(validData || []);
    }
  };

  const checkExistingPdfs = async () => {
    const session = await refreshSession();
    if (!session) return;
    const { data: files, error } = await supabase.storage.from("analysis-pdfs").list();
    if (error) {
      console.error("PDF listeleme hatası:", error);
      return;
    }
    const exists = {};
    analysisRows.forEach((row) => {
      const fileName = `${row.unique_id}.pdf`;
      exists[row.unique_id] = files.some((file) => file.name === fileName);
    });
    setPdfExists(exists);
  };

  const handleEnqueue = async () => {
    if (!selectedFiles.length) {
      setError("Lütfen en az bir beyanname seçin.");
      return;
    }
    setError("");
    setLoading(true);
    const session = await refreshSession();
    if (!session) return;
    const uniqueId = uuidv4();
    const payload = {
      unique_id: uniqueId,
      user_id: session.user.id,
      beyanname_ids: selectedFiles.map((f) => f.id),
      json_data: selectedFiles.map((f) => f.json_data),
    };
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
      setError(`Hata: ${errorMsg}`);
    } else {
      await fetchQueue();
    }
    setLoading(false);
  };

  const checkStatus = async (uniqueId) => {
    setStatusMessages((prev) => ({ ...prev, [uniqueId]: "Sorgulanıyor..." }));
    const session = await refreshSession();
    if (!session) return;
    const res = await fetch(`/api/check-status?unique_id=${uniqueId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const result = await res.json();
    if (!res.ok) {
      setError(result.error);
      setStatusMessages((prev) => ({ ...prev, [uniqueId]: "Hata oluştu." }));
    } else if (result.completed) {
      setStatusMessages((prev) => ({ ...prev, [uniqueId]: "Tamamlandı, çekildi." }));
      await Promise.all([fetchQueue(), fetchPreviousAnalyses()]);
      await checkExistingPdfs();
    } else {
      setStatusMessages((prev) => ({ ...prev, [uniqueId]: "Henüz tamamlanmadı." }));
    }
    setTimeout(() => setStatusMessages((prev) => ({ ...prev, [uniqueId]: "" })), 3000);
  };

  async function generateAndUploadPdf(uniqueId, analysisResponse) {
    try {
      const session = await refreshSession();
      if (!session) throw new Error("Oturum bulunamadı.");

      const payload = { unique_id: uniqueId, analysis_response: analysisResponse };
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

      window.open(result.pdfUrl, "_blank");
      setPdfExists((prev) => ({ ...prev, [uniqueId]: true }));
    } catch (error) {
      setError(`PDF oluşturulurken hata oluştu: ${error.message}`);
    }
  }

  const downloadPdf = (uniqueId) => {
    const fileName = `${uniqueId}.pdf`;
    const { data: publicUrl } = supabase.storage.from("analysis-pdfs").getPublicUrl(fileName);
    window.open(publicUrl.publicUrl, "_blank");
  };

  const beyannameCols = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Yıl", width: 100 },
    { field: "donem_ay", headerName: "Ay", width: 100 },
  ];

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
      width: 200,
      renderCell: ({ row }) => (
        <Button variant="contained" onClick={() => checkStatus(row.unique_id)}>
          Durum Sorgula
        </Button>
      ),
    },
  ];

  const analysisCols = [
    { field: "unique_id", headerName: "ID", width: 230 },
    {
      field: "analysis_response",
      headerName: "Analiz",
      flex: 1,
      renderCell: ({ value }) => (value ? value.slice(0, 100) + "..." : "Veri yok"),
    },
    {
      field: "client_pdf",
      headerName: "PDF",
      width: 150,
      renderCell: ({ row }) => (
        pdfExists[row.unique_id] ? (
          <Button
            variant="contained"
            color="success" // Yeşil renk
            onClick={() => downloadPdf(row.unique_id)}
          >
            PDF'i İndir
          </Button>
        ) : (
          <Button
            variant="contained"
            disabled={!row.unique_id || !row.analysis_response}
            onClick={() => generateAndUploadPdf(row.unique_id, row.analysis_response)}
          >
            PDF Oluştur
          </Button>
        )
      ),
    },
    {
      field: "created_at",
      headerName: "Tarih",
      width: 160,
      renderCell: ({ value }) => new Date(value).toLocaleString("tr-TR"),
    },
  ];

  return (
    <Box className="analiz-container">
      <Box className="analiz-header">
        <Typography variant="h4">Beyanname Analiz Platformu</Typography>
        <Link href="/dashboard" className="nav-link">
          Dashboard
        </Link>
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      {Object.entries(statusMessages).map(([id, msg]) =>
        msg ? (
          <Alert key={id} severity={msg.includes("Tamamlandı") ? "success" : "info"}>
            {msg}
          </Alert>
        ) : null
      )}
      <Typography variant="h6" sx={{ mt: 2 }}>
        Beyannameler
      </Typography>
      <div className="table-wrapper">
        <DataGrid
          className="data-table"
          rows={files}
          columns={beyannameCols}
          checkboxSelection
          onRowSelectionModelChange={(sel) => setSelectedFiles(files.filter((row) => sel.includes(row.id)))}
        />
      </div>
      <Button variant="contained" disabled={loading || !selectedFiles.length} onClick={handleEnqueue}>
        {loading ? <CircularProgress size={20} /> : `Analize Gönder (${selectedFiles.length})`}
      </Button>
      <Typography variant="h6" sx={{ mt: 4 }}>
        Analiz Kuyruğu
      </Typography>
      <div style={{ height: 300 }}>
        <DataGrid className="data-table" rows={queueItems} columns={queueCols} />
      </div>
      <Typography variant="h6" sx={{ mt: 4 }}>
        Tamamlanmış Analizler
      </Typography>
      <div style={{ height: 300 }}>
        <DataGrid className="data-table" rows={analysisRows} columns={analysisCols} />
      </div>
    </Box>
  );
}