import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(req) {
  try {
    // Kullanıcı doğrulama
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "User not authenticated" }, { status: 401 });

    // Body'den veriyi al
    const body = await req.json();
    const beyannameData = body?.data;
    if (!beyannameData || !beyannameData.length) {
      return NextResponse.json({ error: "No data provided" }, { status: 400 });
    }

    // analysis_queue tablosuna ekle
    const { data: inserted, error } = await supabase
      .from("analysis_queue")
      .insert({
        user_id: user.id,
        payload: beyannameData,
        status: "pending"
      })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ queue_id: inserted.id, status: "pending" });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
