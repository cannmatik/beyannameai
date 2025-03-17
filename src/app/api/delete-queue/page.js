// /src/app/api/delete-queue/route.js
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function DELETE(req) {
  try {
    // URL'den queue_id alınır
    const { queue_id } = Object.fromEntries(new URL(req.url).searchParams);
    if (!queue_id) {
      return NextResponse.json({ error: "queue_id eksik" }, { status: 400 });
    }

    // Authorization header'ından token alınır
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    // Token üzerinden kullanıcı doğrulaması yapılır
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });
    }

    // analysis_queue tablosunda ilgili kaydı sil
    const { error } = await supabase
      .from("analysis_queue")
      .delete()
      .eq("id", queue_id)
      .eq("user_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Kayıt silindi" }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
