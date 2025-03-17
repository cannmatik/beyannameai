import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req) {
  try {
    // 1) Token kontrolü
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim: Token eksik" }, { status: 401 });
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Kullanıcı doğrulanamadı." }, { status: 401 });
    }

    // 2) queue_id parametresini al
    // Next.js 13'te: req.nextUrl.searchParams.get("queue_id")
    const queueId = req.nextUrl.searchParams.get("queue_id");
    if (!queueId) {
      return NextResponse.json({ error: "queue_id parametresi eksik." }, { status: 400 });
    }

    // 3) Tabloyu sorgula
    const { data, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("id", queueId)
      .eq("user_id", user.id)
      .single();

    if (error) {
      throw new Error(error.message);
    }
    if (!data) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }

    // 4) Durumu döndür
    // Örn: { status, pdf_url, result, ... }
    return NextResponse.json({ queue: data });
  } catch (err) {
    console.error("Analysis Status Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
