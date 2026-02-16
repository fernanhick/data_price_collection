import sharp from 'sharp';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import config from '../config/index.js';
import logger from '../utils/logger.js';

export interface ImageProcessingResult {
  fullPath: string;
  thumbPath: string;
  fileSize: number;
  width: number;
  height: number;
}

export class ImageProcessor {
  private readonly baseDir = process.env.HOME + '/images/sneakers';
  private readonly thumbDir = process.env.HOME + '/images/sneakers/thumbs';
  private s3Client: S3Client | null = null;

  private get useS3(): boolean {
    return !!config.s3.bucket;
  }

  /**
   * Initialize directories on startup (local mode) or S3 client
   */
  async initialize(): Promise<void> {
    if (this.useS3) {
      this.s3Client = new S3Client({ region: config.s3.region });
      logger.info({ bucket: config.s3.bucket, region: config.s3.region }, 'S3 image storage initialized');
    } else {
      try {
        await fs.mkdir(this.baseDir, { recursive: true });
        await fs.mkdir(this.thumbDir, { recursive: true });
        logger.info('Local image directories initialized');
      } catch (error) {
        logger.error(
          { error: error instanceof Error ? error.message : String(error) },
          'Failed to initialize image directories'
        );
      }
    }
  }

  /**
   * Upload a buffer to S3
   */
  private async uploadToS3(buffer: Buffer, key: string): Promise<void> {
    if (!this.s3Client) throw new Error('S3 client not initialized');

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: buffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000',
      })
    );
  }

  /**
   * Get the public URL for an image
   */
  private getPublicUrl(key: string): string {
    if (config.s3.cloudfrontUrl) {
      return `${config.s3.cloudfrontUrl}/${key}`;
    }
    return `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  }

  /**
   * Download image from URL and optimize it
   */
  async downloadAndOptimize(
    imageUrl: string,
    styleCode: string
  ): Promise<ImageProcessingResult | null> {
    try {
      // Sanitize filename
      const safeFilename = this.sanitizeFilename(styleCode);

      // Download image
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      });

      const buffer = Buffer.from(response.data);

      // Process full-size image (600x600, WebP, 80% quality)
      const fullImage = await sharp(buffer)
        .resize(600, 600, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .webp({ quality: 80 })
        .toBuffer();

      // Process thumbnail (200x200, WebP, 75% quality)
      const thumbImage = await sharp(buffer)
        .resize(200, 200, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255, alpha: 1 },
        })
        .webp({ quality: 75 })
        .toBuffer();

      let fullPath: string;
      let thumbPath: string;

      if (this.useS3) {
        // Upload to S3
        const fullKey = `sneakers/${safeFilename}.webp`;
        const thumbKey = `sneakers/thumbs/${safeFilename}.webp`;

        await this.uploadToS3(fullImage, fullKey);
        await this.uploadToS3(thumbImage, thumbKey);

        fullPath = this.getPublicUrl(fullKey);
        thumbPath = this.getPublicUrl(thumbKey);
      } else {
        // Save locally
        fullPath = path.join(this.baseDir, `${safeFilename}.webp`);
        thumbPath = path.join(this.thumbDir, `${safeFilename}.webp`);

        await fs.writeFile(fullPath, fullImage);
        await fs.writeFile(thumbPath, thumbImage);

        // Return relative paths for local mode
        fullPath = `/images/sneakers/${safeFilename}.webp`;
        thumbPath = `/images/sneakers/thumbs/${safeFilename}.webp`;
      }

      const savings = ((1 - fullImage.length / buffer.length) * 100).toFixed(1);

      logger.info(
        {
          styleCode,
          originalSize: buffer.length,
          optimizedSize: fullImage.length,
          savings: `${savings}%`,
          storage: this.useS3 ? 's3' : 'local',
        },
        'Image optimized and saved'
      );

      return {
        fullPath,
        thumbPath,
        fileSize: fullImage.length,
        width: 600,
        height: 600,
      };
    } catch (error) {
      logger.error(
        {
          imageUrl,
          styleCode,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to download and optimize image'
      );
      return null;
    }
  }

  /**
   * Sanitize filename to prevent path traversal
   */
  private sanitizeFilename(input: string): string {
    return input.replace(/[^a-zA-Z0-9-]/g, '_');
  }

  /**
   * Check if image exists locally
   */
  async imageExists(styleCode: string): Promise<boolean> {
    const safeFilename = this.sanitizeFilename(styleCode);
    const fullPath = path.join(this.baseDir, `${safeFilename}.webp`);

    try {
      await fs.access(fullPath);
      return true;
    } catch {
      return false;
    }
  }
}

export default new ImageProcessor();
