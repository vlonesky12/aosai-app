// docsqa/extractor.js

// Use pdfjs-dist for reliable PDF text extraction
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
// OCR for images
import { createWorker } from 'tesseract.js';
// DOCX extractor
import mammoth from 'mammoth';

/** PDF → text (searchable PDFs only) */
async function extractPdfText(buffer) {
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const parts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const strings = content.items.map(it => (typeof it.str === 'string' ? it.str : ''));
    parts.push(strings.join(' ').trim());
  }
  try { await pdf.destroy(); } catch {}
  return parts.join('\n\n');
}

/** Image buffer → OCR text (eng) */
async function ocrImage(buffer) {
  const worker = await createWorker('eng');   // downloads the eng traineddata on first run
  try {
    const { data: { text } } = await worker.recognize(buffer);
    return (text || '').trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * Extract plain text from supported document types.
 * - PDF (searchable text pulled with pdfjs)
 * - DOCX (mammoth)
 * - TXT (raw)
 * - PNG/JPG/JPEG/WEBP (OCR via tesseract)
 */
export async function extractTextFromFile(buffer, originalName) {
  const lower = (originalName || '').toLowerCase();

  try {
    if (lower.endsWith('.pdf')) {
      const text = await extractPdfText(buffer);
      return text || '';
    }

    if (lower.endsWith('.docx')) {
      const r = await mammoth.extractRawText({ buffer });
      return r?.value || '';
    }

    if (lower.endsWith('.txt')) {
      return buffer.toString('utf8');
    }

    // ✅ NEW: image OCR path
    if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp')) {
      const text = await ocrImage(buffer);
      return text || '';
    }

    return '';
  } catch (err) {
    console.error('extractTextFromFile error:', err);
    return '';
  }
}

/** Split long text into chunks for embedding / Q&A */
export function chunkText(text, maxLen = 1200) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
}
