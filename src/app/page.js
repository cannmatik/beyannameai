"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import "@/app/styles/global-style.css";

export default function HomePage() {
  const messages = [
    "Sorgera Beyanname AI ile Vergi Analizinizi Kolaylaştırın",
    "Beyannamelerinizi Hızlıca Yükleyin ve Analiz Edin",
    "Finansal Verilerinizi Akıllıca Yönetin",
  ];
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0); // Harf indeksi
  const [messageIndex, setMessageIndex] = useState(0); // Mesaj indeksi
  const [isDeleting, setIsDeleting] = useState(false); // Yazma/silme durumu

  useEffect(() => {
    const currentMessage = messages[messageIndex];
    const timeout = setTimeout(
      () => {
        if (!isDeleting && index < currentMessage.length) {
          // Yazma aşaması
          setDisplayedText((prev) => prev + currentMessage[index]);
          setIndex(index + 1);
        } else if (isDeleting && index > 0) {
          // Silme aşaması
          setDisplayedText((prev) => prev.slice(0, -1));
          setIndex(index - 1);
        } else if (!isDeleting && index === currentMessage.length) {
          // Yazma bitti, silmeye geç
          setTimeout(() => setIsDeleting(true), 2000); // 2 saniye bekle
        } else if (isDeleting && index === 0) {
          // Silme bitti, bir sonraki mesaja geç
          setIsDeleting(false);
          setMessageIndex((prev) => (prev + 1) % messages.length);
        }
      },
      isDeleting ? 50 : 100 // Silme daha hızlı (50ms), yazma 100ms
    );

    return () => clearTimeout(timeout);
  }, [index, isDeleting, messageIndex, messages]);

  return (
    <div className="page-container home-page">
      <main className="main-content">
        <div className="typewriter-container">
          <h1 className="page-title typewriter">{displayedText}</h1>
        </div>
        <p className="welcome-text">
          Beyanname analizlerinizi yapay zeka ile güçlendirin!
        </p>
        <div className="cta-buttons">
          <Link href="/login" className="analyze-button primary-btn">
            Giriş Yap
          </Link>
          <Link href="/signup" className="analyze-button secondary-btn">
            Kayıt Ol
          </Link>
        </div>
      </main>
    </div>
  );
}