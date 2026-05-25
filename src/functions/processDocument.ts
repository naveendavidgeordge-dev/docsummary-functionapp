import { app, InvocationContext } from '@azure/functions';
import { extractDocumentMetadata } from '../lib/document-extractor';

console.log('processDocument loaded');

export async function processDocument(blob: Buffer, context: InvocationContext): Promise<void> {
  const containerName = 'documents';
  const triggerName = context.triggerMetadata?.name as string | undefined;
  const triggerPath = context.triggerMetadata?.blobTrigger as string | undefined;
  const blobPath = triggerPath?.startsWith(`${containerName}/`)
    ? triggerPath.slice(containerName.length + 1)
    : triggerName;

  context.log(`Processing blob: ${blobPath}`);
  context.log(`Blob trigger metadata: name=${triggerName}, blobTrigger=${triggerPath}`);

  if (!blobPath) {
    context.error('Unable to resolve blob path from trigger metadata.');
    return;
  }

  let prisma: typeof import('../lib/prisma-client').default | undefined;

  try {
    prisma = (await import('../lib/prisma-client')).default;
    
    // 1. Find the document record by blobPath
    const document = await prisma.document.findFirst({
      where: { blobPath },
    });

    if (!document) {
      context.error(`Document record not found for blob path: ${blobPath}`);
      return;
    }

    // 2. Set status to PROCESSING
    await prisma.document.update({
      where: { id: document.id },
      data: { status: 'PROCESSING' },
    });

    // 3. Extract metadata
    const extractedJson = await extractDocumentMetadata(
      blob,
      document.originalName,
      document.mimeType,
    );

    // 4. Update document with extracted data and COMPLETED status
    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: 'COMPLETED',
        extractedJson: extractedJson as any,
        processedAt: new Date(),
      },
    });

    context.log(`Successfully processed document: ${document.id}`);
  } catch (error) {
    context.error(`Error processing document at ${blobPath}:`, error);

    // Update status to FAILED
    try {
      if (prisma) {
        await prisma.document.updateMany({
          where: { blobPath },
          data: {
            status: 'FAILED',
            errorMessage: (error as any).message || 'Unknown error during processing',
            processedAt: new Date(),
          },
        });
      }
    } catch (updateError) {
      context.error('Failed to update document status to FAILED:', updateError);
    }
  }
}

app.storageBlob('processDocument', {
  path: 'documents/{name}',
  connection: 'AZURE_STORAGE_CONNECTION_STRING',
  handler: processDocument,
});
