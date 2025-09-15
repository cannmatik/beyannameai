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
  IconButton,
  TablePagination,
  TableSortLabel,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ErrorIcon from "@mui/icons-material/Error";
import CloseIcon from "@mui/icons-material/Close";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
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
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [order, setOrder] = useState("desc");
  const [orderBy, setOrderBy] = useState("timestamp");

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
    return Object.fromEntries(
      Object.entries(grouped).filter(([_, group]) => group.inbound !== null)
    );
  };

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
  }, [filters]);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from("beyanname_api_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(100);

      if (filters.vkn) query = query.eq("vkn", filters.vkn);
      if (filters.method) query = query.eq("method", filters.method);
      if (filters.url) query = query.ilike("url", `%${filters.url}%`);
      if (filters.env) query = query.eq("env", filters.env);

      const { data, error } = await query;
      if (error) throw error;

      const grouped = groupLogsByUuid(data || []);
      setGroupedLogs(grouped);
      setPage(0);
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

  // Sıralama fonksiyonu
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  // Sıralanmış loglar
  const sortedLogs = Object.entries(groupedLogs).sort((a, b) => {
    const aValue = a[1].inbound[orderBy] || "";
    const bValue = b[1].inbound[orderBy] || "";
    if (orderBy === "timestamp") {
      return order === "asc"
        ? new Date(aValue) - new Date(bValue)
        : new Date(bValue) - new Date(aValue);
    }
    return order === "asc"
      ? String(aValue).localeCompare(String(bValue))
      : String(bValue).localeCompare(String(aValue));
  });

  // Sayfalama için slice
  const paginatedLogs = sortedLogs.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const handleChangePage = (event, newPage) => setPage(newPage);

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  // Tablo başlıkları
  const headCells = [
    { id: "id", label: "ID" },
    { id: "vkn", label: "VKN" },
    { id: "direction", label: "Direction" },
    { id: "method", label: "Method" },
    { id: "url", label: "URL" },
    { id: "env", label: "Env" },
    { id: "timestamp", label: "Timestamp" },
    { id: "raw_content", label: "Raw Content" },
  ];

  return (
    <Box sx={{ p: 4, bgcolor: "#fff", borderRadius: 2, boxShadow: 1 }}>
      {loading && <Typography>⏳ Yükleniyor...</Typography>}
      {error && <Typography color="error">⚠️ {error}</Typography>}

      <Typography variant="h5" sx={{ mb: 3, fontWeight: "bold" }}>
        📜 Beyanname API Logs
      </Typography>

      {/* Filtreleme */}
      <Box sx={{ mb: 3, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField
          label="VKN"
          value={filters.vkn}
          onChange={(e) => setFilters({ ...filters, vkn: e.target.value })}
          variant="outlined"
          size="small"
          sx={{ minWidth: 120 }}
        />
        <TextField
          label="Method"
          value={filters.method}
          onChange={(e) => setFilters({ ...filters, method: e.target.value })}
          variant="outlined"
          size="small"
          sx={{ minWidth: 120 }}
        />
        <TextField
          label="URL (kısmi)"
          value={filters.url}
          onChange={(e) => setFilters({ ...filters, url: e.target.value })}
          variant="outlined"
          size="small"
          sx={{ minWidth: 120 }}
        />
        <TextField
          label="Env"
          value={filters.env}
          onChange={(e) => setFilters({ ...filters, env: e.target.value })}
          variant="outlined"
          size="small"
          sx={{ minWidth: 120 }}
        />
        <Button variant="contained" onClick={fetchLogs}>
          Filtrele
        </Button>
        <Button
          variant="outlined"
          onClick={() => {
            setFilters({ vkn: "", method: "", url: "", env: "" });
            fetchLogs();
          }}
        >
          Temizle
        </Button>
      </Box>

      {/* Accordion ve Tablo */}
      {paginatedLogs.map(([uuid, group]) => (
        <Accordion key={uuid} sx={{ mb: 2, border: "1px solid #e0e0e0" }}>
          <AccordionSummary
            expandIcon={<ExpandMoreIcon />}
            sx={{ bgcolor: "#f9f9f9", "&:hover": { bgcolor: "#f1f1f1" } }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              {group.hasSuccess && <CheckCircleIcon color="success" fontSize="small" />}
              {group.hasError && <ErrorIcon color="error" fontSize="small" />}
              <Typography>
                UUID: {uuid} | VKN: {group.inbound.vkn} | Env: {group.inbound.env} | 
                Timestamp: {new Date(group.inbound.timestamp).toLocaleString("tr-TR")}
              </Typography>
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Table stickyHeader sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  {headCells.map((headCell) => (
                    <TableCell
                      key={headCell.id}
                      sx={{ bgcolor: "#f5f5f5", fontWeight: "bold" }}
                      sortDirection={orderBy === headCell.id ? order : false}
                    >
                      <TableSortLabel
                        active={orderBy === headCell.id}
                        direction={orderBy === headCell.id ? order : "asc"}
                        onClick={() => handleRequestSort(headCell.id)}
                      >
                        {headCell.label}
                      </TableSortLabel>
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                <TableRow hover>
                  <TableCell>{group.inbound.id}</TableCell>
                  <TableCell>{group.inbound.vkn}</TableCell>
                  <TableCell>{group.inbound.direction}</TableCell>
                  <TableCell>{group.inbound.method}</TableCell>
                  <TableCell sx={{ maxWidth: 200, wordBreak: "break-all" }}>
                    {group.inbound.url}
                  </TableCell>
                  <TableCell>{group.inbound.env}</TableCell>
                  <TableCell>
                    {new Date(group.inbound.timestamp).toLocaleString("tr-TR")}
                  </TableCell>
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
                {group.others.map((log) => (
                  <TableRow key={`${log.id}-${log.direction}`} hover>
                    <TableCell>{log.id}</TableCell>
                    <TableCell>{log.vkn}</TableCell>
                    <TableCell>{log.direction}</TableCell>
                    <TableCell>{log.method}</TableCell>
                    <TableCell sx={{ maxWidth: 200, wordBreak: "break-all" }}>
                      {log.url}
                    </TableCell>
                    <TableCell>{log.env}</TableCell>
                    <TableCell>
                      {new Date(log.timestamp).toLocaleString("tr-TR")}
                    </TableCell>
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

      {/* Sayfalama */}
      <TablePagination
        rowsPerPageOptions={[5, 10, 25]}
        component="div"
        count={Object.keys(groupedLogs).length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage="Sayfa başına satır:"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} / ${count}`}
      />

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