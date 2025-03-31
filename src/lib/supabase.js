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
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});

// İstemci oluşturulduğunu logla (opsiyonel, geliştirme için faydalı)
if (process.env.NODE_ENV === "development") {
  console.log("Supabase istemcisi başarıyla oluşturuldu:", supabaseUrl);
}

// Oturum durumunu izlemek için bir yardımcı fonksiyon
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

// Kullanıcının admin olup olmadığını kontrol eden fonksiyon
export const checkAdmin = async () => {
  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Kullanıcı alınamadı:", userError?.message);
      return false;
    }

    const { data, error } = await supabase
      .from("admin")
      .select("id")
      .eq("id", user.id);

    if (error) {
      console.error("Admin kontrol hatası:", error.message);
      return false;
    }

    return data.length > 0; // Kullanıcı admin tablosundaysa true döner
  } catch (err) {
    console.error("checkAdmin hatası:", err);
    return false;
  }
};