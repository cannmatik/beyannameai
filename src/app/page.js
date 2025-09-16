"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import "@/app/styles/homepage.css";

export default function HomePage() {
  const messages = [
    "Sorgera Beyanname Çözümleri ile Vergi Analizinizi Kolaylaştırın",
    "Beyannamelerinizi Hızlıca Yükleyin ve Analiz Edin",
    "Finansal Verilerinizi Akıllıca Yönetin",
    "Vergi Süreçlerinizi Otomatize Edin",
    "Yapay Zeka ile Daha Güvenilir Analizler",
    "Zaman ve Maliyet Tasarrufu Sağlayın",
    "Kurumsal Çözümlerle Tanışın",
  ];
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const currentMessage = messages[messageIndex];
    const timeout = setTimeout(
      () => {
        if (!isDeleting && index < currentMessage.length) {
          setDisplayedText((prev) => prev + currentMessage[index]);
          setIndex(index + 1);
        } else if (isDeleting && index > 0) {
          setDisplayedText((prev) => prev.slice(0, -1));
          setIndex(index - 1);
        } else if (!isDeleting && index === currentMessage.length) {
          setTimeout(() => setIsDeleting(true), 1500); // 1.5s bekleme
        } else if (isDeleting && index === 0) {
          setIsDeleting(false);
          setMessageIndex((prev) => (prev + 1) % messages.length);
        }
      },
      isDeleting ? 30 : 75 // Daha hızlı: silme 30ms, yazma 75ms
    );

    return () => clearTimeout(timeout);
  }, [index, isDeleting, messageIndex, messages]);

  return (
    <div className="home-page">
      <main className="main-content">
        <motion.div
          className="typewriter-container"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <h1 className="page-title typewriter">{displayedText}</h1>
        </motion.div>
        <motion.p
          className="welcome-text"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          Sorgera ile vergi süreçlerinizi optimize edin, geleceğe hazır olun!
        </motion.p>
        <motion.div
          className="cta-buttons"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.8 }}
        >
          <Link href="/login" className="analyze-button primary-btn">
            Giriş Yap
          </Link>
          <Link href="/signup" className="analyze-button secondary-btn">
            Kayıt Ol
          </Link>
        </motion.div>
      </main>
      <footer className="footer">
        <p>
          Made by Can Matik &copy; Sorgera Yazılım Teknolojileri A.Ş.
        </p>
      </footer>
    </div>
  );
}