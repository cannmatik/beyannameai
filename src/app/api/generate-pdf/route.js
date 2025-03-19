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

    // Örnek font yolları (public/fonts/ klasöründe Roboto-Regular ve Roboto-Bold olduğunu varsayıyoruz)
    const fontDir = path.join(process.cwd(), "public", "fonts");
    const regularFontPath = path.join(fontDir, "Roboto-Regular.ttf");
    const boldFontPath = path.join(fontDir, "Roboto-Bold.ttf");

    // Fontların varlığını kontrol edelim
    try {
      await fs.access(regularFontPath);
      await fs.access(boldFontPath);
    } catch {
      throw new Error(
        "Roboto-Regular.ttf veya Roboto-Bold.ttf eksik. Lütfen public/fonts klasörüne ekleyin."
      );
    }

    // Yeni PDF dokümanı
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const regularFontBytes = await fs.readFile(regularFontPath);
    const boldFontBytes = await fs.readFile(boldFontPath);
    const robotoRegular = await pdfDoc.embedFont(regularFontBytes);
    const robotoBold = await pdfDoc.embedFont(boldFontBytes);

    let page = pdfDoc.addPage([595.28, 841.89]); // A4 boyutu
    const { width, height } = page.getSize();
    let yPosition = height - 50;
    const maxWidth = 500;

    // Başlık
    const title = "Sorgera Beyanname AI Analiz Raporu";
    const titleWidth = robotoBold.widthOfTextAtSize(title, 16);
    page.drawText(title, {
      x: (width - titleWidth) / 2,
      y: yPosition,
      size: 16,
      font: robotoBold,
      color: rgb(0, 0, 0),
    });
    yPosition -= 40;

    // Gövde içeriği (analysis_response)
    // Fazladan markdown temizliği ve tablo ayırıcı satırları atlamak
    const rawLines = analysis_response.split("\n");

    for (let rawLine of rawLines) {
      let line = rawLine.trim();
      if (!line) {
        // Boş satırsa biraz boşluk bırak
        yPosition -= 15;
        continue;
      }
      // Bazı gereksiz karakterleri temizle
      // 4 yıldız (****) ve 2 yıldız (**) gibi
      line = line
        .replace(/\*\*\*\*/g, "") // 4 yıldız
        .replace(/\*\*/g, "") // 2 yıldız
        .replace(/\*/g, "");  // tek yıldız
      // Table separator satırlarını atlayalım (örneğin "|---|", "|----|", vb.)
      if (/\|---/.test(line)) {
        continue; // Bu satırı hiç yazdırma
      }

      // Basit markdown başlıklarına göre tip belirleme
      let font = robotoRegular;
      let size = 10;
      let indent = 0;

      if (line.startsWith("# ")) {
        font = robotoBold;
        size = 14;
        line = line.replace("# ", "");
        yPosition -= 20;
      } else if (line.startsWith("## ")) {
        font = robotoBold;
        size = 12;
        line = line.replace("## ", "");
        indent = 10;
        yPosition -= 15;
      } else if (line.startsWith("- ")) {
        line = `• ${line.replace("- ", "")}`;
        indent = 20;
      }

      // Metni satırlara bölme
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

    // NOT: Footer'da tekrar "Developed by Can Matik" eklenmemesi için kaldırdık.

    // PDF'i byte array olarak oluştur
    const pdfBytes = await pdfDoc.save();

    // Storage'a yükle
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

    // Public URL al
    const { data: publicUrl } = supabase.storage
      .from("analysis-pdfs")
      .getPublicUrl(fileName);

    // PDF URL'sini beyanname_analysis tablosuna kaydet
    const { data, error: updateError } = await supabase
      .from("beyanname_analysis")
      .update({ pdf_url: publicUrl.publicUrl })
      .eq("unique_id", unique_id);

    if (updateError) {
      console.error("PDF URL güncelleme hatası:", updateError);
      throw new Error(`PDF URL güncelleme hatası: ${updateError.message}`);
    }

    // Dönen data boş olabilir, problem değil
    return new Response(
      JSON.stringify({ success: true, pdfUrl: publicUrl.publicUrl }),
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
