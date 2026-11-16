import * as cheerio from 'cheerio';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { extractTextWithVisionOcr, hasGeminiKey } from '../services/gemini.js';

export interface ExtractedContent {
  text: string;
  pageCount: number;
  ocrUsed: boolean;
  detectedTitle?: string;
}

export interface DocumentChunkInput {
  chunkIndex: number;
  pageNumber: number;
  sectionTitle: string;
  chunkText: string;
}

export async function extractDocumentContent(
  buffer: Buffer,
  filename: string,
  mimeType = ''
): Promise<ExtractedContent> {
  const lower = filename.toLowerCase();
  const mime = mimeType.toLowerCase();

  if (lower.endsWith('.pdf') || mime.includes('pdf')) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      const pageCount = Math.max(result.total || result.pages?.length || 1, 1);
      const pagedText = (result.pages || [])
        .map((p) => `\n[[PAGE_${p.num}]]\n${(p.text || '').trim()}\n`)
        .join('\n')
        .trim();

      const cleaned = pagedText || (result.text || '').trim();
      const meaningfulChars = cleaned.replace(/\[\[PAGE_\d+\]\]/g, '').replace(/\s+/g, '').length;

      if (meaningfulChars < 80) {
        if (hasGeminiKey()) {
          const ocrText = await extractTextWithVisionOcr(buffer, 'application/pdf');
          return {
            text: ocrText,
            pageCount,
            ocrUsed: true,
          };
        }
        throw new Error(
          'Scanned PDF detected (no embedded text layer) and GEMINI_API_KEY is unavailable for Vision OCR fallback.'
        );
      }

      return {
        text: cleaned,
        pageCount,
        ocrUsed: false,
      };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (lower.endsWith('.docx') || mime.includes('wordprocessingml')) {
    const res = await mammoth.extractRawText({ buffer });
    const text = (res.value || '').trim();
    if (!text) throw new Error('DOCX file contained no extractable text.');
    return {
      text,
      pageCount: Math.max(1, Math.ceil(text.length / 2600)),
      ocrUsed: false,
    };
  }

  if (lower.endsWith('.html') || lower.endsWith('.htm') || mime.includes('html')) {
    const html = buffer.toString('utf8');
    const $ = cheerio.load(html);
    const detectedTitle = $('title').first().text().trim() || $('h1').first().text().trim();
    $('script, style, noscript, iframe, svg, nav, footer').remove();

    const blocks: string[] = [];
    $('h1, h2, h3, h4, p, li, tr').each((_idx, el) => {
      const tag = (el as any).tagName?.toLowerCase();
      const txt = $(el).text().replace(/\s+/g, ' ').trim();
      if (!txt || txt.length < 3) return;
      if (tag === 'h1' || tag === 'h2') {
        blocks.push(`\n## ${txt}`);
      } else if (tag === 'h3' || tag === 'h4') {
        blocks.push(`\n### ${txt}`);
      } else {
        blocks.push(txt);
      }
    });

    const text = blocks.join('\n').trim() || $('body').text().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 40) {
      throw new Error('HTML page yielded insufficient readable regulatory text (page may require JavaScript rendering or block automated retrieval).');
    }

    return {
      text,
      pageCount: Math.max(1, Math.ceil(text.length / 2800)),
      ocrUsed: false,
      detectedTitle: detectedTitle || undefined,
    };
  }

  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || mime.startsWith('image/')) {
    if (!hasGeminiKey()) {
      throw new Error('Image OCR requires GEMINI_API_KEY to be configured on the server.');
    }
    const imgMime = mime.startsWith('image/') ? mime : lower.endsWith('.png') ? 'image/png' : 'image/jpeg';
    const ocrText = await extractTextWithVisionOcr(buffer, imgMime);
    if (!ocrText) throw new Error('OCR extracted empty text from image.');
    return {
      text: ocrText,
      pageCount: 1,
      ocrUsed: true,
    };
  }

  if (lower.endsWith('.csv') || mime.includes('csv')) {
    const raw = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
    if (!raw) throw new Error('CSV file is empty.');
    return {
      text: raw,
      pageCount: Math.max(1, Math.ceil(raw.length / 2800)),
      ocrUsed: false,
    };
  }

  // Plain text / Markdown
  const text = buffer.toString('utf8').replace(/\r\n/g, '\n').trim();
  if (!text) throw new Error('Text document is empty.');
  return {
    text,
    pageCount: Math.max(1, Math.ceil(text.length / 2800)),
    ocrUsed: false,
  };
}

export function chunkDocumentText(rawText: string, maxChunkSize = 950, overlap = 140): DocumentChunkInput[] {
  const lines = rawText.split('\n');
  const chunks: DocumentChunkInput[] = [];

  let currentPage = 1;
  let currentSection = 'Overview';
  let buffer = '';
  let chunkIndex = 0;

  const flushBuffer = () => {
    const trimmed = buffer.trim();
    if (trimmed.length < 25) {
      buffer = '';
      return;
    }
    chunks.push({
      chunkIndex,
      pageNumber: currentPage,
      sectionTitle: currentSection,
      chunkText: trimmed,
    });
    chunkIndex += 1;
    // Keep trailing overlap for semantic continuity
    if (trimmed.length > overlap) {
      const tail = trimmed.slice(-overlap);
      const firstSpace = tail.indexOf(' ');
      buffer = firstSpace > 0 ? tail.slice(firstSpace + 1) + '\n' : '';
    } else {
      buffer = '';
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const pageMatch = line.match(/^\[\[PAGE_(\d+)\]\]$/);
    if (pageMatch) {
      if (buffer.trim().length >= 25) {
        flushBuffer();
        buffer = '';
      }
      currentPage = parseInt(pageMatch[1], 10) || currentPage;
      continue;
    }

    const headingMatch =
      line.match(/^#{1,4}\s+(.+)$/) ||
      line.match(/^(Section\s+\d+[A-Za-z0-9.\-]*\s*[:\-–]?\s*.*)$/i) ||
      line.match(/^(\d+\.\s+[A-Z][A-Za-z0-9\s,\-\/()]{4,80})$/);

    if (headingMatch) {
      if (buffer.trim().length > 180) {
        flushBuffer();
      }
      currentSection = (headingMatch[1] || line).replace(/^#+\s*/, '').slice(0, 110).trim();
    }

    if (!line) {
      if (buffer.length > maxChunkSize * 0.75) {
        flushBuffer();
      }
      continue;
    }

    if (buffer.length + line.length + 1 > maxChunkSize && buffer.trim().length > 120) {
      flushBuffer();
    }

    buffer += (buffer ? '\n' : '') + line;
  }

  if (buffer.trim().length >= 25) {
    chunks.push({
      chunkIndex,
      pageNumber: currentPage,
      sectionTitle: currentSection,
      chunkText: buffer.trim(),
    });
  }

  // Fallback if text had no line breaks
  if (chunks.length === 0 && rawText.trim().length > 0) {
    const clean = rawText.replace(/\[\[PAGE_\d+\]\]/g, '').trim();
    for (let i = 0; i < clean.length; i += maxChunkSize - overlap) {
      const slice = clean.slice(i, i + maxChunkSize).trim();
      if (slice.length >= 20) {
        chunks.push({
          chunkIndex: chunks.length,
          pageNumber: 1,
          sectionTitle: 'General',
          chunkText: slice,
        });
      }
    }
  }

  return chunks;
}
