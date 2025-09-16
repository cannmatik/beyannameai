"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Typography,
} from "@mui/material";
import { DataGrid } from "@mui/x-data-grid";
import CloseIcon from "@mui/icons-material/Close";

export default function BeyannameApiLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [modalTitle, setModalTitle] = useState("");

  useEffect(() => {
    fetchLogs();

    const channel = supabase
      .channel("beyanname_api_logs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beyanname_api_logs" },
        () => fetchLogs()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("beyanname_api_logs")
        .select("*")
        .order("timestamp", { ascending: false, nullsLast: true })
        .limit(500);

      if (error) throw error;

      // Timestamp kontrolü ve hata yönetimi
      const processedData = data.map((row) => {
        let formattedTimestamp = "";
        try {
          if (row.timestamp) {
            const date = new Date(row.timestamp);
            if (!isNaN(date.getTime())) {
              formattedTimestamp = date.toLocaleString("tr-TR", {
                timeZone: "UTC",
              });
            } else {
              console.warn("Invalid timestamp:", row.timestamp, row);
            }
          } else {
            console.warn("Missing timestamp:", row);
          }
        } catch (e) {
          console.error("Error parsing timestamp:", row.timestamp, e);
        }
        return { ...row, formattedTimestamp };
      });

      console.log("Processed logs:", processedData);

      setLogs(processedData);
    } catch (err) {
      setError(err.message);
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  const openRawContentModal = (content, title) => {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2);
      setModalContent(formatted);
    } catch {
      setModalContent(content);
    }
    setModalTitle(title);
    setOpenModal(true);
  };

  const closeModal = () => {
    setOpenModal(false);
    setModalContent("");
    setModalTitle("");
  };

  const columns = [
    { field: "id", headerName: "ID", width: 90, type: "number", filterable: true },
    { field: "uuid", headerName: "UUID", width: 180, type: "string", filterable: true },
    { field: "vkn", headerName: "VKN", width: 120, type: "string", filterable: true },
    {
      field: "direction",
      headerName: "Direction",
      width: 120,
      type: "string",
      filterable: true,
      renderCell: (params) => {
        if (!params || !params.value)
          return <Chip label="Unknown" size="small" sx={{ fontWeight: "bold" }} />;
        const value = params.value;
        let color = "default";
        let variant = "outlined";

        if (value === "success") {
          color = "success";
          variant = "filled";
        } else if (value === "error") {
          color = "error";
          variant = "filled";
        }

        return <Chip label={value} color={color} variant={variant} size="small" sx={{ fontWeight: "bold" }} />;
      },
    },
    { field: "method", headerName: "Method", width: 100, type: "string", filterable: true },
    {
      field: "url",
      headerName: "URL",
      width: 200,
      type: "string",
      filterable: true,
      renderCell: (params) => {
        if (!params || !params.value) return null;
        return <Box sx={{ wordBreak: "break-all" }}>{params.value}</Box>;
      },
    },
    { field: "env", headerName: "Env", width: 100, type: "string", filterable: true },
    {
      field: "formattedTimestamp",
      headerName: "Timestamp",
      width: 180,
      type: "string",
      filterable: true,
    },
    {
      field: "raw_content",
      headerName: "Raw Content",
      width: 150,
      sortable: false,
      filterable: false,
      renderCell: (params) => {
        if (!params || !params.row) return null;
        return (
          <Button
            variant="outlined"
            size="small"
            onClick={() =>
              openRawContentModal(params.row.raw_content, `Raw Log - UUID: ${params.row.uuid || "Unknown"}`)
            }
          >
            Görüntüle
          </Button>
        );
      },
    },
  ];

  return (
    <Box sx={{ p: 4, bgcolor: "#fff", borderRadius: 2, boxShadow: 1 }}>
      {loading && <Typography>⏳ Yükleniyor...</Typography>}
      {error && <Typography color="error">⚠️ {error}</Typography>}

      <Typography variant="h5" sx={{ mb: 3, fontWeight: "bold" }}>
        📜 Beyanname API Logs
      </Typography>

      <Box sx={{ height: 600, width: "100%" }}>
        <DataGrid
          rows={logs}
          columns={columns}
          getRowId={(row) => row.id}
          initialState={{
            pagination: { paginationModel: { page: 0, pageSize: 10 } },
          }}
          pageSizeOptions={[5, 10, 25]}
          disableRowSelectionOnClick
          sortingOrder={["asc", "desc"]}
          filterMode="client"
          sx={{
            "& .MuiDataGrid-columnHeaders": { bgcolor: "#f5f5f5", fontWeight: "bold" },
            "& .MuiDataGrid-cell": { fontSize: "0.875rem" },
          }}
        />
      </Box>

      {/* Modal */}
      <Dialog open={openModal} onClose={closeModal} maxWidth="lg" fullWidth>
        <DialogTitle>
          {modalTitle}
          <IconButton onClick={closeModal} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <pre
            style={{
              backgroundColor: "#f5f5f5",
              padding: "16px",
              borderRadius: "4px",
              overflow: "auto",
              maxHeight: "60vh",
              fontSize: "12px",
            }}
          >
            {modalContent}
          </pre>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModal} variant="contained">
            Kapat
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
