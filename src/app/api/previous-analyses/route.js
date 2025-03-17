import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req) {
  try {
    // 1) Token kontrolü
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim: Token eksik" }, { status: 401 });
    }

    // 2) Kullanıcı doğrulama
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "Kullanıcı doğrulanamadı." }, { status: 401 });
    }

    // 3) Veritabanından analizi çek
    const { data, error } = await supabase
      .from("beyanname_analysis")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    // 4) Sonuç dön
    return NextResponse.json({ analyses: data });
  } catch (err) {
    console.error("Önceki analizler hatası:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
