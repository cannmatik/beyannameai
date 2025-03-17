import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Bu endpoint, queue_id parametresiyle tabloyu sorgular
 * ve job'un son durumunu (pending, done, error) gösterir.
 */
export async function GET(req) {
  try {
    // 1) Kullanıcı doğrulama
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Doğrulanamadı" }, { status: 401 });
    }

    // 2) URL'den queue_id al
    const queueId = req.nextUrl.searchParams.get("queue_id");
    if (!queueId) {
      return NextResponse.json({ error: "queue_id parametresi eksik" }, { status: 400 });
    }

    // 3) Tabloyu sorgula
    const { data, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("id", queueId)
      .eq("user_id", user.id)
      .single();

    if (error) throw new Error(error.message);
    if (!data) {
      return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    }

    // 4) Durumu dön
    return NextResponse.json({ queue: data });
  } catch (err) {
    console.error("Analysis Status Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
