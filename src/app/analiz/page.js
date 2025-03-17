"use client";

import { useState, useEffect } from "react";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Typography, Box, Alert, CircularProgress } from "@mui/material";
import Link from "next/link";
import { supabase } from "../../lib/supabase";
import "./analiz-style.css";

export default function AnalizPage() {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [queueId, setQueueId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null); // Kuyruğa eklenen işin durumu
  const [pollingId, setPollingId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // "Önceki analizler" tablosu
  const [analysisRows, setAnalysisRows] = useState([]);

  // 1) Beyanname dosyalarını çek
  useEffect(() => {
    async function fetchFiles() {
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
    }

    // 2) "Önceki analizler" (beyanname_analysis tablosu)
    async function fetchPreviousAnalyses() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) return;

      const res = await fetch("/api/previous-analyses", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (res.ok) {
        // data => result.analyses
        const rows = (result.analyses || []).map((item) => ({
          id: item.id,
          created_at: item.created_at,
          pdf_url: item.pdf_url,
        }));
        setAnalysisRows(rows);
      } else {
        setError(`Önceki analizler yüklenemedi: ${result.error}`);
      }
    }

    fetchFiles();
    fetchPreviousAnalyses();
  }, []);

  // 3) Kuyruğa ekle
  async function handleAnalyze() {
    if (selectedFiles.length === 0) {
      setError("Lütfen en az bir beyanname seçiniz.");
      return;
    }
    setError("");
    setQueueId(null);
    setJobStatus(null);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      setError("Oturum alınamadı. Lütfen tekrar giriş yapın.");
      return;
    }

    setLoading(true);

    try {
      // a) Seçili dosyaları JSON'a çeviriyoruz
      const combinedData = selectedFiles.map((file) => ({
        firma_adi: file.firma_adi,
        vergi_no: file.vergi_no,
        donem_yil: file.donem_yil,
        donem_ay: file.donem_ay,
        json_data: file.json_data,
      }));

      // b) /api/queue-analyze endpointine POST
      const res = await fetch("/api/queue-analyze", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ data: combinedData }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Kuyruğa ekleme başarısız oldu.");
      }

      // c) queueId'yi sakla
      setQueueId(json.queue_id);
      setJobStatus({ status: "pending" });

      // d) Her 3 sn'de bir durum sorgulama
      const interval = setInterval(async () => {
        await checkStatus(json.queue_id, session.access_token);
      }, 3000);
      setPollingId(interval);
    } catch (err) {
      setError(`Kuyruğa eklenemedi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  // Durum sorgulama fonksiyonu
  async function checkStatus(qId, token) {
    try {
      const url = `/api/analysis-status?queue_id=${qId}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();

      if (res.ok && json.queue) {
        setJobStatus(json.queue);

        if (json.queue.status === "done" || json.queue.status === "error") {
          // İşlem bitmiş, interval'ı durdur
          clearInterval(pollingId);
          setPollingId(null);
        }
      } else {
        setError(json.error || "Durum sorgulama hatası.");
      }
    } catch (err) {
      setError(`Durum sorgulanamadı: ${err.message}`);
    }
  }

  // 4) DataGrid kolonları
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
        <Typography variant="h4">📂 Beyanname Analizi (Asenkron)</Typography>
        <Link href="/dashboard" className="nav-link">
          Dashboard
        </Link>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {/* Dosyalar tablosu */}
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
        {loading ? <CircularProgress size={24} /> : `Analizi Kuyruğa Ekle (${selectedFiles.length})`}
      </Button>

      {/* Kuyruk ID ve Durum Görüntüleme */}
      {queueId && (
        <Box mt={3} className="analiz-result">
          <Typography variant="h6">Kuyruk ID: {queueId}</Typography>
          {jobStatus && (
            <>
              <Typography>
                Durum: <strong>{jobStatus.status}</strong>
              </Typography>

              {jobStatus.status === "done" && (
                <>
                  <Typography>GPT Yanıtı: {jobStatus.result}</Typography>
                  {jobStatus.pdf_url && (
                    <p>
                      <a href={jobStatus.pdf_url} target="_blank" rel="noopener noreferrer">
                        PDF İndir
                      </a>
                    </p>
                  )}
                </>
              )}

              {jobStatus.status === "error" && (
                <Typography color="error">
                  Hata Mesajı: {jobStatus.result}
                </Typography>
              )}
            </>
          )}
        </Box>
      )}

      {/* Önceki (eski) analizler => beyanname_analysis tablosu */}
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
