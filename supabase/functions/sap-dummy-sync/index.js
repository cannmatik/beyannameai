import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

// Environment variable'lardan alıyoruz
const supabaseUrl = "https://tfdlwdylqficchvdqaqc.supabase.co";
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

serve(async (req) => {
  // CORS için OPTIONS kontrolü
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

  // Sadece POST metoduna izin ver
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Authorization kontrolü
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || authHeader !== `Bearer ${supabaseServiceRoleKey}`) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  // Supabase istemcisi
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    // Gelen request body
    const body = await req.json();
    const { user_id, data } = body;

    if (!user_id || !data) {
      throw new Error("Eksik veri: user_id veya data boş.");
    }

    // Gelen data bir dizi olmalı
    const dataArray = Array.isArray(data) ? data : [data];

    // Veriyi tabloya ekle, alanları ayrıştır
    const { error } = await supabase.from("sap_dummy").insert(
      dataArray.map((item) => ({
        user_id: user_id,
        sap_input: item, // Orijinal JSON
        firma_adi: item.FIRMA_ADI || item.firma_adi || "Bilinmiyor", // Büyük/küçük harf duyarlılığı için
        vergi_no: item.VERGI_NO || item.vergi_no || "Bilinmiyor",
        test_field: item.TEST_FIELD || item.test_field || "Bilinmiyor",
        created_at: new Date().toISOString(),
      }))
    );

    if (error) {
      throw new Error(`Veritabanına ekleme hatası: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "SAP dummy verileri kaydedildi" }),
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Content-Type": "application/json",
        },
      }
    );
  }
});