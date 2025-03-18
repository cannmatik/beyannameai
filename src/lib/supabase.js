// src/app/lib/supabase.js
import { createClient } from '@supabase/supabase-js';

// Ortam değişkenlerini al
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Ortam değişkenlerinin varlığını kontrol et ve hata fırlat
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("Hata: Supabase ortam değişkenleri eksik!");
  console.error("NEXT_PUBLIC_SUPABASE_URL:", supabaseUrl);
  console.error("NEXT_PUBLIC_SUPABASE_ANON_KEY:", supabaseAnonKey);
  throw new Error(
    "Supabase yapılandırması başarısız: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_ANON_KEY tanımlanmalı."
  );
}

// Supabase istemcisini oluştur
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true, // Token otomatik yenileme
    persistSession: true, // Oturumu yerel depolamada sakla
    detectSessionInUrl: true, // URL'deki oturum bilgilerini algıla (örneğin, OAuth sonrası)
  },
});

// İstemci oluşturulduğunu logla (opsiyonel, geliştirme için faydalı)
if (process.env.NODE_ENV === "development") {
  console.log("Supabase istemcisi başarıyla oluşturuldu:", supabaseUrl);
}

// Oturum durumunu izlemek için bir yardımcı fonksiyon (isteğe bağlı)
export const getSession = async () => {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) {
      console.error("Oturum alınamadı:", error.message);
      throw error;
    }
    return session;
  } catch (err) {
    console.error("getSession hatası:", err);
    return null;
  }
};

// Oturum değişikliklerini izlemek için bir olay dinleyicisi (isteğe bağlı)
supabase.auth.onAuthStateChange((event, session) => {
  if (event === "TOKEN_REFRESHED") {
    console.log("Token yenilendi:", session?.access_token?.slice(0, 10) + "...");
  } else if (event === "SIGNED_IN") {
    console.log("Kullanıcı oturum açtı:", session?.user?.id);
  } else if (event === "SIGNED_OUT") {
    console.log("Kullanıcı oturumu kapattı.");
  }
});