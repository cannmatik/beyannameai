"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DataGrid, GridFooterContainer, GridPagination } from "@mui/x-data-grid";
import { XMLBuilder } from "fast-xml-parser";
import JSZip from "jszip";

import "@/app/styles/global-style.css";

export default function FilesPage() {
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [showFullXml, setShowFullXml] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      setStatus("Dosyalar yükleniyor...");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Kullanıcı bulunamadı.");
        return;
      }

      const { data, error } = await supabase
        .from("beyanname")
        .select("*")
        .eq("user_id", user.id)
        .order("donem_yil", { ascending: false })
        .order("donem_ay", { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (err) {
      setError(err.message || "Dosyalar yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const jsonToXml = (jsonData) => {
    const builder = new XMLBuilder({
      format: true,
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      suppressEmptyNode: true,
      processEntities: false,
    });
    const xmlContent = builder.build(jsonData?.beyanname || {});
    return '<?xml version="1.0" encoding="iso-8859-9"?>\n' + xmlContent;
  };

  const handleDownload = async (fileUrl, fileName) => {
    try {
      setLoading(true);
      setStatus(`İndiriliyor: ${fileName}...`);
      const fileData = files.find((f) => f.file_url === fileUrl);
      const xmlContent = jsonToXml(fileData.json_data);

      const blob = new Blob([xmlContent], { type: "text/xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus(`✅ ${fileName} indirildi!`);
    } catch (err) {
      setError(`İndirme hatası: ${fileName} - ${err.message}`);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 2000);
    }
  };

  const handleBulkDownload = async () => {
    if (selectedFiles.length === 0) {
      setError("İndirmek için dosya seçilmedi.");
      return;
    }
    try {
      setLoading(true);
      setStatus("Seçilen dosyalar hazırlanıyor...");
      const zip = new JSZip();

      for (const file of selectedFiles) {
        const xmlContent = jsonToXml(file.json_data);
        zip.file(file.file_name, xmlContent);
      }

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "selected_files.zip";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setStatus("✅ Seçilen dosyalar zip olarak indirildi!");
    } catch (err) {
      setError("Toplu indirme hatası: " + err.message);
    } finally {
      setLoading(false);
      setTimeout(() => setStatus(""), 3000);
    }
  };

  const handleCopy = () => {
    if (!previewFile) return;
    navigator.clipboard
      .writeText(previewFile)
      .then(() => {
        setStatus("XML içeriği kopyalandı!");
      })
      .catch((err) => {
        setError("Kopyalama hatası: " + err.message);
      });
  };

  const columns = [
    {
      field: "firma_adi",
      headerName: "Firma Adı",
      flex: 1,
      minWidth: 150,
      headerAlign: "center",
      align: "center",
    },
    {
      field: "vergi_no",
      headerName: "Vergi No",
      flex: 1,
      minWidth: 120,
      headerAlign: "center",
      align: "center",
    },
    {
      field: "donem_yil",
      headerName: "Yıl",
      width: 100,
      headerAlign: "center",
      align: "center",
    },
    {
      field: "donem_ay",
      headerName: "Ay",
      width: 100,
      headerAlign: "center",
      align: "center",
    },
    {
      field: "beyanname_turu",
      headerName: "Beyanname Türü",
      flex: 1,
      minWidth: 120,
      headerAlign: "center",
      align: "center",
    },
    {
      field: "preview",
      headerName: "Görüntüle",
      width: 140,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <button
          className="nav-button"
          onClick={() => {
            setPreviewFile(jsonToXml(params.row.json_data));
            setShowFullXml(false);
          }}
        >
          👁️ Görüntüle
        </button>
      ),
    },
    {
      field: "download",
      headerName: "İndir",
      width: 140,
      headerAlign: "center",
      align: "center",
      renderCell: (params) => (
        <button
          className="nav-button"
          onClick={() => handleDownload(params.row.file_url, params.row.file_name)}
        >
          ⬇️ İndir
        </button>
      ),
    },
  ];

  const rows = files.map((file, index) => ({
    ...file,
    id: file.id != null && !isNaN(Number(file.id)) ? String(file.id) : String(index),
  }));

  const CustomFooter = () => {
    return (
      <GridFooterContainer>
        <div>
          {selectedFiles.length > 0 && (
            <button className="nav-button" onClick={handleBulkDownload}>
              Seçilenleri İndir ({selectedFiles.length})
            </button>
          )}
        </div>
        <GridPagination />
      </GridFooterContainer>
    );
  };

  return (
    <div className="page-container">
      {/* Navbar */}
      <div className="navbar">
        <Link href="/dashboard" className="nav-button">
          Kontrol Paneli
        </Link>
        <Link href="/dashboard/upload" className="nav-button">
          Beyanname Yükle
        </Link>
        <Link href="/dashboard/files" className="nav-button active">
          Beyannamelerim
        </Link>
        <Link href="/analiz" className="nav-button">
          Analiz
        </Link>
      </div>

      {loading && <div className="loading-bar">⏳ {status || "Yükleniyor..."}</div>}
      {error && <div className="error-message">⚠️ {error}</div>}
      {status && !loading && <div className="status-message">{status}</div>}

      <h1 className="page-title">Beyannamelerim</h1>
      <div className="table-wrapper">
        <DataGrid
          className="data-table"
          rows={rows}
          columns={columns}
          checkboxSelection
          onRowSelectionModelChange={(newSelectionModel) => {
            const selected = rows.filter((file) => newSelectionModel.includes(file.id));
            setSelectedFiles(selected);
          }}
          components={{ Footer: CustomFooter }}
          hideFooterSelectedRowCount
          pagination
        />
      </div>

      {/* XML Önizleme */}
      {previewFile && (
        <div style={{ marginTop: 24 }}>
          <h2 className="section-title">XML Önizleme</h2>
          <pre style={{ background: "#fcfcfc", padding: 16, borderRadius: 6 }}>
            {showFullXml ? previewFile : previewFile.slice(0, 500) + "..."}
          </pre>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="nav-button" onClick={() => setShowFullXml(!showFullXml)}>
              {showFullXml ? "Daha Az Göster" : "Tamamını Göster"}
            </button>
            <button className="nav-button" onClick={handleCopy}>
              Kopyala
            </button>
            <button className="nav-button" onClick={() => setPreviewFile(null)}>
              Kapat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
