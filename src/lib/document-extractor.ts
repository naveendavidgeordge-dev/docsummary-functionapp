export interface ExtractedMetadata {
  fileType: string;
  fileSizeKb: number;
  pageCount: number | null;
  mimeType: string;
  processedAt: string;
  processingDurationMs: number;
  summary: string;
  keywords: string[];
  confidence: number;
  extractedBy: string;
}

export async function extractDocumentMetadata(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<ExtractedMetadata> {
  // Simulate processing delay (1.5 - 4 seconds)
  const delay = Math.floor(Math.random() * (4000 - 1500 + 1)) + 1500;
  await new Promise((resolve) => setTimeout(resolve, delay));

  const fileSizeKb = Math.round(buffer.length / 1024);
  const fileExtension = fileName.split('.').pop()?.toUpperCase() || 'UNKNOWN';

  // Basic keyword generation based on filename
  const baseKeywords = ['document', 'processed', 'cloud-native'];
  const filenameKeywords = fileName
    .split('-')
    .slice(1)
    .join(' ')
    .split('.')
    .shift()
    ?.split(' ') || [];
  const keywords = Array.from(new Set([...baseKeywords, ...filenameKeywords])).filter((k) => k.length > 2);

  return {
    fileType: `${fileExtension} Document`,
    fileSizeKb,
    pageCount: fileExtension === 'PDF' ? Math.floor(Math.random() * 5) + 1 : null,
    mimeType,
    processedAt: new Date().toISOString(),
    processingDurationMs: delay,
    summary: `Automatically processed ${fileExtension} document with ${fileSizeKb}KB size.`,
    keywords,
    confidence: Number((Math.random() * (0.99 - 0.85) + 0.85).toFixed(2)),
    extractedBy: 'DocProcess Azure Function v1.0',
  };
}
