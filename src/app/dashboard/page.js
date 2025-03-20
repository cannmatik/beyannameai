"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { XMLParser } from "fast-xml-parser";
import "@/app/styles/global-style.css";

export default function Dashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPopup, setShowPopup] = useState(false);
  const [companyData, setCompanyData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }
      setUser(user);

      const { data, error } = await supabase
        .from("company_info")
        .select("firma_adi, vergi_no")
        .eq("user_id", user.id)
        .single();

      if (error || !data) {
        console.error("Error fetching company info:", error ? error.message : "No data returned");
        setShowPopup(true);
      } else {
        setCompanyData(data);
      }
      setLoading(false);
    };

    fetchData();
  }, [router]);

  const handleFileUpload = async (file) => {
    setError("");
    setLoading(true);
    try {
      const fileText = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const decoder = new TextDecoder("iso-8859-9");
          resolve(decoder.decode(reader.result));
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });

      const parser = new XMLParser({ ignoreAttributes: false });
      const jsonData = parser.parse(fileText);

      const vergiNo = jsonData?.beyanname?.genel?.mukellef?.vergiNo || "Bilinmiyor";
      const firmaAdiRaw = jsonData?.beyanname?.genel?.mukellef?.soyadi || "Bilinmiyor";

      const { error: insertError } = await supabase
        .from("company_info")
        .insert([{ user_id: user.id, firma_adi: firmaAdiRaw, vergi_no: vergiNo }]);

      if (insertError) throw new Error(`Kayıt hatası: ${insertError.message}`);

      const { data } = await supabase
        .from("company_info")
        .select("firma_adi, vergi_no")
        .eq("user_id", user.id)
        .single();

      setCompanyData(data);
      setShowPopup(false);
    } catch (err) {
      setError(err.message || "Dosya işlenirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  const handleClosePopup = () => {
    setShowPopup(false);
    setError("");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <Link href="/dashboard" className={`nav-link ${pathname === '/dashboard' ? 'active' : ''}`}>
          Kontrol Paneli
        </Link>
        <Link href="/analiz" className={`nav-link ${pathname === '/analiz' ? 'active' : ''}`}>
          Analiz
        </Link>
        <Link href="/dashboard/upload" className={`nav-link ${pathname === '/dashboard/upload' ? 'active' : ''}`}>
          Dosya Yükle
        </Link>
        <Link href="/dashboard/files" className={`nav-link ${pathname === '/dashboard/files' ? 'active' : ''}`}>
          Dosyalar
        </Link>
        <button onClick={handleLogout} className="logout-btn">Çıkış Yap</button>
      </header>

      {loading ? (
        <div className="loading-spinner">Yükleniyor...</div>
      ) : showPopup ? (
        <div className="popup-overlay">
          <div className="popup-card">
            <p className="popup-title">Bilgi Güncelleme</p>
            <p className="popup-message">Lütfen bir adet beyanname yükleyin.</p>
            {error && <div className="error-text">{error}</div>}
            <div className="upload-section">
              <input
                type="file"
                accept=".xml"
                id="fileInput"
                className="file-input"
                onChange={(e) => e.target.files && handleFileUpload(e.target.files[0])}
              />
              <label htmlFor="fileInput" className="upload-btn">
                XML Yükle
              </label>
            </div>
            <button onClick={handleClosePopup} className="close-btn">
              Kapat
            </button>
          </div>
        </div>
      ) : (
        <main className="dashboard-content">
          <div className="dashboard-card">
            <h1 className="dashboard-heading">Dashboard</h1>
            <p className="welcome-text">Hoşgeldiniz, {user?.email}</p>
            {companyData ? (
              <table className="info-table">
                <tbody>
                  <tr>
                    <td className="table-label">Firma Adı</td>
                    <td className="table-value">{companyData.firma_adi}</td>
                  </tr>
                  <tr>
                    <td className="table-label">Vergi Numarası (VKN)</td>
                    <td className="table-value">{companyData.vergi_no}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="no-data">Henüz firma bilgisi yüklenmemiş.</p>
            )}
          </div>
        </main>
      )}
    </div>
  );
}