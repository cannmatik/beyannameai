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
  TextField,
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

  const [totalCount, setTotalCount] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [fetchLimit, setFetchLimit] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("beyannameFetchLimit");
      return saved ? parseInt(saved, 10) || 500 : 500;
    }
    return 500;
  });

  const [gridState, setGridState] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("beyannameGridState");
      return saved ? JSON.parse(saved) : null;
    }
    return null;
  });

  // Yeni: sütun genişlikleri için state
  const [columnWidths, setColumnWidths] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("beyannameColumnWidths");
      return saved ? JSON.parse(saved) : {};
    }
    return {};
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
    () =>
      Array.from(new Set(logs.map((l) => l.direction).filter(Boolean))).sort(),
    [logs]
  );

  const fetchLogs = useCallback(
    async (limit = fetchLimit) => {
      setLoading(true);
      try {
        const { data, error, count } = await supabase
          .from("beyanname_api_logs")
          .select("*", { count: "estimated" })
          .order("id", { ascending: false })
          .limit(limit);

        if (error) throw error;
        setLogs(data ?? []);
        setTotalCount(count ?? 0);
        setLastUpdated(new Date());
        if (typeof window !== "undefined") {
          localStorage.setItem("beyannameFetchLimit", String(limit));
        }
      } catch (err) {
        setError(err?.message ?? String(err));
      } finally {
        setLoading(false);
      }
    },
    [fetchLimit]
  );

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
  }, [fetchLogs]);

  useEffect(() => {
    if (gridState) {
      localStorage.setItem("beyannameGridState", JSON.stringify(gridState));
    }
  }, [gridState]);

  // sütun genişliği kaydet
  const handleColumnWidthChange = useCallback(
    (params) => {
      setColumnWidths((prev) => {
        const updated = { ...prev, [params.colDef.field]: params.width };
        localStorage.setItem("beyannameColumnWidths", JSON.stringify(updated));
        return updated;
      });
    },
    [setColumnWidths]
  );

  const handleGridStateChange = useCallback((newState) => {
    setGridState((prevState) => {
      if (JSON.stringify(prevState) === JSON.stringify(newState)) {
        return prevState;
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
    { field: "id", headerName: "ID", width: columnWidths["id"] || 90 },
    { field: "uuid", headerName: "UUID", width: columnWidths["uuid"] || 200 },
    {
      field: "vkn",
      headerName: "VKN",
      width: columnWidths["vkn"] || 120,
      type: "singleSelect",
      valueOptions: uniqueVKNs,
    },
    {
      field: "direction",
      headerName: "Durum",
      width: columnWidths["direction"] || 120,
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
      width: columnWidths["method"] || 120,
      type: "singleSelect",
      valueOptions: uniqueMethods,
    },
    { field: "url", headerName: "URL", width: columnWidths["url"] || 250 },
    { field: "env", headerName: "Env", width: columnWidths["env"] || 100 },
    {
      field: "timestamp",
      headerName: "Tarih",
      width: columnWidths["timestamp"] || 180,
      renderCell: (params) => {
        if (!params.value) return "";
        const date = new Date(params.value);
        date.setHours(date.getHours() + 3);
        return date.toLocaleString("tr-TR");
      },
    },
    {
      field: "raw_content",
      headerName: "Detay",
      width: columnWidths["raw_content"] || 100,
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

      <Typography variant="h5" sx={{ mb: 1.5, fontWeight: "bold", p: 2, pb: 1 }}>
        🧾 Beyanname API Logs
      </Typography>

      <Box
        sx={{
          display: "flex",
          gap: 2,
          alignItems: "center",
          flexWrap: "wrap",
          px: 2,
          pb: 1.5,
        }}
      >
        <TextField
          label="Çekilecek kayıt sayısı"
          type="number"
          size="small"
          value={fetchLimit}
          onChange={(e) => {
            const v = Number(e.target.value);
            setFetchLimit(Number.isFinite(v) ? Math.max(1, Math.floor(v)) : 1);
          }}
          inputProps={{ min: 1, step: 50 }}
        />
        <Button variant="contained" onClick={() => fetchLogs(fetchLimit)}>
          Güncelle
        </Button>
        <Button variant="outlined" onClick={() => fetchLogs()}>
          Yenile
        </Button>

        <Typography variant="body2" sx={{ ml: "auto" }}>
          Toplam: {totalCount ?? "—"} | Gösterilen: {logs.length}
          {lastUpdated
            ? ` | Son güncelleme: ${lastUpdated.toLocaleString("tr-TR")}`
            : ""}
        </Typography>
      </Box>

      <Box sx={{ height: "80vh", width: "100%" }}>
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
          onColumnWidthChange={handleColumnWidthChange}
          localeText={{
            toolbarColumns: "Sütunlar",
            toolbarFilters: "Filtreler",
            toolbarDensity: "Yoğunluk",
            toolbarExport: "Dışa Aktar",
          }}
          initialState={
            gridState || {
              pagination: { paginationModel: { page: 0, pageSize: 10 } },
              sorting: { sortModel: [{ field: "timestamp", sort: "desc" }] },
            }
          }
          onStateChange={handleGridStateChange}
          sx={{
            "& .MuiDataGrid-toolbarContainer": {
              justifyContent: "flex-end",
              color: "#800020",
            },
            "& .MuiDataGrid-columnHeaders": {
              bgcolor: "#f5f5f5",
              fontWeight: "bold",
            },
            "& .MuiDataGrid-cell": { fontSize: "0.875rem" },
            "& .MuiDataGrid-virtualScroller": { overflowX: "auto" }, // mobil scroll aktif
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
