import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    // 1) Token kontrolü
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim: Token eksik" }, { status: 401 });
    }
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Kullanıcı doğrulanamadı." }, { status: 401 });
    }

    // 2) Gövdeden veriyi al
    // Örneğin { data: beyannameData }
    const body = await req.json();
    const beyannameData = body?.data;

    if (!beyannameData || !beyannameData.length) {
      return NextResponse.json({ error: "Beyanname verisi boş." }, { status: 400 });
    }

    // 3) analysis_queue tablosuna ekle (status=pending)
    const { data: inserted, error: insertError } = await supabase
      .from("analysis_queue")
      .insert([
        {
          user_id: user.id,
          payload: beyannameData,
          status: "pending",
        },
      ])
      .select()
      .single();

    if (insertError) {
      throw new Error(insertError.message);
    }

    // 4) Kullanıcıya "kuyruğa alındı" cevabı
    return NextResponse.json({
      message: "Analiz kuyruğa alındı.",
      queue_id: inserted.id,
    });
  } catch (err) {
    console.error("Queue Analyze Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
