import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractTextFromFile(
  buffer: Buffer,
  fileType: string
): Promise<string> {
  const type = fileType.toLowerCase();

  if (type.includes("pdf")) {
    return extractFromPDF(buffer);
  } else if (
    type.includes("docx") ||
    type.includes("word") ||
    type.includes("openxmlformats")
  ) {
    return extractFromDOCX(buffer);
  }

  throw new Error(`Unsupported file type: ${fileType}`);
}

async function extractFromPDF(buffer: Buffer): Promise<string> {
  try {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text?.trim() ?? "";
    await parser.destroy();
    if (!text) throw new Error("No text could be extracted from this PDF");
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse PDF: ${msg}`);
  }
}

async function extractFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim() ?? "";
    if (!text) throw new Error("No text could be extracted from this DOCX");
    return text;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse DOCX: ${msg}`);
  }
}
