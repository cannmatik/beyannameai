
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Box,
  Button,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import CloseIcon from "@mui/icons-material/Close";
import "@/app/styles/dashboard-style.css";

export default function BeyannameApiLogsPage() {
  const [groupedLogs, setGroupedLogs] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState({
    vkn: "",
    method: "",
    url: "",
    env: "",
  });
  const [openModal, setOpenModal] = useState(false);
  const [modalContent, setModalContent] = useState("");
  const [modalTitle, setModalTitle] = useState("");

  // Logları UUID'ye göre grupla
  const groupLogsByUuid = (logs) => {
    const grouped = {};
    logs.forEach((log) => {
      const uuid = log.uuid;
      if (!grouped[uuid]) {
        grouped[uuid] = {
          inbound: null,
          others: [],
          hasSuccess: false,
          hasError: false,
        };
      }
      if (log.direction === "inbound") {
        grouped[uuid].inbound = log;
      } else {
        grouped[uuid].others.push(log);
        if (log.direction === "success") grouped[uuid].hasSuccess = true;
        if (log.direction === "error") grouped[uuid].hasError = true;
      }
    });
    // Sadece inbound içeren UUID'leri tut
    return Object.fromEntries(
      Object.entries(grouped).filter(([_, group]) => group.inbound !== null)
    );
  };

  useEffect(() => {
    fetchLogs();

    // Realtime subscribe
    const channel = supabase
      .channel("beyanname_api_logs-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "beyanname_api_logs" },
        (payload) => {
          console.log("Realtime update:", payload);
          fetchLogs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("beyanname_api_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100); // Son 100 kaydı getir

      // Filtreleri uygula
      if (filters.vkn) query = query.eq("vkn", filters.vkn);
      if (filters.method) query = query.eq("method", filters.method);
      if (filters.url) query = query.ilike("url", `%${filters.url}%`);
      if (filters.env) query = query.eq("env", filters.env);

      const { data, error } = await query;

      if (error) throw error;

      // UUID'ye göre grupla
      const grouped = groupLogsByUuid(data || []);
      setGroupedLogs(grouped);
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

  return (
    <Box className="dashboard-container" sx={{ p: 4 }}>
      {loading && <Typography className="loading-bar">⏳ Yükleniyor...</Typography>}
      {error && <Typography className="error-message">⚠️ {error}</Typography>}

      <Typography variant="h4" className="page-title" sx={{ mb: 2 }}>
        📜 Beyanname API Logs (Inbound Akordiyon)
      </Typography>

      {/* Filtreleme Header'ı */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          label="VKN"
          value={filters.vkn}
          onChange={(e) => setFilters({ ...filters, vkn: e.target.value })}
          variant="outlined"
          size="small"
        />
        <TextField
          label="Method"
          value={filters.method}
          onChange={(e) => setFilters({ ...filters, method: e.target.value })}
          variant="outlined"
          size="small"
        />
        <TextField
          label="URL (kısmi)"
          value={filters.url}
          onChange={(e) => setFilters({ ...filters, url: e.target.value })}
          variant="outlined"
          size="small"
        />
        <TextField
          label="Env"
          value={filters.env}
          onChange={(e) => setFilters({ ...filters, env: e.target.value })}
          variant="outlined"
          size="small"
        />
        <Button variant="contained" onClick={fetchLogs} sx={{ mt: { xs: 1, sm: 0 } }}>
          Filtrele
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setFilters({ vkn: "", method: "", url: "", env: "" });
            fetchLogs();
          }}
          sx={{ mt: { xs: 1, sm: 0 } }}
        >
          Temizle
        </Button>
      </Box>

      {Object.entries(groupedLogs).map(([uuid, group]) => (
        <Accordion key={uuid} sx={{ mb: 2 }}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            aria-controls={`panel-${uuid}-content`}
            id={`panel-${uuid}-header`}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {group.hasSuccess && (
                <CheckCircleIcon sx={{ color: "green", fontSize: 20 }} />
              )}
              {group.hasError && <ErrorIcon sx={{ color: "red", fontSize: 20 }} />}
              <Typography sx={{ fontWeight: "bold" }}>
                UUID: {uuid} | VKN: {group.inbound.vkn} | Env: {group.inbound.env} | 
                Timestamp: {new Date(group.inbound.timestamp).toLocaleString("tr-TR")}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>VKN</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell>Method</TableCell>
                  <TableCell>URL</TableCell>
                  <TableCell>Env</TableCell>
                  <TableCell>Timestamp</TableCell>
                  <TableCell>Raw Content</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {/* Inbound satırı */}
                <TableRow>
                  <TableCell>{group.inbound.id}</TableCell>
                  <TableCell>{group.inbound.vkn}</TableCell>
                  <TableCell>
                    <span className={`direction-${group.inbound.direction}`}>
                      {group.inbound.direction}
                    </span>
                  </TableCell>
                  <TableCell>{group.inbound.method}</TableCell>
                  <TableCell>{group.inbound.url}</TableCell>
                  <TableCell>{group.inbound.env}</TableCell>
                  <TableCell>{new Date(group.inbound.timestamp).toLocaleString("tr-TR")}</TableCell>
                  <TableCell>
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => openRawContentModal(group.inbound.raw_content, `Inbound Log - UUID: ${uuid}`)}
                    >
                      Görüntüle
                    </Button>
                  </TableCell>
                </TableRow>
                {/* Diğer direction'lar (outbound, success, error) */}
                {group.others.map((log) => (
                  <TableRow key={`${log.id}-${log.direction}`}>
                    <TableCell>{log.id}</TableCell>
                    <TableCell>{log.vkn}</TableCell>
                    <TableCell>
                      <span className={`direction-${log.direction}`}>
                        {log.direction}
                      </span>
                    </TableCell>
                    <TableCell>{log.method}</TableCell>
                    <TableCell>{log.url}</TableCell>
                    <TableCell>{log.env}</TableCell>
                    <TableCell>{new Date(log.timestamp).toLocaleString("tr-TR")}</TableCell>
                    <TableCell>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => openRawContentModal(log.raw_content, `${log.direction} Log - UUID: ${uuid}`)}
                      >
                        Görüntüle
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AccordionDetails>
        </Accordion>
      ))}

      {/* Raw Content Modal */}
      <Dialog
        open={openModal}
        onClose={closeModal}
        maxWidth="lg"
        fullWidth
        sx={{
          "& .MuiDialog-paper": {
            margin: "auto",
            top: "50%",
            transform: "translateY(-50%)",
          },
        }}
      >
        <DialogTitle>
          {modalTitle}
          <IconButton
            aria-label="close"
            onClick={closeModal}
            sx={{
              position: "absolute",
              right: 8,
              top: 8,
              color: (theme) => theme.palette.grey[500],
            }}
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
              whiteSpace: "pre-wrap",
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
