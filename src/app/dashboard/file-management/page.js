// app/dashboard/file-management/page.js
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { XMLParser, XMLBuilder } from "fast-xml-parser";
import { DataGrid } from "@mui/x-data-grid";
import JSZip from "jszip";
import "@/app/styles/dashboard-style.css";

export default function FileManagement() {
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [previewFile, setPreviewFile] = useState(null);
  const [showFullXml, setShowFullXml] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      await fetchFiles(user.id);
      setLoading(false);
    };
    fetchData();
  }, [router]);

  const fetchFiles = async (userId) => {
    try {
      setLoading(true);
      setStatus("Dosyalar yükleniyor...");
      const { data, error } = await supabase
        .from("beyanname")
        .select("*")
        .eq("user_id", userId)
        .order("donem_yil", { ascending: false })
        .order("donem_ay", { ascending: false });

      if (error) throw error;
      setFiles(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  const convertTurkishChars = (str) => {
    return str
      .replace(/Ğ/g, "G")
      .replace(/Ü/g, "U")
      .replace(/Ş/g, "S")
      .replace(/İ/g, "I")
      .replace(/Ö/g, "O")
      .replace(/Ç/g, "C")
      .replace(/ğ/g, "g")
      .replace(/ü/g, "u")
      .replace(/ş/g, "s")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ç/g, "c")
      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9-_]/g, "")
      .trim();
  };

  const handleMultipleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return;
    setError("");
    setLoading(true);
    setStatus("Dosyalar yükleniyor...");

    try {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Kullanıcı bulunamadı.");

      for (const file of fileList) {
        await processSingleFile(file, authData.user.id);
      }
      setStatus("✅ Dosyalar başarıyla yüklendi!");
      fetchFiles(authData.user.id);
    } catch (err) {
      setError(err.message || "Dosya(lar) yüklenirken hata oluştu.");
      setStatus("❌ Dosya(lar) yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
      setShowUploadModal(false);
    }
  };

  const processSingleFile = async (file, userId) => {
    const fileText = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const decoder = new TextDecoder("iso-8859-9");
          resolve(decoder.decode(reader.result));
        } catch (decodeError) {
          reject(decodeError);
        }
      };
      reader.onerror = () => reject(new Error("Dosya okunurken hata oluştu."));
      reader.readAsArrayBuffer(file);
    });

    const parser = new XMLParser({ ignoreAttributes: false });
    const jsonData = parser.parse(fileText);

    const vergiNo =
      jsonData?.beyanname?.genel?.mukellef?.vergiNo || "Bilinmiyor";
    const firmaAdiRaw =
      jsonData?.beyanname?.genel?.mukellef?.soyadi || "Bilinmiyor";
    const firmaAdi = convertTurkishChars(firmaAdiRaw);
    const donemYil =
      jsonData?.beyanname?.genel?.idari?.donem?.yil || "Bilinmiyor";
    const donemAy =
      jsonData?.beyanname?.genel?.idari?.donem?.ay || "Bilinmiyor";
    const beyannameTuru =
      jsonData?.beyanname?.["@_kodVer"] || "Bilinmiyor";

    const uniqueSuffix = Date.now();
    const fileName = `${firmaAdi}_${donemYil}_${donemAy}_${beyannameTuru}_${uniqueSuffix}.xml`;

    const { data: uploadData, error: storageError } = await supabase.storage
      .from("beyannameler")
      .upload(fileName, file, { cacheControl: "3600", upsert: false });
    if (storageError)
      throw new Error(`Dosya yükleme hatası: ${storageError.message}`);

    const { error: insertError } = await supabase.from("beyanname").insert([
      {
        user_id: userId,
        file_name: fileName,
        file_url: uploadData.path,
        json_data: jsonData,
        vergi_no: vergiNo,
        firma_adi: firmaAdiRaw,
        donem_yil: donemYil,
        donem_ay: donemAy,
        beyanname_turu: beyannameTuru,
      },
    ]);
    if (insertError)
      throw new Error(`Veritabanına ekleme hatası: ${insertError.message}`);
  };

  const jsonToXml = (jsonData) => {
    const builder = new XMLBuilder({
      format: true,
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      suppressEmptyNode: true,
      processEntities: false,
    });
    return (
      '<?xml version="1.0" encoding="iso-8859-9"?>\n' +
      builder.build(jsonData?.beyanname || {})
    );
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
      .then(() => setStatus("XML içeriği kopyalandı!"))
      .catch((err) => setError("Kopyalama hatası: " + err.message));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultipleFiles(e.dataTransfer.files);
    }
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
          className="nav-button preview-btn"
          onClick={() => {
            setPreviewFile(jsonToXml(params.row.json_data));
            setShowPreviewModal(true);
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
          className="nav-button download-btn"
          onClick={() => handleDownload(params.row.file_url, params.row.file_name)}
        >
          ⬇️ İndir
        </button>
      ),
    },
  ];

  const rows = files.map((file, index) => ({
    ...file,
    id:
      file.id != null && !isNaN(Number(file.id)) ? String(file.id) : String(index),
  }));

  return (
    <div className="dashboard-container">
      {loading && <div className="loading-bar">⏳ {status || "Yükleniyor..."}</div>}
      {error && <div className="error-message">⚠️ {error}</div>}
      {status && !loading && <div className="status-message">{status}</div>}

      <h1 className="page-title">Dosya Yönetimi</h1>

      <div className="files-section">
        <div className="table-header">
          <h2 className="section-title">Yüklenen Beyannameler</h2>
          <div className="table-actions">
            <button
              className="nav-button upload-button"
              onClick={() => setShowUploadModal(true)}
            >
              Yeni Beyanname Yükle
            </button>
            {selectedFiles.length > 0 && (
              <button
                className="nav-button bulk-download-button"
                onClick={handleBulkDownload}
              >
                Seçilenleri İndir ({selectedFiles.length})
              </button>
            )}
          </div>
        </div>

        <div className="table-wrapper">
          {files.length === 0 && <p>Henüz dosya yüklenmemiş.</p>}
          {files.length > 0 && (
            <DataGrid
              className="data-table"
              rows={rows}
              columns={columns}
              checkboxSelection
              onRowSelectionModelChange={(newSelectionModel) => {
                const selected = rows.filter((file) =>
                  newSelectionModel.includes(file.id)
                );
                setSelectedFiles(selected);
              }}
              hideFooterSelectedRowCount
              pagination
            />
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="modal-overlay" onClick={() => setShowUploadModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Beyanname Yükle</h2>
            <div
              className={`upload-dropzone ${dragActive ? "active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragActive(false);
              }}
              onDrop={handleDrop}
            >
              <p className="dropzone-text">
                📂 XML dosyalarınızı sürükleyip bırakın ya da seçin.
              </p>
              <input
                type="file"
                accept=".xml"
                id="fileInput"
                style={{ display: "none" }}
                multiple
                onChange={(e) => {
                  if (e.target.files) handleMultipleFiles(e.target.files);
                }}
              />
              <label htmlFor="fileInput" className="dropzone-label">
                Dosya Seç
              </label>
            </div>
            <button
              className="nav-button close-button"
              onClick={() => setShowUploadModal(false)}
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* Preview Modal */}
      {showPreviewModal && previewFile && (
        <div className="modal-overlay" onClick={() => setShowPreviewModal(false)}>
          <div className="modal-content preview-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">XML Önizleme</h2>
            <pre className="xml-preview">
              {showFullXml ? previewFile : previewFile.slice(0, 500) + "..."}
            </pre>
            <div className="preview-buttons">
              <button
                className="nav-button"
                onClick={() => setShowFullXml(!showFullXml)}
              >
                {showFullXml ? "Daha Az Göster" : "Tamamını Göster"}
              </button>
              <button className="nav-button" onClick={handleCopy}>
                Kopyala
              </button>
              <button
                className="nav-button close-button"
                onClick={() => setShowPreviewModal(false)}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}