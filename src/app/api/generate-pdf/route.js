import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
  // TransformStream ile satır satır çıktı vereceğiz
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  // Yardımcı fonksiyon
  const writeLine = (text) => {
    writer.write(encoder.encode(text + "\n"));
  };

  // Authorization kontrolü
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    writeLine(`error: Yetkisiz erişim`);
    writer.close();
    return new Response(readable, {
      status: 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  // Supabase client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // İstek gövdesini JSON olarak okuyalım
  let body = {};
  try {
    body = await request.json();
  } catch (err) {
    writeLine(`error: Geçersiz JSON gövdesi`);
    writer.close();
    return new Response(readable, {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  const { unique_id, analysis_response } = body;

  // Kullanıcı doğrulama
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    writeLine(`error: Geçersiz oturum`);
    writer.close();
    return new Response(readable, {
      status: 401,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  // Parametre kontrolü
  if (!unique_id || !analysis_response) {
    writeLine(`error: unique_id veya analysis_response eksik`);
    writer.close();
    return new Response(readable, {
      status: 400,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  // PDF oluşturma
  const processPdf = async () => {
    try {
      // %0 -> Başlangıç
      writeLine(`progress: 0 message: PDF oluşturma başlatılıyor...`);

      // Font dosyalarının konumu
      const fontDir = path.join(process.cwd(), "public", "fonts");
      const regularFontPath = path.join(fontDir, "Montserrat-Regular.ttf");
      const boldFontPath = path.join(fontDir, "Montserrat-Bold.ttf");
      const italicFontPath = path.join(fontDir, "Montserrat-Italic.ttf");
      const blackFontPath = path.join(fontDir, "Montserrat-Black.ttf");

      // Fontların varlığı
      await Promise.all([
        fs.access(regularFontPath),
        fs.access(boldFontPath),
        fs.access(italicFontPath),
        fs.access(blackFontPath),
      ]);

      // %15
      writeLine(`progress: 15 message: Fontlar yüklendi`);

      // Yeni PDF dokümanı
      const pdfDoc = await PDFDocument.create();
      pdfDoc.registerFontkit(fontkit);

      // Font verilerini oku
      const [
        regularFontBytes,
        boldFontBytes,
        italicFontBytes,
        blackFontBytes,
      ] = await Promise.all([
        fs.readFile(regularFontPath),
        fs.readFile(boldFontPath),
        fs.readFile(italicFontPath),
        fs.readFile(blackFontPath),
      ]);

      // Fontları PDF'e embed et
      const montserratRegular = await pdfDoc.embedFont(regularFontBytes);
      const montserratBold = await pdfDoc.embedFont(boldFontBytes);
      const montserratItalic = await pdfDoc.embedFont(italicFontBytes);
      const montserratBlack = await pdfDoc.embedFont(blackFontBytes);

      // PDF sayfası
      let page = pdfDoc.addPage([595.28, 841.89]);
      const { width, height } = page.getSize();
      let yPosition = height - 50;
      const maxWidth = 500;
      let lastPage = page;
      let hasContent = false;

      // Metin satırları
      const rawLines = analysis_response.split("\n");
      const totalLines = rawLines.length;

      // %20 -> metin işleme başlıyor
      writeLine(`progress: 20 message: Metin işleniyor...`);

      // Her satırda ilerleme: 20'den 60'a kadar
      // (yani 40 puanlık bir aralık)
      const processRangeStart = 20;
      const processRangeEnd = 60;
      const processRange = processRangeEnd - processRangeStart;

      for (let i = 0; i < rawLines.length; i++) {
        let rawLine = rawLines[i].trim();
        if (!rawLine) {
          yPosition -= 15;
          continue;
        }

        // Markdown temizliği
        let line = rawLine
          .replace(/\*\*\*\*/g, "")
          .replace(/\*\*/g, "")
          .replace(/\*/g, "");
        if (/\|---/.test(line)) continue;

        let font = montserratRegular;
        let size = 10;
        let indent = 0;

        // Heading düzeyi
        if (/^#{1,4}\s/.test(line)) {
          const headingLevel = line.match(/^#+/)[0].length;
          line = line.replace(/^#+\s/, "");
          switch (headingLevel) {
            case 1:
              font = montserratBlack;
              size = 14;
              yPosition -= 20;
              break;
            case 2:
              font = montserratBold;
              size = 12;
              indent = 10;
              yPosition -= 15;
              break;
            case 3:
              font = montserratBold;
              size = 11;
              indent = 20;
              yPosition -= 12;
              break;
            case 4:
              font = montserratBold;
              size = 10;
              indent = 30;
              yPosition -= 10;
              break;
          }
        } else if (line.startsWith("- ")) {
          // Liste maddesi
          font = montserratRegular;
          line = `• ${line.replace("- ", "")}`;
          indent = 30;
        } else {
          // Normal paragraf -> italic (isterseniz regular bırakabilirsiniz)
          font = montserratItalic;
        }

        // Metni belirli genişliğe göre parçala
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

        // PDF'e yaz
        for (const splitLine of splitLines) {
          if (yPosition < 50) {
            // Yeni sayfa
            page = pdfDoc.addPage([595.28, 841.89]);
            yPosition = height - 50;
            lastPage = page;
          }
          page.drawText(splitLine, {
            x: 50 + indent,
            y: yPosition,
            size,
            font,
            color: rgb(0, 0, 0),
          });
          yPosition -= size + 5;
          hasContent = true;
        }

        // Satır işlendikçe progress hesaplayalım
        const currentProgress =
          processRangeStart +
          Math.floor(((i + 1) / totalLines) * processRange);
        writeLine(`progress: ${currentProgress} message: Metin işleniyor...`);
      }

      // %60 -> PDF son hali kaydediliyor
      writeLine(`progress: 60 message: PDF kaydediliyor...`);

      // PDF byte array
      const pdfBytes = await pdfDoc.save();

      // %70 -> Yükleme
      writeLine(`progress: 70 message: PDF yükleniyor...`);

      // Base64
      const base64String = btoa(
        new Uint8Array(pdfBytes).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      // Supabase Storage'a yükleme
      const fileName = `${unique_id}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("analysis-pdfs")
        .upload(fileName, pdfBytes, {
          contentType: "application/pdf",
          upsert: true,
        });

      if (uploadError) {
        throw new Error(`PDF yükleme hatası: ${uploadError.message}`);
      }

      // %85 -> Veritabanı güncellemesi
      writeLine(`progress: 85 message: Veritabanı güncelleniyor...`);

      // Public URL
      const { data: publicUrl } = supabase.storage
        .from("analysis-pdfs")
        .getPublicUrl(fileName);

      // DB update
      const { error: updateError } = await supabase
        .from("beyanname_analysis")
        .update({
          pdf_url: publicUrl.publicUrl,
          pdf_base64: base64String, // Bu alan tablo şemanızda olmalı
        })
        .eq("unique_id", unique_id);

      if (updateError) {
        throw new Error(`PDF URL güncelleme hatası: ${updateError.message}`);
      }

      // %95 -> Tamamlanmak üzere
      writeLine(`progress: 95 message: Son düzenlemeler yapılıyor...`);

      // %100 -> Bitti
      writeLine(`progress: 100 message: PDF oluşturma tamamlandı`);
      writeLine(
        `data: ${JSON.stringify({
          success: true,
          pdfUrl: publicUrl.publicUrl,
          pdfBase64: base64String,
        })}`
      );
    } catch (error) {
      // Hata varsa
      writeLine(`error: ${error.message}`);
    } finally {
      writer.close();
    }
  };

  // İşlemi başlat
  processPdf();

  // Streaming Response
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
