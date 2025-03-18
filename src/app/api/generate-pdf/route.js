// app/api/generate-pdf/route.js
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Geçersiz oturum" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();
    const { unique_id, analysis_response } = body;

    if (!unique_id || !analysis_response) {
      return new Response(
        JSON.stringify({ error: "unique_id veya analysis_response eksik" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Font yollarını tanımla
    const fontDir = path.join(process.cwd(), "public/fonts");
    const regularFontPath = path.join(fontDir, "Roboto-Regular.ttf");
    const boldFontPath = path.join(fontDir, "Roboto-Bold.ttf");

    // Font dosyalarının varlığını kontrol et
    try {
      await fs.access(regularFontPath);
      await fs.access(boldFontPath);
    } catch {
      throw new Error("Roboto-Regular.ttf veya Roboto-Bold.ttf eksik. Lütfen public/fonts klasörüne ekleyin.");
    }

    // PDF oluştur
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Fontları embed et
    const regularFontBytes = await fs.readFile(regularFontPath);
    const boldFontBytes = await fs.readFile(boldFontPath);
    const robotoRegular = await pdfDoc.embedFont(regularFontBytes);
    const robotoBold = await pdfDoc.embedFont(boldFontBytes);

    let page = pdfDoc.addPage([595.28, 841.89]); // A4 boyutu (pt cinsinden)
    const { width, height } = page.getSize();
    let yPosition = height - 50;

    // Başlık: "Sorgera Beyanname AI Analiz Raporu"
    const title = "Sorgera Beyanname AI Analiz Raporu";
    const titleWidth = robotoBold.widthOfTextAtSize(title, 16);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: yPosition,
      size: 16,
      font: robotoBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= 30;

    // Analiz metnini satırlara böl ve hiyerarşik olarak işle
    const lines = analysis_response.split("\n");
    const maxWidth = 500;

    for (let line of lines) {
      line = line.trim();
      if (!line) {
        yPosition -= 10; // Boş satır için boşluk
        continue;
      }

      let font = robotoRegular;
      let size = 10;
      let indent = 0;

      if (line.startsWith("# ")) {
        font = robotoBold;
        size = 14;
        line = line.replace("# ", "");
        yPosition -= 10; // Başlık öncesi ekstra boşluk
      } else if (line.startsWith("## ")) {
        font = robotoBold;
        size = 12;
        line = line.replace("## ", "");
        indent = 20;
        yPosition -= 5;
      }

      // Satırlara böl
      const words = line.split(" ");
      let currentLine = "";
      const splitLines = [];

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const textWidth = font.widthOfTextAtSize(testLine, size);
        if (textWidth <= maxWidth) {
          currentLine = testLine;
        } else {
          splitLines.push(currentLine);
          currentLine = word;
        }
      }
      if (currentLine) splitLines.push(currentLine);

      // Satırları çiz
      for (const splitLine of splitLines) {
        if (yPosition < 70) {
          page = pdfDoc.addPage([595.28, 841.89]);
          yPosition = height - 50;
        }
        page.drawText(splitLine, {
          x: 50 + indent,
          y: yPosition,
          size: size,
          font: font,
          color: rgb(0, 0, 0),
        });
        yPosition -= size + 2;
      }
    }

    // Alt bilgi: "Developed by Can Matik"
    const footer = "Developed by Can Matik";
    const footerWidth = robotoRegular.widthOfTextAtSize(footer, 8);
    page.drawText(footer, {
      x: (width - footerWidth) / 2,
      y: 30,
      size: 8,
      font: robotoRegular,
      color: rgb(0.5, 0.5, 0.5),
    });

    // PDF’i tamamla
    const pdfBytes = await pdfDoc.save();

    // Supabase’e yükle
    const fileName = `${unique_id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("analysis-pdfs")
      .upload(fileName, pdfBytes, { contentType: "application/pdf", upsert: true });

    if (uploadError) {
      throw new Error(`PDF yükleme hatası: ${uploadError.message}`);
    }

    const { data: publicUrl } = supabase.storage.from("analysis-pdfs").getPublicUrl(fileName);

    // PDF URL’ini beyanname_analysis tablosuna güncelle
    const { error: updateError } = await supabase
      .from("beyanname_analysis")
      .update({ pdf_url: publicUrl.publicUrl })
      .eq("unique_id", unique_id);
    if (updateError) {
      console.error("PDF URL güncelleme hatası:", updateError);
    }

    return new Response(JSON.stringify({ success: true, pdfUrl: publicUrl.publicUrl }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("PDF oluşturma hatası:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Bilinmeyen bir hata oluştu" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}