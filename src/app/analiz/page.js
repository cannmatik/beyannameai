"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Typography, Box, Alert, CircularProgress } from "@mui/material";
import Link from "next/link";
import "./analiz-style.css";

export default function AnalizPage() {
  const [files, setFiles] = useState([]); // beyanname tablosu
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [queueItems, setQueueItems] = useState([]); // analysis_queue
  const [analysisRows, setAnalysisRows] = useState([]); // beyanname_analysis
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); // enqueue butonu
  const [loadingPull, setLoadingPull] = useState({}); // pull butonları

  // 1) Beyanname tablosunu çek
  async function fetchBeyanname() {
    setError("");
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) {
        setError("Please log in.");
        return;
      }
      const { data, error } = await supabase
        .from("beyanname")
        .select("*")
        .eq("user_id", userData.user.id)
        .order("donem_yil", { ascending: false })
        .order("donem_ay", { ascending: false });

      if (error) {
        throw new Error(error.message);
      }
      setFiles(data || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // 2) Queue'yu çek
  async function fetchQueue() {
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("No session found. Please login.");
        return;
      }
      const res = await fetch("/api/list-queue", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to list queue");
      setQueueItems(json.items || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // 3) Previous analyses
  async function fetchPreviousAnalyses() {
    setError("");
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch("/api/previous-analyses", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Failed to fetch previous analyses");
      }
      setAnalysisRows(json.analyses || []);
    } catch (err) {
      setError(err.message);
    }
  }

  // useEffect => sayfa ilk açılışta 3 veriyi de çek
  useEffect(() => {
    fetchBeyanname();
    fetchQueue();
    fetchPreviousAnalyses();
  }, []);

  // 4) Enqueue Analysis
  async function handleEnqueue() {
    if (selectedFiles.length === 0) {
      setError("Select at least one file.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No session found. Please log in.");
      }

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
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Enqueue error");
      }
      // tabloyu yenile
      await fetchQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // 5) Pull from GPT
  async function handlePull(queueId) {
    setError("");
    setLoadingPull((prev) => ({ ...prev, [queueId]: true }));

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("No session found. Please log in.");
      }

      const res = await fetch(`/api/manual-pull?queue_id=${queueId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Pull error");
      }
      // tabloyu yenile
      await fetchQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingPull((prev) => ({ ...prev, [queueId]: false }));
    }
  }

  // DataGrid kolonları
  const beyannameColumns = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Year", width: 100 },
    { field: "donem_ay", headerName: "Month", width: 100 },
  ];

  const queueColumns = [
    { field: "id", headerName: "ID", width: 220 },
    { field: "status", headerName: "Status", width: 120 },
    {
      field: "result",
      headerName: "GPT Result",
      flex: 1,
      renderCell: (params) => {
        const val = params.value;
        if (!val) return "";
        return val.length > 50 ? val.substring(0, 50) + "..." : val;
      },
    },
    {
      field: "pdf_url",
      headerName: "PDF",
      width: 110,
      renderCell: (params) => {
        if (!params.value) return "—";
        return (
          <a href={params.value} target="_blank" rel="noopener noreferrer">
            Download
          </a>
        );
      },
    },
    {
      field: "created_at",
      headerName: "Created",
      width: 170,
      renderCell: (params) => {
        if (!params.value) return "";
        return new Date(params.value).toLocaleString("tr-TR");
      },
    },
    {
      field: "actions",
      headerName: "Actions",
      width: 180,
      renderCell: (params) => {
        const row = params.row;
        
        if (row.status === "pending") {
          return (
            <Button variant="contained" onClick={() => handlePull(row.id)}>
              Pull from GPT
            </Button>
          );
        } else if (row.status === "error") {
          return (
            <Button variant="contained" color="error" onClick={() => handlePull(row.id)}>
              Try Again
            </Button>
          );
        }
        // "done" görmeyeceğiz, ama yine de "—"
        return "—";
      },
    }
  ];

  const oldAnalysisColumns = [
    { field: "id", headerName: "Analysis ID", width: 180 },
    {
      field: "created_at",
      headerName: "Date",
      width: 180,
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
        if (!params.value) return "None";
        return (
          <a href={params.value} target="_blank" rel="noopener noreferrer">
            Download
          </a>
        );
      },
    },
    {
      field: "analysis_response",
      headerName: "Analysis Text",
      flex: 1,
      renderCell: (params) => {
        const text = params.value || "";
        return text.length > 60 ? text.substring(0, 60) + "..." : text;
      },
    },
  ];

  return (
    <Box className="analiz-container">
      <Box className="analiz-header">
        <Typography variant="h4">Beyanname Analysis (Manual Queue)</Typography>
        <Link href="/dashboard" className="nav-link">
          Dashboard
        </Link>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {/* Beyanname Tablosu */}
      <Typography variant="h6" gutterBottom>
        Beyanname Kayıtları
      </Typography>
      <div className="table-wrapper">
        <DataGrid
          className="data-table"
          rows={files.map((f) => ({ ...f, id: f.id }))}
          columns={beyannameColumns}
          checkboxSelection
          disableRowSelectionOnClick
          onRowSelectionModelChange={(sel) => {
            const selected = files.filter((row) => sel.includes(row.id));
            setSelectedFiles(selected);
          }}
        />
      </div>
      <Button
        variant="contained"
        onClick={handleEnqueue}
        disabled={loading || selectedFiles.length === 0}
      >
        {loading ? <CircularProgress size={24} /> : `Enqueue Analysis (${selectedFiles.length})`}
      </Button>

      {/* Queue */}
      <Typography variant="h6" style={{ marginTop: 30 }} gutterBottom>
        Queue (Pending / Done)
      </Typography>
      <div style={{ height: 400, marginBottom: 20 }}>
        <DataGrid
          rows={queueItems.map((x) => ({ ...x, id: x.id }))}
          columns={queueColumns}
          className="data-table"
          pageSizeOptions={[5, 10, 25]}
        />
      </div>

      {/* Previous Analyses */}
      <Typography variant="h6" style={{ marginTop: 30 }} gutterBottom>
        Previous Analyses
      </Typography>
      <div style={{ height: 400 }}>
        <DataGrid
          rows={analysisRows.map((x) => ({ ...x, id: x.id }))}
          columns={oldAnalysisColumns}
          className="data-table"
          pageSizeOptions={[5, 10, 25]}
        />
      </div>
    </Box>
  );
}
