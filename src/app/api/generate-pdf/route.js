import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
  // 1) Auth Kontrolü
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2) Supabase Client Oluştur
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // 3) Aktif kullanıcı kontrolü
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Geçersiz oturum" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // 4) Body parse
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

    // 5) Font dosyalarının yolu
    const fontDir = path.join(process.cwd(), "public", "fonts");
    const regularFontPath = path.join(fontDir, "Montserrat-Regular.ttf");
    const boldFontPath = path.join(fontDir, "Montserrat-Bold.ttf");
    const italicFontPath = path.join(fontDir, "Montserrat-Italic.ttf");
    const blackFontPath = path.join(fontDir, "Montserrat-Black.ttf");

    // 6) Fontların varlığını kontrol et
    try {
      await fs.access(regularFontPath);
      await fs.access(boldFontPath);
      await fs.access(italicFontPath);
      await fs.access(blackFontPath);
    } catch {
      throw new Error(
        "Montserrat fontları eksik (Regular, Bold, Italic, Black). Lütfen public/fonts klasörüne ekleyin."
      );
    }

    // 7) PDF oluşturma
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const regularFontBytes = await fs.readFile(regularFontPath);
    const boldFontBytes = await fs.readFile(boldFontPath);
    const italicFontBytes = await fs.readFile(italicFontPath);
    const blackFontBytes = await fs.readFile(blackFontPath);

    const montserratRegular = await pdfDoc.embedFont(regularFontBytes);
    const montserratBold = await pdfDoc.embedFont(boldFontBytes);
    const montserratItalic = await pdfDoc.embedFont(italicFontBytes);
    const montserratBlack = await pdfDoc.embedFont(blackFontBytes);

    // A4 sayfa
    let page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let yPosition = height - 50;
    const maxWidth = 500;

    // Başlık
    const title = "Sorgera Beyanname AI Analiz Raporu";
    const titleWidth = montserratBlack.widthOfTextAtSize(title, 16);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: yPosition,
      size: 16,
      font: montserratBlack,
      color: rgb(0.74, 0.18, 0.17), // #bd2f2c
    });
    yPosition -= 40;

    // Metin işleme
    const rawLines = analysis_response.split("\n");

    for (let rawLine of rawLines) {
      let line = rawLine.trim();
      if (!line) {
        yPosition -= 15;
        continue;
      }

      // Markdown karakterlerini temizle
      line = line
        .replace(/\*\*\*\*/g, "")
        .replace(/\*\*/g, "")
        .replace(/\*/g, "");
      if (/\|---/.test(line)) {
        continue; // tablo ayırıcı satırları atla
      }

      let font = montserratRegular;
      let size = 10;
      let indent = 0;

      if (line.startsWith("# ")) {
        font = montserratBlack;
        size = 14;
        line = line.replace("# ", "");
        yPosition -= 20;
      } else if (line.startsWith("## ")) {
        font = montserratBold;
        size = 12;
        line = line.replace("## ", "");
        indent = 10;
        yPosition -= 15;
      } else if (line.startsWith("### ")) {
        font = montserratBold;
        size = 11;
        line = line.replace("### ", "");
        indent = 20;
        yPosition -= 12;
      } else if (line.startsWith("- ")) {
        font = montserratRegular;
        line = `• ${line.replace("- ", "")}`;
        indent = 30;
      } else {
        font = montserratItalic; // normal text -> italic
      }

      // Metni satırlara böl
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

      // Yazdır
      for (const splitLine of splitLines) {
        if (yPosition < 50) {
          page = pdfDoc.addPage([595.28, 841.89]);
          yPosition = height - 50;
        }
        page.drawText(splitLine, {
          x: 50 + indent,
          y: yPosition,
          size,
          font,
          color: rgb(0, 0, 0),
        });
        yPosition -= size + 5;
      }
    }

    // 8) PDF'i byte array olarak kaydet
    const pdfBytes = await pdfDoc.save();

    // 8a) PDF'i Base64'e dönüştür
    const base64String = btoa(
      new Uint8Array(pdfBytes).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );

    // 9) Supabase Storage'a yükleme
    const fileName = `${unique_id}.pdf`;
    const { error: uploadError } = await supabase.storage
      .from("analysis-pdfs")
      .upload(fileName, pdfBytes, {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      console.error("PDF yükleme hatası:", uploadError);
      throw new Error(`PDF yükleme hatası: ${uploadError.message}`);
    }

    // 10) Public URL al
    const { data: publicUrl } = supabase.storage
      .from("analysis-pdfs")
      .getPublicUrl(fileName);

    // 11) Tablodaki satırı güncelle (pdf_url ve pdf_base64 alanları)
    const { error: updateError } = await supabase
      .from("beyanname_analysis")
      .update({
        pdf_url: publicUrl.publicUrl,
        pdf_base64: base64String, // <--- Base64 burada saklanıyor
      })
      .eq("unique_id", unique_id);

    if (updateError) {
      console.error("PDF URL güncelleme hatası:", updateError);
      throw new Error(`PDF URL güncelleme hatası: ${updateError.message}`);
    }

    // 12) İstek yanıtı: PDF URL + Base64
    return new Response(
      JSON.stringify({
        success: true,
        pdfUrl: publicUrl.publicUrl,
        pdfBase64: base64String,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("PDF oluşturma hatası:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Bilinmeyen bir hata oluştu",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
