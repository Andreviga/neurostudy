import pdfParse from 'pdf-parse';
import fs from 'fs';

export interface PDFResult {
  text: string;
  pages: number;
}

export async function extractTextFromPDF(filePath: string): Promise<PDFResult> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return {
    text: data.text.trim(),
    pages: data.numpages,
  };
}
