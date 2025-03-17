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
  const [jobStatus, setJobStatus] = useState(null);
  const [pollingId, setPollingId] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisRows, setAnalysisRows] = useState([]);

  // Beyanname dosyalarını çek
  useEffect(() => {
    async function fetchFiles() {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        setError("Please log in.");
        return;
      }
      const { data, error } = await supabase
        .from("beyanname")
        .select("*")
        .eq("user_id", user.id)
        .order("donem_yil", { ascending: false })
        .order("donem_ay", { ascending: false });
      if (error) setError(`Failed to fetch files: ${error.message}`);
      else setFiles(data || []);
    }
    async function fetchPreviousAnalyses() {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session) return;
      const res = await fetch("/api/previous-analyses", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const result = await res.json();
      if (res.ok) {
        const rows = (result.analyses || []).map((item) => ({
          id: item.id,
          created_at: item.created_at,
          pdf_url: item.pdf_url,
        }));
        setAnalysisRows(rows);
      } else {
        setError(`Failed to fetch previous analyses: ${result.error}`);
      }
    }
    fetchFiles();
    fetchPreviousAnalyses();
  }, []);

  async function handleAnalyze() {
    if (selectedFiles.length === 0) {
      setError("Select at least one file.");
      return;
    }
    setError("");
    setQueueId(null);
    setJobStatus(null);

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session) {
      setError("Session not found. Please log in again.");
      return;
    }

    setLoading(true);
    try {
      const combinedData = selectedFiles.map((file) => ({
        firma_adi: file.firma_adi,
        vergi_no: file.vergi_no,
        donem_yil: file.donem_yil,
        donem_ay: file.donem_ay,
        json_data: file.json_data,
      }));

      const res = await fetch("/api/queue-analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ data: combinedData }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add to queue.");
      setQueueId(json.queue_id);
      setJobStatus({ status: "pending" });
      const interval = setInterval(async () => {
        await checkStatus(json.queue_id, session.access_token);
      }, 3000);
      setPollingId(interval);
    } catch (err) {
      setError(`Failed to enqueue: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function checkStatus(qId, token) {
    try {
      const res = await fetch(`/api/analysis-status?queue_id=${qId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (res.ok && json.queue) {
        setJobStatus(json.queue);
        if (json.queue.status === "done" || json.queue.status === "error") {
          clearInterval(pollingId);
          setPollingId(null);
        }
      } else {
        setError(json.error || "Error fetching status.");
      }
    } catch (err) {
      setError(`Status check failed: ${err.message}`);
    }
  }

  const oldAnalysisColumns = [
    {
      field: "id",
      headerName: "Analysis ID",
      width: 120,
    },
    {
      field: "created_at",
      headerName: "Date",
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
        if (!params.value) return "None";
        return (
          <a href={params.value} target="_blank" rel="noopener noreferrer">
            Download
          </a>
        );
      },
    },
  ];

  return (
    <Box className="analiz-container">
      <Box className="analiz-header">
        <Typography variant="h4">📂 Beyanname Analysis (Async)</Typography>
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
            { field: "firma_adi", headerName: "Firma", flex: 1 },
            { field: "vergi_no", headerName: "Vergi No", flex: 1 },
            { field: "donem_yil", headerName: "Year", width: 100 },
            { field: "donem_ay", headerName: "Month", width: 100 },
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
        {loading ? <CircularProgress size={24} /> : `Enqueue Analysis (${selectedFiles.length})`}
      </Button>

      {queueId && (
        <Box mt={3} className="analiz-result">
          <Typography variant="h6">Queue ID: {queueId}</Typography>
          {jobStatus && (
            <>
              <Typography>
                Status: <strong>{jobStatus.status}</strong>
              </Typography>
              {jobStatus.status === "done" && (
                <>
                  <Typography>GPT Response: {jobStatus.result}</Typography>
                  {jobStatus.pdf_url && (
                    <p>
                      <a href={jobStatus.pdf_url} target="_blank" rel="noopener noreferrer">
                        Download PDF
                      </a>
                    </p>
                  )}
                </>
              )}
              {jobStatus.status === "error" && (
                <Typography color="error">Error: {jobStatus.result}</Typography>
              )}
            </>
          )}
        </Box>
      )}

      <Box className="previous-analyses" mt={4}>
        <Typography variant="h5">Previous Analyses</Typography>
        {analysisRows.length === 0 ? (
          <Typography>No previous analyses found.</Typography>
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
