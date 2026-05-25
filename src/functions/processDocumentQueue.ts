import { app, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { extractDocumentMetadata } from '../lib/document-extractor';

interface DocumentProcessingMessage {
  documentId: string;
  blobPath: string;
  originalName: string;
  mimeType: string;
}

console.log('processDocumentQueue loaded');

export async function processDocumentQueue(
  message: DocumentProcessingMessage,
  context: InvocationContext,
): Promise<void> {
  context.log(`Processing queue message: ${JSON.stringify(message)}`);

  const { default: prisma } = await import('../lib/prisma-client');

  try {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'documents';

    if (!connectionString) {
      throw new Error('AZURE_STORAGE_CONNECTION_STRING is not configured');
    }

    await prisma.document.update({
      where: { id: message.documentId },
      data: { status: 'PROCESSING' },
    });

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const blobClient = blobServiceClient
      .getContainerClient(containerName)
      .getBlobClient(message.blobPath);

    const downloadResponse = await blobClient.download();
    const chunks: Buffer[] = [];

    for await (const chunk of downloadResponse.readableStreamBody ?? []) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }

    const blob = Buffer.concat(chunks);
    const extractedJson = await extractDocumentMetadata(
      blob,
      message.originalName,
      message.mimeType,
    );

    await prisma.document.update({
      where: { id: message.documentId },
      data: {
        status: 'COMPLETED',
        extractedJson: extractedJson as any,
        processedAt: new Date(),
      },
    });

    context.log(`Successfully processed document: ${message.documentId}`);
  } catch (error) {
    context.error(`Error processing document ${message.documentId}:`, error);

    await prisma.document.update({
      where: { id: message.documentId },
      data: {
        status: 'FAILED',
        errorMessage: (error as any).message || 'Unknown error during processing',
        processedAt: new Date(),
      },
    });

    throw error;
  }
}

app.storageQueue('processDocumentQueue', {
  queueName: process.env.AZURE_STORAGE_QUEUE_NAME || 'document-processing',
  connection: 'AZURE_STORAGE_CONNECTION_STRING',
  handler: processDocumentQueue,
});
