// app/api/queue-analyze/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    // 1) Token kontrol
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Kullanıcı doğrulama
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    // 3) Body'den veriyi al
    const { data: payload } = await req.json(); 
    if (!payload || payload.length === 0) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    // 4) analysis_queue tablosuna (status=pending) ekle
    const { data: inserted, error: insertErr } = await supabase
      .from("analysis_queue")
      .insert({
        user_id: user.id,
        payload,
        status: "pending",
      })
      .select()
      .single();

    if (insertErr) {
      throw new Error(insertErr.message);
    }

    // 5) Yanıt
    return NextResponse.json({ queue_id: inserted.id, status: "pending" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
