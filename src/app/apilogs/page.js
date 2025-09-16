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
import VisibilityIcon from "@mui/icons-material/Visibility";

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
        .order("id", { ascending: false }) // id her zaman artar
        .limit(500);
      if (error) throw error;

      const processedData = data.map((row) => {
        let formattedTimestamp = "";
        try {
          if (row.timestamp) {
            const date = new Date(row.timestamp);
          if (!isNaN(date.getTime())) {
            // +3 saat ekle
            date.setHours(date.getHours() + 3);
            formattedTimestamp = date.toLocaleString("tr-TR");
            }
          }
        } catch (e) {
          console.error("Error parsing timestamp:", row.timestamp, e);
        }
        return { ...row, formattedTimestamp };
      });

      setLogs(processedData);
    } catch (err) {
      setError(err.message);
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

  // Tarih filtreleme için özel operator
  const dateFilterOperators = [
    {
      label: "Eşittir",
      value: "equals",
      getApplyFilterFn: (filterItem) => {
        if (!filterItem.value) return null;
        return (params) => {
          const cellDate = new Date(params.value);
          const filterDate = new Date(filterItem.value);
          return (
            cellDate.toDateString() === filterDate.toDateString()
          );
        };
      },
      InputComponent: (props) => (
        <input
          type="date"
          value={props.item.value || ""}
          onChange={(e) => props.applyValue({ ...props.item, value: e.target.value })}
          style={{ padding: "4px", fontSize: "0.9rem" }}
        />
      ),
    },
  ];

  const columns = [
    { field: "id", headerName: "ID", width: 90 },
    { field: "uuid", headerName: "UUID", width: 180 },
    { field: "vkn", headerName: "VKN", width: 120 },
    {
      field: "direction",
      headerName: "Direction",
      width: 120,
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

        return (
          <Chip
            label={value}
            color={color}
            variant={variant}
            size="small"
            sx={{ fontWeight: "bold" }}
          />
        );
      },
    },
    { field: "method", headerName: "Method", width: 100 },
    {
      field: "url",
      headerName: "URL",
      width: 200,
      renderCell: (params) => (
        <Box sx={{ wordBreak: "break-all" }}>{params.value}</Box>
      ),
    },
    { field: "env", headerName: "Env", width: 100 },
    {
      field: "formattedTimestamp",
      headerName: "Timestamp",
      width: 200,
      filterOperators: dateFilterOperators, // özel tarih filtresi
    },
    {
      field: "raw_content",
      headerName: "Raw Content",
      width: 120,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton
          size="small"
          onClick={() =>
            openRawContentModal(
              params.row.raw_content,
              `Raw Log - UUID: ${params.row.uuid || "Unknown"}`
            )
          }
        >
          <VisibilityIcon />
        </IconButton>
      ),
    },
  ];

  return (
    <Box sx={{ width: "100vw", height: "100vh", bgcolor: "#fff" }}>
      {loading && <Typography>⏳ Yükleniyor...</Typography>}
      {error && <Typography color="error">⚠️ {error}</Typography>}

      <Typography
        variant="h5"
        sx={{ mb: 2, fontWeight: "bold", p: 2 }}
      >
        📜 Beyanname API Logs
      </Typography>

      <Box sx={{ height: "85vh", width: "100%" }}>
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
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "#f5f5f5",
              fontWeight: "bold",
            },
            "& .MuiDataGrid-cell": { fontSize: "0.875rem" },
          }}
        />
      </Box>

      {/* Modal */}
      <Dialog open={openModal} onClose={closeModal} maxWidth="lg" fullWidth>
        <DialogTitle>
          {modalTitle}
          <IconButton
            onClick={closeModal}
            sx={{ position: "absolute", right: 8, top: 8 }}
          >
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
  