export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req) {
  try {
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Kullanıcı bulunamadı" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    return NextResponse.json({ items: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
