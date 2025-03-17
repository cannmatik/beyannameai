'use client';

import Link from 'next/link';
import styles from './page.module.css';

export default function HomePage() {
  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <h1 className="text-4xl font-bold">Beyanname Analiz Platformu</h1>
        <p className="text-gray-600">
          Lütfen hesabınıza giriş yapın veya yeni hesap oluşturun.
        </p>

        <div className={styles.ctas}>
          <Link href="/login" className={styles.primary}>
            Giriş Yap
          </Link>
          <Link href="/signup" className={styles.secondary}>
            Kayıt Ol
          </Link>
        </div>
      </main>
    </div>
  );
}
