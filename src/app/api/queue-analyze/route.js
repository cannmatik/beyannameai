import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req) {
  try {
    const { data } = await req.json();
    if (!data || !Array.isArray(data)) {
      return NextResponse.json({ error: "No data provided or invalid format" }, { status: 400 });
    }

    // Token'ı header'dan alıyoruz:
    const token = req.headers.get("authorization")?.split("Bearer ")[1];
    if (!token) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }
    
    // Token ile kullanıcıyı doğrulayalım:
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return NextResponse.json({ error: "Yetkisiz erişim" }, { status: 401 });
    }

    // Kuyruk öğelerine ekleme işlemleri
    const queueItems = data.map(item => ({
      ...item,
      analysis_uuid: uuidv4(),
      status: "pending",
    }));

    const { error } = await supabase
      .from("analysis_queue")
      .insert(queueItems);

    if (error) throw new Error(error.message);

    return NextResponse.json({ message: "Kuyruğa eklendi", items: queueItems }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
