import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    // Pending kayıtları al
    const { data: jobs, error } = await supabase
      .from("analysis_queue")
      .select("*")
      .eq("status", "pending");

    if (error) throw new Error(error.message);
    if (!jobs || jobs.length === 0) {
      return NextResponse.json({ message: "No pending jobs." });
    }

    for (const job of jobs) {
      // GPT isteği
      const prompt = `Beyanname Analizi\n${JSON.stringify(job.payload)}`;
      const openAiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-3.5-turbo", // GPT-4 erişimin varsa "gpt-4" olarak değiştirin
          messages: [
            { role: "system", content: "You are a financial expert." },
            { role: "user", content: prompt },
          ],
          max_tokens: 1000,
        }),
      });
      const openAiData = await openAiRes.json();
      if (!openAiRes.ok) {
        await supabase
          .from("analysis_queue")
          .update({
            status: "error",
            result: openAiData.error?.message || "OpenAI error"
          })
          .eq("id", job.id);
        continue;
      }
      const analysisText = openAiData.choices[0].message.content.trim();

      // PDF oluşturma (basit örnek: metni PDF'e çeviriyoruz)
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);
      const regularPath = path.join(process.cwd(), "src", "fonts", "Montserrat-Regular.ttf");
      const regularBytes = fs.readFileSync(regularPath);
      const regularFont = await pdfDoc.embedFont(regularBytes);
      const page = pdfDoc.addPage();
      page.setFont(regularFont);
      page.setFontSize(12);
      page.drawText(analysisText, { x: 50, y: page.getSize().height - 50 });
      const pdfBytes = await pdfDoc.save();
      const pdfBuffer = Buffer.from(pdfBytes);

      // PDF'i Supabase Storage'a yükle
      const fileName = `analysis_${job.id}_${Date.now()}.pdf`;
      const { error: uploadErr } = await supabase.storage
        .from("analyses")
        .upload(fileName, pdfBuffer, { contentType: "application/pdf" });
      if (uploadErr) {
        await supabase
          .from("analysis_queue")
          .update({
            status: "error",
            result: `PDF upload error: ${uploadErr.message}`
          })
          .eq("id", job.id);
        continue;
      }
      const { data: publicData } = supabase.storage.from("analyses").getPublicUrl(fileName);
      const pdfUrl = publicData.publicUrl;

      // İş kaydını güncelle: done, result ve pdf_url
      await supabase
        .from("analysis_queue")
        .update({
          status: "done",
          result: analysisText,
          pdf_url: pdfUrl
        })
        .eq("id", job.id);
    }

    return NextResponse.json({ message: "Pending jobs processed." });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
