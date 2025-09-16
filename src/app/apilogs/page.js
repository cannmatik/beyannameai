"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
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
import { DataGrid, GridToolbar } from "@mui/x-data-grid";
import CloseIcon from "@mui/icons-material/Close";
import VisibilityIcon from "@mui/icons-material/Visibility";

export default function BeyannameApiLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openModal, setOpenModal] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [modalTitle, setModalTitle] = useState("");

  // Filtre ve sıralama için localStorage
  const [gridState, setGridState] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("beyannameGridState");
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  const uniqueVKNs = useMemo(
    () => Array.from(new Set(logs.map((l) => l.vkn).filter(Boolean))).sort(),
    [logs]
  );
  const uniqueMethods = useMemo(
    () => Array.from(new Set(logs.map((l) => l.method).filter(Boolean))).sort(),
    [logs]
  );
  const uniqueDirections = useMemo(
    () => Array.from(new Set(logs.map((l) => l.direction).filter(Boolean))).sort(),
    [logs]
  );

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("beyanname_api_logs")
          .select("*")
          .order("id", { ascending: false })
          .limit(500);
        if (error) throw error;
        setLogs(data ?? []);
      } catch (err) {
        setError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();

    const channel = supabase
      .channel("beyanname_api_logs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beyanname_api_logs" },
        fetchLogs
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  // Grid state'i kaydet - DEĞİŞTİRİLDİ
  useEffect(() => {
    if (gridState) {
      localStorage.setItem("beyannameGridState", JSON.stringify(gridState));
    }
  }, [gridState]);

  // useCallback ile optimize edilmiş state güncelleme fonksiyonu - YENİ EKLENDİ
  const handleGridStateChange = useCallback((newState) => {
    // Sadece gerçekten değişen state'i güncelle
    setGridState(prevState => {
      if (JSON.stringify(prevState) === JSON.stringify(newState)) {
        return prevState; // Aynıysa güncelleme yapma
      }
      return newState;
    });
  }, []);

  const openRawContentModal = (content, title) => {
    try {
      const formatted = JSON.stringify(JSON.parse(content), null, 2);
      setModalContent(formatted);
    } catch {
      setModalContent(content ?? "");
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
    { field: "id", headerName: "ID", width: 90 },
    { field: "uuid", headerName: "UUID", width: 200 },
    {
      field: "vkn",
      headerName: "VKN",
      width: 120,
      type: "singleSelect",
      valueOptions: uniqueVKNs,
    },
    {
      field: "direction",
      headerName: "Durum",
      width: 120,
      type: "singleSelect",
      valueOptions: uniqueDirections,
      renderCell: (params) => {
        const value = params.value ?? "Unknown";
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
    {
      field: "method",
      headerName: "Method",
      width: 120,
      type: "singleSelect",
      valueOptions: uniqueMethods,
    },
    { field: "url", headerName: "URL", width: 250 },
    { field: "env", headerName: "Env", width: 100 },
    {
      field: "timestamp",
      headerName: "Tarih",
      width: 180,
      renderCell: (params) => {
        if (!params.value) return "";
        const date = new Date(params.value);
        date.setHours(date.getHours() + 3); // UTC +3 Türkiye
        return date.toLocaleString("tr-TR");
      },
    },
    {
      field: "raw_content",
      headerName: "Detay",
      width: 100,
      sortable: false,
      filterable: false,
      renderCell: (params) => (
        <IconButton
          onClick={() =>
            openRawContentModal(
              params.row.raw_content,
              `Log Detayı - UUID: ${params.row.uuid ?? "Unknown"}`
            )
          }
        >
          <VisibilityIcon sx={{ color: "#800020" }} />
        </IconButton>
      ),
    },
  ];

  return (
    <Box sx={{ width: "100%", height: "100vh", bgcolor: "#fff", overflow: "hidden" }}>
      {loading && <Typography sx={{ p: 2 }}>⏳ Yükleniyor...</Typography>}
      {error && (
        <Typography color="error" sx={{ p: 2 }}>
          ⚠️ {error}
        </Typography>
      )}

      <Typography variant="h5" sx={{ mb: 2, fontWeight: "bold", p: 2 }}>
        📜 Beyanname API Logs
      </Typography>

      <Box sx={{ height: "85vh", width: "100%" }}>
        <DataGrid
          rows={logs}
          columns={columns}
          getRowId={(row) => row.id}
          loading={loading}
          pageSizeOptions={[5, 10, 25, 50]}
          disableRowSelectionOnClick
          slots={{ toolbar: GridToolbar }}
          slotProps={{ toolbar: { showQuickFilter: true } }}
          sortingMode="client"
          filterMode="client"
          localeText={{
            toolbarColumns: "Sütunlar",
            toolbarFilters: "Filtreler",
            toolbarDensity: "Yoğunluk",
            toolbarExport: "Dışa Aktar",
          }}
          initialState={gridState || {
            pagination: { paginationModel: { page: 0, pageSize: 10 } },
            sorting: { sortModel: [{ field: "timestamp", sort: "desc" }] },
          }}
          onStateChange={handleGridStateChange} // DEĞİŞTİRİLDİ
          sx={{
            "& .MuiDataGrid-toolbarContainer": { justifyContent: "flex-end", color: "#800020" },
            "& .MuiDataGrid-columnHeaders": { bgcolor: "#f5f5f5", fontWeight: "bold" },
            "& .MuiDataGrid-cell": { fontSize: "0.875rem" },
            "& .MuiDataGrid-virtualScroller": { overflowX: "hidden" },
            "& .MuiButtonBase-root": { color: "#800020" },
          }}
        />
      </Box>

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