import { pipeline } from '@xenova/transformers';

// Singleton to limit model loading to once
let generateEmbedding: any = null;

/**
 * Generate embeddings using a local small model
 * Model: Xenova/all-MiniLM-L6-v2 (384 dimensions)
 */
export async function getEmbedding(text: string): Promise<number[]> {
    if (!generateEmbedding) {
        console.error('Loading local embedding model (Xenova/all-MiniLM-L6-v2)...');
        generateEmbedding = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
        console.error('Model loaded.');
    }

    // Generate embedding with mean pooling and normalization
    const output = await generateEmbedding(text, {
        pooling: 'mean',
        normalize: true
    });

    // The output is a Tensor, convert to standard array
    return Array.from(output.data);
}

export const EMBEDDING_DIMENSION = 384;
