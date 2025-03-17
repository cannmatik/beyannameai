// app/api/list-queue/route.js
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req) {
  try {
    // 1) Token al
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2) Kullanıcı doğrula
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return NextResponse.json({ error: "User not authenticated" }, { status: 401 });
    }

    // 3) Tablodan user_id eşleşen kayıtlar
    const { data, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    // 4) JSON
    return NextResponse.json({ items: data });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
