import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

/**
 * Bu endpoint, gelen veriyi analysis_queue tablosuna ekler (pending).
 * Uzun GPT işlemi YAPMAZ. Sadece 1-2 saniyede cevap döner.
 */
export async function POST(req) {
  try {
    // 1) Kullanıcı doğrulama
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
    }

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Doğrulanamadı." }, { status: 401 });
    }

    // 2) Body'den veri al
    const body = await req.json();
    const beyannameData = body?.data;
    if (!beyannameData || !beyannameData.length) {
      return NextResponse.json({ error: "Beyanname verisi eksik." }, { status: 400 });
    }

    // 3) Tabloya ekle => pending
    const { data: inserted, error } = await supabase
      .from("analysis_queue")
      .insert({
        user_id: user.id,
        payload: beyannameData,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    // 4) Hızlı cevap döndür
    return NextResponse.json({ queue_id: inserted.id, status: "pending" });
  } catch (err) {
    console.error("Queue Analyze Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
