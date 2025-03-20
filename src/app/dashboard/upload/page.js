"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { XMLParser } from "fast-xml-parser";

import "@/app/styles/global-style.css";

export default function UploadPage() {
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [dragActive, setDragActive] = useState(false);

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
      setError(err.message);
    } finally {
      setLoading(false);
      setStatus("");
    }
  };

  // Türkçe karakter dönüştürücü
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

  // Tek seferde birden fazla dosya yükleme
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
      fetchFiles();
    } catch (err) {
      setError(err.message || "Dosya(lar) yüklenirken hata oluştu.");
      setStatus("❌ Dosya(lar) yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  // Bir adet dosyayı parse + upload
  const processSingleFile = async (file, userId) => {
    // 1) Dosyayı okuyup metne dönüştür
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

    // 2) XML -> JSON parse
    const parser = new XMLParser({ ignoreAttributes: false });
    const jsonData = parser.parse(fileText);

    // 3) Gerekli alanlar
    const vergiNo = jsonData?.beyanname?.genel?.mukellef?.vergiNo || "Bilinmiyor";
    const firmaAdiRaw = jsonData?.beyanname?.genel?.mukellef?.soyadi || "Bilinmiyor";
    const firmaAdi = convertTurkishChars(firmaAdiRaw);
    const donemYil = jsonData?.beyanname?.genel?.idari?.donem?.yil || "Bilinmiyor";
    const donemAy = jsonData?.beyanname?.genel?.idari?.donem?.ay || "Bilinmiyor";
    const beyannameTuru = jsonData?.beyanname?.["@_kodVer"] || "Bilinmiyor";

    // 4) Dosya adına eşsiz suffix
    const uniqueSuffix = Date.now();
    const fileName = `${firmaAdi}_${donemYil}_${donemAy}_${beyannameTuru}_${uniqueSuffix}.xml`;

    // 5) Supabase Storage'a yükle
    const { data: uploadData, error: storageError } = await supabase.storage
      .from("beyannameler")
      .upload(fileName, file, {
        cacheControl: "3600",
        upsert: false,
      });
    if (storageError) {
      throw new Error(`Dosya yükleme hatası: ${storageError.message}`);
    }

    // 6) Veritabanına kaydet
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
    if (insertError) {
      throw new Error(`Veritabanına ekleme hatası: ${insertError.message}`);
    }
  };

  // Drop alanına dosya bırakma
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleMultipleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="page-container">
      {/* Navbar */}
      <div className="navbar">
        <Link href="/dashboard" className="nav-button">
          Kontrol Paneli
        </Link>
        <Link href="/dashboard/upload" className="nav-button active">
          Beyanname Yükle
        </Link>
        <Link href="/dashboard/files" className="nav-button">
          Beyannamelerim
        </Link>
        <Link href="/analiz" className="nav-button">
          Analiz
        </Link>
      </div>

      {loading && <div className="loading-bar">⏳ {status}</div>}
      {error && <div className="error-message">⚠️ {error}</div>}
      {status && !loading && <div className="status-message">{status}</div>}

      <h1 className="page-title">Beyanname Yükle</h1>

      {/* Yüklenen Dosyalar Listesi */}
      <div>
        <h2 className="section-title">Yüklenen Dosyalar</h2>
        {files.length === 0 && <p>Henüz dosya yüklenmemiş.</p>}
        <ul>
          {files.map((file) => (
            <li key={file.id}>📄 {file.file_name}</li>
          ))}
        </ul>
      </div>

      {/* Dropzone Alanı */}
      <div
        className={`upload-dropzone ${dragActive ? "active" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
        onDrop={handleDrop}
      >
        <p className="dropzone-text">📂 XML dosyalarınızı sürükleyip bırakın ya da seçin.</p>
        <input
          type="file"
          accept=".xml"
          id="fileInput"
          style={{ display: "none" }}
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleMultipleFiles(e.target.files);
            }
          }}
        />
        <label htmlFor="fileInput" className="dropzone-label">
          Dosya Seç
        </label>
      </div>
    </div>
  );
}
