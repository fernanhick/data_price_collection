import sharp from 'sharp';
import axios from 'axios';
import { promises as fs } from 'fs';
import path from 'path';
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

  /**
   * Initialize directories on startup
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.baseDir, { recursive: true });
      await fs.mkdir(this.thumbDir, { recursive: true });
      logger.info('Image directories initialized');
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error) },
        'Failed to initialize image directories'
      );
    }
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
      const fullPath = path.join(this.baseDir, `${safeFilename}.webp`);
      const thumbPath = path.join(this.thumbDir, `${safeFilename}.webp`);

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

      // Save files
      await fs.writeFile(fullPath, fullImage);
      await fs.writeFile(thumbPath, thumbImage);

      const savings = ((1 - fullImage.length / buffer.length) * 100).toFixed(1);

      logger.info(
        {
          styleCode,
          originalSize: buffer.length,
          optimizedSize: fullImage.length,
          savings: `${savings}%`,
        },
        'Image optimized and saved'
      );

      return {
        fullPath: `/images/sneakers/${safeFilename}.webp`,
        thumbPath: `/images/sneakers/thumbs/${safeFilename}.webp`,
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
