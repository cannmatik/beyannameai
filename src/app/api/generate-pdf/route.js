import { createClient } from "@supabase/supabase-js";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs/promises";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export async function POST(request) {
  // Authorization check
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Yetkisiz erişim" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Create Supabase client
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  // Verify active user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Geçersiz oturum" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Parse request body
    const body = await request.json();
    const { unique_id, analysis_response } = body;

    if (!unique_id || !analysis_response) {
      return new Response(
        JSON.stringify({ error: "unique_id veya analysis_response eksik" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Set up font paths
    const fontDir = path.join(process.cwd(), "public", "fonts");
    const regularFontPath = path.join(fontDir, "Montserrat-Regular.ttf");
    const boldFontPath = path.join(fontDir, "Montserrat-Bold.ttf");
    const italicFontPath = path.join(fontDir, "Montserrat-Italic.ttf");
    const blackFontPath = path.join(fontDir, "Montserrat-Black.ttf");

    // Verify font files exist
    await Promise.all([
      fs.access(regularFontPath),
      fs.access(boldFontPath),
      fs.access(italicFontPath),
      fs.access(blackFontPath)
    ]).catch(() => {
      throw new Error("Montserrat fontları eksik. public/fonts klasörünü kontrol edin.");
    });

    // Initialize PDF document
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    // Embed fonts
    const [regularFontBytes, boldFontBytes, italicFontBytes, blackFontBytes] = await Promise.all([
      fs.readFile(regularFontPath),
      fs.readFile(boldFontPath),
      fs.readFile(italicFontPath),
      fs.readFile(blackFontPath)
    ]);

    const montserratRegular = await pdfDoc.embedFont(regularFontBytes);
    const montserratBold = await pdfDoc.embedFont(boldFontBytes);
    const montserratItalic = await pdfDoc.embedFont(italicFontBytes);
    const montserratBlack = await pdfDoc.embedFont(blackFontBytes);

    // Set up page dimensions and tracking
    let page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    let yPosition = height - 50;
    const maxWidth = 500;
    let lastPage = page;
    let hasContent = false;

    // Process text content
    const rawLines = analysis_response.split("\n");

    for (let rawLine of rawLines) {
      let line = rawLine.trim();
      if (!line) {
        yPosition -= 15;
        continue;
      }

      // Clean markdown characters
      line = line.replace(/\*\*\*\*/g, "").replace(/\*\*/g, "").replace(/\*/g, "");
      if (/\|---/.test(line)) continue;

      let font = montserratRegular;
      let size = 10;
      let indent = 0;

      // Handle markdown headings
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
        font = montserratRegular;
        line = `• ${line.replace("- ", "")}`;
        indent = 30;
      } else {
        font = montserratItalic;
      }

      // Split text into lines
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

      // Draw text on page
      for (const splitLine of splitLines) {
        if (yPosition < 50) {
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
    }

    // Add footer to last page
    if (hasContent) {
      const footerText = "Developed by Can Matik";
      const footerFontSize = 8;
      const footerWidth = montserratRegular.widthOfTextAtSize(footerText, footerFontSize);
      lastPage.drawText(footerText, {
        x: (width - footerWidth) / 2,
        y: 30,
        size: footerFontSize,
        font: montserratRegular,
        color: rgb(0.5, 0.5, 0.5),
      });
    }

    // Save PDF and convert to Base64
    const pdfBytes = await pdfDoc.save();
    const base64String = btoa(
      new Uint8Array(pdfBytes).reduce(
        (data, byte) => data + String.fromCharCode(byte),
        ""
      )
    );

    // Upload to Supabase Storage
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

    // Get public URL
    const { data: publicUrl } = supabase.storage
      .from("analysis-pdfs")
      .getPublicUrl(fileName);

    // Update database record
    const { error: updateError } = await supabase
      .from("beyanname_analysis")
      .update({
        pdf_url: publicUrl.publicUrl,
        pdf_base64: base64String,
      })
      .eq("unique_id", unique_id);

    if (updateError) {
      throw new Error(`PDF URL güncelleme hatası: ${updateError.message}`);
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        pdfUrl: publicUrl.publicUrl,
        pdfBase64: base64String,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("PDF oluşturma hatası:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Bilinmeyen bir hata oluştu",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}