"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { DataGrid, GridFooterContainer, GridPagination } from "@mui/x-data-grid";
import { XMLBuilder } from "fast-xml-parser";
import JSZip from "jszip";
import "./files-style.css";

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
    navigator.clipboard
      .writeText(previewFile)
      .then(() => {
        setStatus("XML içeriği kopyalandı!");
      })
      .catch((err) => {
        setError("Kopyalama hatası: " + err.message);
      });
  };

  // Sütun genişliklerini optimize etmek için flex ve minWidth kullanıyoruz.
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
          className="action-btn preview-btn"
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
          className="action-btn download-btn"
          onClick={() => handleDownload(params.row.file_url, params.row.file_name)}
        >
          ⬇️ İndir
        </button>
      ),
    },
  ];

  // Dosya nesnelerini DataGrid'e gönderirken geçerli bir id ataması yapıyoruz.
  // id'yi string olarak atıyoruz.
  const rows = files.map((file, index) => ({
    ...file,
    id: file.id != null && !isNaN(Number(file.id))
      ? String(file.id)
      : String(index),
  }));

  // Özel footer bileşeni: Seçili dosya sayısına göre Toplu İndir butonunu içeriyor.
  const CustomFooter = () => {
    return (
      <GridFooterContainer>
        <div>
          {selectedFiles.length > 0 && (
            <button className="bulk-download-btn" onClick={handleBulkDownload}>
              Seçilenleri İndir ({selectedFiles.length})
            </button>
          )}
        </div>
        <GridPagination />
      </GridFooterContainer>
    );
  };

  return (
    <div className="files-container">
      <header className="files-header">
        <Link href="/dashboard" className="nav-link">
          Dashboard
        </Link>
        <Link href="/dashboard/upload" className="nav-link">
          Dosya Yükle
        </Link>
      </header>

      <main className="files-content">
        {loading && <div className="loading-bar">⏳ {status || "Yükleniyor..."}</div>}
        {error && <div className="error-text">⚠️ {error}</div>}
        {status && !loading && <div className="status-text">{status}</div>}

        <section className="files-panel">
          <h1 className="panel-heading">📂 Beyanname Listesi</h1>
          <div className="table-wrapper">
            <DataGrid
              className="data-table"
              rows={rows}
              columns={columns}
              checkboxSelection
              onSelectionModelChange={(newSelectionModel) => {
                // newSelectionModel, seçilen satırların id'lerini (string) içerir.
                const selected = rows.filter((file) =>
                  newSelectionModel.includes(file.id)
                );
                setSelectedFiles(selected);
              }}
              components={{ Footer: CustomFooter }}
              hideFooterSelectedRowCount
              pagination
              sx={{
                backgroundColor: "#1a1a1a",
                color: "#e0e0e0",
                border: "none",
                "& .MuiDataGrid-columnHeaders": {
                  backgroundColor: "#111",
                  color: "#000",
                  borderBottom: "1px solid #222",
                },
                "& .MuiDataGrid-columnHeaderTitle": {
                  fontWeight: 700,
                  color: "#000",
                },
                "& .MuiDataGrid-cell": {
                  borderBottom: "1px solid #222",
                  color: "#e0e0e0",
                },
                "& .MuiDataGrid-row:hover": {
                  backgroundColor: "#222",
                },
              }}
            />
          </div>
        </section>

        {previewFile && (
          <section className="preview-panel">
            <h1 className="panel-heading">XML Önizleme</h1>
            <pre className="xml-content">
              {showFullXml ? previewFile : previewFile.slice(0, 500) + "..."}
            </pre>
            <div className="preview-actions">
              <button
                className="action-btn toggle-btn"
                onClick={() => setShowFullXml(!showFullXml)}
              >
                {showFullXml ? "Daha Az Göster" : "Tamamını Göster"}
              </button>
              <button className="action-btn" onClick={handleCopy}>
                Kopyala
              </button>
              <button
                className="action-btn close-btn"
                onClick={() => setPreviewFile(null)}
              >
                Kapat
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
