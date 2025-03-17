import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req) {
  try {
    // Kullanıcı doğrulama
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: "User not authenticated" }, { status: 401 });

    // URL'den queue_id al
    const queueId = req.nextUrl.searchParams.get("queue_id");
    if (!queueId) return NextResponse.json({ error: "Missing queue_id" }, { status: 400 });

    // Tabloyu sorgula
    const { data, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("id", queueId)
      .eq("user_id", user.id)
      .single();

    if (error) throw new Error(error.message);
    if (!data) return NextResponse.json({ error: "Record not found" }, { status: 404 });

    return NextResponse.json({ queue: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
