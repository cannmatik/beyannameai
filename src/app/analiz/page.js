"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { DataGrid } from "@mui/x-data-grid";
import { Button, Typography, Box, CircularProgress, Snackbar, Alert, Dialog, DialogContent, DialogActions, IconButton } from "@mui/material";
import { v4 as uuidv4 } from "uuid";
import Link from "next/link";
import { motion } from "framer-motion";
import "./analiz-style.css";

/* MUI Icons */
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import ErrorIcon from "@mui/icons-material/Error";
import CloseIcon from "@mui/icons-material/Close";
import FullscreenIcon from "@mui/icons-material/Fullscreen";

// Typewriter bileşeni: Profesyonel ve modern
const Typewriter = ({ texts }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const currentText = texts && texts.length > 0 ? texts[currentIndex] : "Yükleniyor...";

  useEffect(() => {
    if (!texts || texts.length === 0) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, 5000); // Her metin 5 saniye görünür
    return () => clearInterval(interval);
  }, [texts]);

  // Animasyon varyantları: Kayma efekti
  const textVariants = {
    hidden: { opacity: 0, x: -50 }, // Soldan kayarak gelir
    visible: {
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.8, // Yumuşak ve profesyonel geçiş
        ease: "easeInOut",
      },
    },
    exit: {
      opacity: 0,
      x: 50, // Sağa kayarak çıkar
      transition: {
        duration: 0.5,
        ease: "easeInOut",
      },
    },
  };

  // Daire imleç animasyonu
  const dotVariants = {
    blink: {
      opacity: [1, 0, 1],
      transition: {
        duration: 1,
        repeat: Infinity,
        ease: "easeInOut",
      },
    },
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center" }}>
      <motion.div
        key={currentText} // Her metin değişiminde animasyon tetiklenir
        variants={textVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        className="typewriter"
        style={{
          fontSize: "48px",
          fontWeight: "bold",
          color: "#bd2f2c",
        }}
      >
        {currentText}
      </motion.div>
      <motion.span
        variants={dotVariants}
        animate="blink"
        style={{
          display: "inline-block",
          width: "8px",
          height: "8px",
          backgroundColor: "#bd2f2c",
          borderRadius: "50%",
          marginLeft: "8px",
        }}
      />
    </Box>
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
  const [typewriterTexts, setTypewriterTexts] = useState([]);

  const analyzeUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/queue-analyze`;
  const checkStatusUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/check-status`;
  const generatePdfUrl = "/api/generate-pdf";
  const generateTitlesUrl = "/api/generate-titles";

  useEffect(() => {
    fetchAllData();
    fetchTitles();
    const interval = setInterval(fetchAllData, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchAllData = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: beyannameData, error: beyannameError } = await supabase
      .from("beyanname")
      .select("*")
      .eq("user_id", session.user.id)
      .order("donem_yil", { ascending: false })
      .order("donem_ay", { ascending: false });
    if (beyannameError) console.error("fetchBeyanname error:", beyannameError);
    setFiles(beyannameData || []);

    const { data: queueData, error: queueError } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (queueError) {
      console.error("fetchQueue error:", queueError);
      setSnackbar({ open: true, message: "Analiz kuyruğu çekilemedi.", severity: "error" });
      return;
    }

    const { data: analysisData, error: analysisError } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", session.user.id)
      .order("created_at", { ascending: false });
    if (analysisError) console.error("fetchAnalysis error:", analysisError);

    const combined = queueData.map((queueItem) => {
      const analysisItem = analysisData?.find((a) => a.unique_id === queueItem.unique_id);
      return {
        id: queueItem.id,
        unique_id: queueItem.unique_id,
        status: queueItem.status,
        created_at: queueItem.created_at,
        analysis_response: analysisItem?.analysis_response || null,
        pdf_url: analysisItem?.pdf_url || null,
      };
    });

    setCombinedItems(combined || []);
  };

  const fetchTitles = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const res = await fetch(generateTitlesUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!res.ok) throw new Error(await res.text());

      const { titles } = await res.json();
      setTypewriterTexts(titles);
    } catch (err) {
      console.error("Başlık çekme hatası:", err);
      setTypewriterTexts([
        "Sorgera Beyanname AI ile Geleceği Analiz Et!",
        "Finansal Verilerinizi Akıllıca Çözün!",
        "Stratejik Kararlar İçin Yapay Zekâ Gücü!",
      ]);
    }
  };

  const handleAnalyze = async () => {
    if (!selectedFiles.length) {
      setSnackbar({ open: true, message: "Lütfen en az bir beyanname seçin.", severity: "error" });
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
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
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());

      setSnackbar({ open: true, message: "Analiz kuyruğa eklendi.", severity: "success" });
      setSelectedFiles([]);
      fetchAllData();
    } catch (err) {
      console.error("Analyze error:", err);
      setSnackbar({ open: true, message: `Hata: ${err.message}`, severity: "error" });
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = async (uniqueId) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const res = await fetch(`${checkStatusUrl}?unique_id=${uniqueId}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) throw new Error(await res.text());

      const result = await res.json();
      if (result.completed) {
        setSnackbar({ open: true, message: "Analiz tamamlandı!", severity: "success" });
        fetchAllData();
      } else if (result.status === "processing") {
        setSnackbar({ open: true, message: "Analiz hala devam ediyor...", severity: "info" });
      } else if (result.status === "pending") {
        setSnackbar({ open: true, message: "Analiz kuyrukta bekliyor.", severity: "info" });
      } else if (result.status === "failed") {
        setSnackbar({ open: true, message: "Analiz başarısız oldu.", severity: "error" });
      }
    } catch (err) {
      console.error("Check status error:", err);
      setSnackbar({ open: true, message: `Durum sorgulama hatası: ${err.message}`, severity: "error" });
    }
  };

  const generatePdf = async (uniqueId, analysisResponse) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Oturum bulunamadı");

      const res = await fetch(generatePdfUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ unique_id: uniqueId, analysis_response: analysisResponse }),
      });

      if (!res.ok) throw new Error(await res.text());

      const { pdfUrl } = await res.json();
      setSnackbar({ open: true, message: "PDF oluşturuldu ve indiriliyor...", severity: "success" });
      window.open(pdfUrl, "_blank");
      fetchAllData();
    } catch (err) {
      console.error("PDF generation error:", err);
      setSnackbar({ open: true, message: `PDF oluşturma hatası: ${err.message}`, severity: "error" });
    } finally {
      setLoading(false);
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

  const beyannameCols = [
    { field: "firma_adi", headerName: "Firma", flex: 1 },
    { field: "vergi_no", headerName: "Vergi No", flex: 1 },
    { field: "donem_yil", headerName: "Yıl", width: 100 },
    { field: "donem_ay", headerName: "Ay", width: 100 },
    { field: "beyanname_turu", headerName: "Beyanname Türü", flex: 1 },
  ];

  const combinedCols = [
    { field: "unique_id", headerName: "ID", width: 220 },
    {
      field: "status",
      headerName: "Durum",
      width: 120,
      renderCell: ({ value }) => (
        <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}>
          {value === "completed" && <CheckCircleIcon sx={{ color: "green" }} />}
          {(value === "pending" || value === "processing") && (
            <HourglassTopIcon sx={{ color: "#bd2f2c", animation: "spin 1s linear infinite" }} />
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
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", height: "100%" }}>
          {row.status !== "completed" && row.status !== "failed" && (
            <Button variant="contained" color="primary" size="small" onClick={() => checkStatus(row.unique_id)}>
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
            <Button variant="contained" color="success" size="small" onClick={() => window.open(row.pdf_url, "_blank")}>
              PDF İndir
            </Button>
          )}
        </Box>
      ),
    },
  ];

  return (
    <Box className="analiz-container">
      {/* Navbar */}
      <Box className="navbar">
        <Link href="/dashboard"><Button className="nav-button">Kontrol Paneli</Button></Link>
        <Link href="/dashboard/upload"><Button className="nav-button">Beyanname Yükle</Button></Link>
        <Link href="/dashboard/files"><Button className="nav-button">Beyannamelerim</Button></Link>
        <Link href="/analiz"><Button className="nav-button active">Analiz</Button></Link>
      </Box>

      {/* Profesyonel Typewriter Başlık */}
      <Box sx={{ textAlign: "center", mt: 2, mb: 4 }}>
        <Typewriter texts={typewriterTexts} />
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
        <Alert severity={snackbar.severity} sx={{ width: "100%" }}>{snackbar.message}</Alert>
      </Snackbar>

      {/* Modern Popup */}
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
            overflow: "hidden",
            animation: "fadeIn 0.3s ease-in-out",
          },
        }}
      >
        <DialogActions sx={{ p: 1 }}>
          <IconButton onClick={handlePopupClose} sx={{ color: "#bd2f2c" }}>
            <CloseIcon />
          </IconButton>
        </DialogActions>
        <DialogContent sx={{ p: 3, bgcolor: "#f9f9f9" }}>
          <Typography variant="body1" sx={{ whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6 }}>
            {popupContent}
          </Typography>
        </DialogContent>
      </Dialog>

      <Typography variant="h6" className="section-title" sx={{ mt: 2 }}>Beyannameler</Typography>
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
          pageSizeOptions={[10, 25, 50]}
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
        sx={{ mt: 2, backgroundColor: "#bd2f2c", "&:hover": { backgroundColor: "#a12825" } }}
      >
        {loading ? <CircularProgress size={20} /> : `Analize Gönder (${selectedFiles.length})`}
      </Button>

      <Typography variant="h6" className="section-title" sx={{ mt: 4 }}>Analizler</Typography>
      <div className="table-wrapper">
        <DataGrid
          rows={combinedItems}
          columns={combinedCols}
          getRowId={(row) => row.id}
          className="data-table"
          disableRowSelectionOnClick
          pageSizeOptions={[10, 25, 50]}
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