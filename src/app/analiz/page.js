"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import {
  Button,
  Typography,
  Box,
  Snackbar,
  Alert,
  Dialog,
  DialogContent,
  DialogActions,
  DialogTitle,
  IconButton,
  CircularProgress,
} from "@mui/material";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import "./analiz-style.css";

/* MUI Icons */
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorIcon from "@mui/icons-material/Error";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import VisibilityIcon from "@mui/icons-material/Visibility";

/* Daktilo Efektli Başlık Bileşeni */
const Typewriter = ({ texts, speed = 100, delay = 2000 }) => {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [charIndex, setCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentText = texts[currentIndex];
    const timeout = setTimeout(() => {
      if (!isDeleting && charIndex < currentText.length) {
        setDisplayText((prev) => prev + currentText[charIndex]);
        setCharIndex(charIndex + 1);
      } else if (isDeleting && charIndex > 0) {
        setDisplayText((prev) => prev.slice(0, -1));
        setCharIndex(charIndex - 1);
      } else if (!isDeleting && charIndex === currentText.length) {
        setTimeout(() => setIsDeleting(true), delay);
      } else if (isDeleting && charIndex === 0) {
        setIsDeleting(false);
        setCurrentIndex((prev) => (prev + 1) % texts.length);
      }
    }, isDeleting ? speed / 2 : speed);

    return () => clearTimeout(timeout);
  }, [charIndex, isDeleting, currentIndex, texts, speed, delay]);

  return (
    <Typography
      variant="h4"
      sx={{ color: "#bd2f2c", fontWeight: "bold" }}
      className="typewriter"
    >
      {displayText}
      <span className="cursor">|</span>
    </Typography>
  );
};

export default function AnalizPage() {
  const [files, setFiles] = useState([]);
  const [combinedItems, setCombinedItems] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });
  const [openPopup, setOpenPopup] = useState(false);
  const [popupContent, setPopupContent] = useState("");
  const [pdfProgressDialog, setPdfProgressDialog] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [beyannameDialogOpen, setBeyannameDialogOpen] = useState(false);
  const [selectedBeyannameIds, setSelectedBeyannameIds] = useState([]);
  const [beyannameDetails, setBeyannameDetails] = useState([]);

  const analyzeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/queue-analyze`;
  const checkStatusUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/check-status`;
  const generatePdfUrl = "/api/generate-pdf";

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(fetchAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;

    const { data: beyannameData, error: beyannameError } = await supabase
      .from("beyanname")
      .select("*")
      .eq("user_id", session.user.id)
      .order("donem_yil", { ascending: false })
      .order("donem_ay", { ascending: false });

    if (beyannameError) {
      console.error("fetchBeyanname error:", beyannameError);
    }
    setFiles(beyannameData || []);

    const { data: queueData, error: queueError } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (queueError) {
      console.error("fetchQueue error:", queueError);
      setSnackbar({
        open: true,
        message: "Analiz kuyruğu çekilemedi.",
        severity: "error",
      });
      return;
    }

    const { data: analysisData, error: analysisError } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (analysisError) {
      console.error("fetchAnalysis error:", analysisError);
    }

    const combined = queueData.map((queueItem) => {
      const analysisItem = analysisData?.find(
        (a) => a.unique_id === queueItem.unique_id
      );
      return {
        id: analysisItem?.id || queueItem.id,
        unique_id: queueItem.unique_id,
        status: queueItem.status,
        created_at: queueItem.created_at,
        analysis_response: analysisItem?.analysis_response || null,
        pdf_url: analysisItem?.pdf_url || null,
        beyanname_ids: analysisItem?.beyanname_ids || queueItem.beyanname_ids,
      };
    });
    setCombinedItems(combined || []);
  };

  const handleAnalyze = async () => {
    if (!selectedFiles.length) {
      setSnackbar({
        open: true,
        message: "Lütfen en az bir beyanname seçin.",
        severity: "error",
      });
      return;
    }
    setLoading(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const uniqueId = uuidv4();
      const payload = {
        unique_id: uniqueId,
        user_id: session.user.id,
        beyanname_ids: selectedFiles.map((f) => f.id),
        json_data: selectedFiles.map((f) => f.json_data),
      };

      const res = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());

      setSnackbar({
        open: true,
        message: "Analiz kuyruğa eklendi.",
        severity: "success",
      });
      setSelectedFiles([]);
      fetchAllData();
    } catch (err) {
      console.error("Analyze error:", err);
      setSnackbar({
        open: true,
        message: `Hata: ${err.message}`,
        severity: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (uniqueId) => {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const res = await fetch(`${checkStatusUrl}?unique_id=${uniqueId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());

      const result = await res.json();
      if (result.completed) {
        setSnackbar({
          open: true,
          message: "Analiz tamamlandı!",
          severity: "success",
        });
        fetchAllData();
      } else if (result.status === "processing") {
        setSnackbar({
          open: true,
          message: "Analiz hala devam ediyor...",
          severity: "info",
        });
      } else if (result.status === "pending") {
        setSnackbar({
          open: true,
          message: "Analiz kuyrukta bekliyor.",
          severity: "info",
        });
      } else if (result.status === "failed") {
        setSnackbar({
          open: true,
          message: "Analiz başarısız oldu.",
          severity: "error",
        });
      }
    } catch (err) {
      console.error("Check status error:", err);
      setSnackbar({
        open: true,
        message: `Durum sorgulama hatası: ${err.message}`,
        severity: "error",
      });
    }
  };

  const generatePdf = async (uniqueId, analysisResponse) => {
    setLoading(true);
    setPdfProgressDialog(true);
    setPdfProgress(0);
    setProgressMessage("Başlatılıyor...");

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const payload = { unique_id: uniqueId, analysis_response: analysisResponse };

      const response = await fetch(generatePdfUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok)
        throw new Error(`PDF oluşturma isteği başarısız: ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let accumulatedData = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulatedData += chunk;

        const lines = accumulatedData.split("\n");
        accumulatedData = lines.pop();

        for (const line of lines) {
          if (!line.trim()) continue;

          if (line.startsWith("progress:")) {
            const progressMatch = line.match(/progress:\s*(\d+)/);
            const messageMatch = line.match(/message:\s*(.+)/);

            const progress = progressMatch
              ? parseInt(progressMatch[1], 10)
              : pdfProgress;
            const message = messageMatch ? messageMatch[1] : progressMessage;

            setPdfProgress(progress);
            setProgressMessage(message);
          } else if (line.startsWith("data:")) {
            const jsonString = line.replace("data:", "").trim();
            try {
              const result = JSON.parse(jsonString);
              if (result.success) {
                setSnackbar({
                  open: true,
                  message: "PDF oluşturuldu ve indiriliyor...",
                  severity: "success",
                });
                window.open(result.pdfUrl, "_blank");
                fetchAllData();
              }
            } catch (parseError) {
              console.error("JSON parse error:", parseError, "Raw data:", jsonString);
              throw new Error("Sunucudan gelen veri hatalı formatta.");
            }
          } else if (line.startsWith("error:")) {
            const errorMsg = line.replace("error:", "").trim();
            setSnackbar({
              open: true,
              message: `PDF oluşturma hatası: ${errorMsg}`,
              severity: "error",
            });
          }
        }
      }
    } catch (err) {
      console.error("PDF generation error:", err);
      setSnackbar({
        open: true,
        message: `PDF oluşturma hatası: ${err.message}`,
        severity: "error",
      });
    } finally {
      setLoading(false);
      setTimeout(() => setPdfProgressDialog(false), 800);
    }
  };

  const handlePopupOpen = (content) => {
    setPopupContent(content);
    setOpenPopup(true);
  };

  const handlePopupClose = () => {
    setOpenPopup(false);
    setPopupContent("");
  };

  const handleBeyannameDetailsOpen = async (beyannameIds) => {
    try {
      const { data, error } = await supabase
        .from("beyanname")
        .select("id, firma_adi, vergi_no, donem_yil, donem_ay, beyanname_turu, json_data") // id eklendi
        .in("id", beyannameIds);
      if (error) throw error;
      setSelectedBeyannameIds(beyannameIds);
      setBeyannameDetails(data || []);
      setBeyannameDialogOpen(true);
    } catch (err) {
      setSnackbar({
        open: true,
        message: `Beyanname detayları çekilemedi: ${err.message}`,
        severity: "error",
      });
    }
  };

  const handleBeyannameDialogClose = () => {
    setBeyannameDialogOpen(false);
    setSelectedBeyannameIds([]);
    setBeyannameDetails([]);
  };

  const beyannameCols = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Yıl", width: 100 },
    { field: "donem_ay", headerName: "Ay", width: 100 },
    { field: "beyanname_turu", headerName: "Beyanname Türü", flex: 1 },
  ];

  const combinedCols = [
    {
      field: "id",
      headerName: "Analiz ID",
      width: 220,
      renderCell: ({ value }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            size="small"
            onClick={() => {
              navigator.clipboard.writeText(value);
              setSnackbar({
                open: true,
                message: "ID kopyalandı!",
                severity: "success",
              });
            }}
            sx={{ color: "#bd2f2c", "&:hover": { color: "#a12825" } }}
          >
            <ContentCopyIcon fontSize="small" />
          </IconButton>
          <Typography>{value}</Typography>
        </Box>
      ),
    },
    {
      field: "status",
      headerName: "Durum",
      width: 120,
      renderCell: ({ value }) => (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "100%",
          }}
        >
          {value === "completed" && <CheckCircleIcon sx={{ color: "green" }} />}
          {(value === "pending" || value === "processing") && (
            <HourglassTopIcon
              sx={{
                color: "#bd2f2c",
                animation: "spin 1s linear infinite",
              }}
            />
          )}
          {value === "failed" && <ErrorIcon sx={{ color: "red" }} />}
        </Box>
      ),
    },
    {
      field: "created_at",
      headerName: "Tarih",
      width: 160,
      renderCell: ({ value }) => new Date(value).toLocaleString("tr-TR"),
    },
    {
      field: "beyanname_ids",
      headerName: "Kullanılan Beyannameler",
      width: 200,
      renderCell: ({ value }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <Typography>{value.length} Beyanname</Typography>
          <IconButton
            size="small"
            onClick={() => handleBeyannameDetailsOpen(value)}
            sx={{ color: "#bd2f2c", "&:hover": { color: "#a12825" } }}
          >
            <VisibilityIcon fontSize="small" />
          </IconButton>
        </Box>
      ),
    },
    {
      field: "analysis_response",
      headerName: "Analiz Özeti",
      flex: 1,
      renderCell: ({ value }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          {value ? (
            <>
              <IconButton
                size="small"
                onClick={() => handlePopupOpen(value)}
                sx={{ color: "#bd2f2c", "&:hover": { color: "#a12825" } }}
              >
                <FullscreenIcon fontSize="small" />
              </IconButton>
              {value.length > 100 ? value.slice(0, 100) + "..." : value}
            </>
          ) : (
            "Analiz Bekleniyor"
          )}
        </Box>
      ),
    },
    {
      field: "actions",
      headerName: "İşlemler",
      width: 220,
      renderCell: ({ row }) => (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            alignItems: "center",
            height: "100%",
          }}
        >
          {row.status !== "completed" && row.status !== "failed" && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => checkStatus(row.unique_id)}
            >
              Durum
            </Button>
          )}
          {row.status === "completed" && !row.pdf_url && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              onClick={() => generatePdf(row.unique_id, row.analysis_response)}
              disabled={loading}
            >
              PDF Oluştur
            </Button>
          )}
          {row.status === "completed" && row.pdf_url && (
            <Button
              variant="contained"
              color="success"
              size="small"
              onClick={() => window.open(row.pdf_url, "_blank")}
            >
              PDF İndir
            </Button>
          )}
        </Box>
      ),
    },
  ];

  const typewriterTexts = [
    "Sorgera Beyanname AI ile Geleceği Analiz Et!",
    "Finansal Verilerinizi Akıllıca Çözün!",
    "Stratejik Kararlar İçin Yapay Zekâ Gücü!",
    "Beyannamelerinizden Daha Fazlasını Alın!",
  ];

  return (
    <Box className="analiz-container">
      <Box sx={{ textAlign: "center", mt: 2, mb: 4 }}>
        <Typewriter texts={typewriterTexts} speed={100} delay={2000} />
        <Typography variant="subtitle1" sx={{ color: "#666", mt: 1 }}>
          Finansal verilerinizi yapay zekâ ile hızlıca çözün, stratejik kararlar alın.
        </Typography>
      </Box>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar({ ...snackbar, open: false })}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity={snackbar.severity} sx={{ width: "100%" }}>
          {snackbar.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={pdfProgressDialog}
        maxWidth="sm"
        fullWidth
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: 2,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            border: "1px solid #bd2f2c",
          },
        }}
      >
        <DialogContent sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="h6" sx={{ mb: 2 }}>
            PDF Oluşturuluyor...
          </Typography>
          <Box sx={{ position: "relative", display: "inline-flex" }}>
            <CircularProgress
              variant="determinate"
              value={pdfProgress}
              size={100}
              thickness={5}
              sx={{ color: "#bd2f2c" }}
            />
            <Box
              sx={{
                top: 0,
                left: 0,
                bottom: 0,
                right: 0,
                position: "absolute",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Typography
                variant="body2"
                component="div"
                color="text.secondary"
              >{`${Math.round(pdfProgress)}%`}</Typography>
            </Box>
          </Box>
          <Typography variant="body2" sx={{ color: "#666", mt: 2 }}>
            {progressMessage}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ justifyContent: "center", pb: 2 }}>
          <Button
            onClick={() => setPdfProgressDialog(false)}
            disabled={pdfProgress < 100}
            sx={{ color: "#bd2f2c" }}
          >
            Kapat
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={openPopup}
        onClose={handlePopupClose}
        maxWidth="md"
        fullWidth
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: 2,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            border: "1px solid #bd2f2c",
          },
        }}
      >
        <DialogActions sx={{ p: 1 }}>
          <IconButton onClick={handlePopupClose} sx={{ color: "#bd2f2c" }}>
            <CloseIcon />
          </IconButton>
        </DialogActions>
        <DialogContent sx={{ p: 3, bgcolor: "#f9f9f9" }}>
          <Typography
            variant="body1"
            sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6 }}
          >
            {popupContent}
          </Typography>
        </DialogContent>
      </Dialog>

      <Dialog
        open={beyannameDialogOpen}
        onClose={handleBeyannameDialogClose}
        maxWidth="md"
        fullWidth
        sx={{
          "& .MuiDialog-paper": {
            borderRadius: 2,
            boxShadow: "0 10px 30px rgba(0, 0, 0, 0.2)",
            border: "1px solid #bd2f2c",
          },
        }}
      >
        <DialogTitle>Kullanılan Beyannameler</DialogTitle>
        <DialogContent sx={{ p: 3 }}>
          <DataGrid
            rows={beyannameDetails}
            columns={beyannameCols}
            getRowId={(row) => row.id} // Benzersiz id için getRowId zaten tanımlı
            autoHeight
            disableSelectionOnClick
            localeText={{
              footerRowPerPage: "Sayfadaki Satır:",
              footerTotalRows: "Toplam Kayıt:",
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleBeyannameDialogClose} sx={{ color: "#bd2f2c" }}>
            Kapat
          </Button>
        </DialogActions>
      </Dialog>

      <Typography variant="h6" className="section-title" sx={{ mt: 2 }}>
        Beyannameler
      </Typography>
      <div className="table-wrapper">
        <DataGrid
          rows={files}
          columns={beyannameCols}
          checkboxSelection
          onRowSelectionModelChange={(sel) => {
            const selected = files.filter((row) => sel.includes(row.id));
            setSelectedFiles(selected);
          }}
          getRowId={(row) => row.id}
          className="data-table"
          pageSizeOptions={[10, 25, 50, 100]}
          pagination
          localeText={{
            footerRowPerPage: "Sayfadaki Satır:",
            footerTotalRows: "Toplam Kayıt:",
          }}
        />
      </div>

      <Button
        variant="contained"
        disabled={loading || !selectedFiles.length}
        onClick={handleAnalyze}
        className="analyze-button"
        sx={{
          mt: 2,
          backgroundColor: "#bd2f2c",
          "&:hover": { backgroundColor: "#a12825" },
        }}
      >
        {loading ? "Yükleniyor..." : `Analize Gönder (${selectedFiles.length})`}
      </Button>

      <Typography variant="h6" className="section-title" sx={{ mt: 4 }}>
        Analizler
      </Typography>
      <div className="table-wrapper">
        <DataGrid
          rows={combinedItems}
          columns={combinedCols}
          getRowId={(row) => row.id}
          className="data-table"
          disableRowSelectionOnClick
          initialState={{
            pagination: { paginationModel: { pageSize: 10, page: 0 } },
            sorting: { sortModel: [{ field: "created_at", sort: "desc" }] },
          }}
          pageSizeOptions={[10]}
          pagination
          localeText={{
            footerRowPerPage: "Sayfadaki Analiz:",
            footerTotalRows: "Toplam Analiz:",
          }}
        />
      </div>
    </Box>
  );
}