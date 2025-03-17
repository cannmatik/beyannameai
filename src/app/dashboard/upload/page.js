"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { XMLParser } from "fast-xml-parser";
import "./style.css";

export default function UploadPage() {
  const [files, setFiles] = useState([]);
  const [dragActive, setDragActive] = useState(false);
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
      if (error) {
        setError(error.message);
      } else {
        setFiles(data || []);
      }
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

  const handleFileUpload = async (file) => {
    setError("");
    setLoading(true);
    setStatus("Dosya yükleniyor...");

    try {
      // Dosyayı okuyup metne dönüştürüyoruz.
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

      // XML'den gerekli bilgileri çekiyoruz.
      const vergiNo = jsonData?.beyanname?.genel?.mukellef?.vergiNo || "Bilinmiyor";
      const firmaAdiRaw = jsonData?.beyanname?.genel?.mukellef?.soyadi || "Bilinmiyor";
      const firmaAdi = convertTurkishChars(firmaAdiRaw);
      const donemYil = jsonData?.beyanname?.genel?.idari?.donem?.yil || "Bilinmiyor";
      const donemAy = jsonData?.beyanname?.genel?.idari?.donem?.ay || "Bilinmiyor";
      const beyannameTuru = jsonData?.beyanname?.["@_kodVer"] || "Bilinmiyor";

      // Dosya adını benzersiz hale getirmek için zaman damgası ekleniyor.
      const uniqueSuffix = Date.now();
      const fileName = `${firmaAdi}_${donemYil}_${donemAy}_${beyannameTuru}_${uniqueSuffix}.xml`;

      // Dosyayı Supabase Storage'a yüklüyoruz.
      const { data: uploadData, error: storageError } = await supabase.storage
        .from("beyannameler")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (storageError) {
        console.error("Storage upload error:", storageError);
        throw new Error(`Dosya yükleme hatası: ${storageError.message}`);
      }

      console.log("Dosya Storage'a yüklendi:", uploadData);

      // Kullanıcı bilgisini alıyoruz.
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) throw new Error("Kullanıcı oturumu bulunamadı.");

      // Veritabanına kayıt ekliyoruz.
      const { error: insertError } = await supabase
        .from("beyanname")
        .insert([
          {
            user_id: authData.user.id,
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
        console.error("Insert error:", insertError);
        throw new Error(`Veritabanına ekleme hatası: ${insertError.message}`);
      }

      console.log("Dosya veritabanına kaydedildi.");
      setStatus("✅ Dosya başarıyla yüklendi!");
      fetchFiles();
    } catch (err) {
      console.error("File upload error:", err);
      setError(err.message || "Dosya yüklenirken hata oluştu.");
      setStatus("❌ Dosya yüklenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-page">
      <header className="header">
        <Link href="/dashboard" className="nav-button">Dashboard</Link>
        <Link href="/dashboard/files" className="nav-button">Dosyalarım</Link>
      </header>

      <main className="main-content">
        {loading && <div className="loading-bar">⏳ {status}</div>}
        {error && <div className="error-message">⚠️ {error}</div>}
        {status && !loading && <div className="status-message">{status}</div>}

        <div className="files-list">
          <h2>📂 Yüklediğiniz Dosyalar</h2>
          {files.length === 0 && <p>Henüz dosya yüklenmemiş.</p>}
          <ul>
            {files.map((file) => (
              <li key={file.id} className="files-item">
                📄 {file.file_name}
              </li>
            ))}
          </ul>
        </div>

        <div
          className={`upload-dropzone ${dragActive ? "active" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            if (e.dataTransfer.files && e.dataTransfer.files[0]) {
              handleFileUpload(e.dataTransfer.files[0]);
            }
          }}
        >
          <p className="dropzone-text">📂 XML dosyanızı sürükleyip bırakın veya seçin</p>
          <input
            type="file"
            accept=".xml"
            id="fileInput"
            style={{ display: "none" }}
            onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
          />
          <label htmlFor="fileInput" className="dropzone-label">
            Dosya Seç
          </label>
        </div>
      </main>
    </div>
  );
}
