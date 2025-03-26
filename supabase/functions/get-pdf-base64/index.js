import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = "https://tfdlwdylqficchvdqaqc.supabase.co";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  // CORS / OPTIONS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "OPTIONS, POST",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  // Sadece POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Yetki kontrolü
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${supabaseServiceRoleKey}`) {
    return new Response(
      JSON.stringify({ error: "Yetkisiz erişim", code: 401 }),
      {
        status: 401,
        headers: { "Access-Control-Allow-Origin": "*" },
      }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

  try {
    // Body: { "unique_id": "<UUID>" }
    const body = await req.json();
    const { unique_id } = body;

    if (!unique_id) {
      throw new Error("Eksik veri: unique_id boş.");
    }

    // beyanname_analysis tablosunda "id" kolonuna göre sorgu
    const { data, error } = await supabase
      .from("beyanname_analysis")
      .select("pdf_base64")
      .eq("id", unique_id) // <-- Artık "id" üzerinden
      .maybeSingle();      // 0 veya 1 kayıt dönecek

    if (error) {
      throw new Error(`Tablodan çekme hatası: ${error.message}`);
    }
    if (!data) {
      throw new Error("Kayıt bulunamadı.");
    }
    if (!data.pdf_base64) {
      throw new Error("pdf_base64 alanı boş.");
    }

    return new Response(
      JSON.stringify({
        success: true,
        pdf_base64: data.pdf_base64,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        }
      }
    );
  } catch (err) {
    console.error("Hata:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
