import { serve } from "https://deno.land/std@0.223.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js";

const supabaseUrl = "https://tfdlwdylqficchvdqaqc.supabase.co";
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";

serve(async (req) => {
  try {
    // CORS
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "OPTIONS, GET",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!supabaseAnonKey) {
      throw new Error("SUPABASE_ANON_KEY tanımlı değil");
    }

    const url = new URL(req.url);
    const unique_id = url.searchParams.get("unique_id");
    if (!unique_id) {
      return new Response(JSON.stringify({ error: "unique_id eksik" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Supabase client
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // DB'den sorgula
    const { data: queueData, error: queueError } = await supabase
      .from("analysis_queue")
      .select("status, created_at, updated_at")
      .eq("unique_id", unique_id)
      .single();

    if (queueError || !queueData) {
      return new Response(
        JSON.stringify({ error: queueError?.message || "Kayıt bulunamadı" }),
        {
          status: 404,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Hata logları
    let logs = null;
    if (queueData.status === "failed") {
      const { data: logData } = await supabase
        .from("analysis_logs")
        .select("*")
        .eq("unique_id", unique_id)
        .maybeSingle();
      logs = logData || null;
    }

    // Bekleyen işleme geçen süre (örn. processing'te ise)
    const processingTime =
      queueData.status === "processing"
        ? new Date().getTime() - new Date(queueData.updated_at).getTime()
        : 0;

    return new Response(
      JSON.stringify({
        status: queueData.status,
        completed: queueData.status === "completed",
        processingTime: processingTime > 0 ? Math.floor(processingTime / 1000) : 0,
        logs,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("check-status error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
