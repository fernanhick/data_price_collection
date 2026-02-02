import axios, { AxiosError, AxiosInstance } from 'axios';
import config from '../config/index.js';
import logger from './logger.js';

// Create axios instance with defaults
const httpClient: AxiosInstance = axios.create({
  timeout: config.scraper.timeoutMs,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
});

// Track last request time per domain to implement rate limiting
const lastRequestTime: Map<string, number> = new Map();
const MIN_REQUEST_INTERVAL_MS = 1000; // 1 second between requests to same domain

/**
 * Extract domain from URL
 */
function getDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return 'unknown';
  }
}

/**
 * Rate limit requests to the same domain
 */
async function rateLimit(url: string): Promise<void> {
  const domain = getDomain(url);
  const lastTime = lastRequestTime.get(domain) || 0;
  const timeSinceLastRequest = Date.now() - lastTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL_MS) {
    const waitTime = MIN_REQUEST_INTERVAL_MS - timeSinceLastRequest;
    logger.debug({ domain, waitTime }, 'Rate limiting request');
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime.set(domain, Date.now());
}

/**
 * Fetch URL with automatic retry on failure
 */
export async function fetchUrl(
  url: string,
  options: { retries?: number; timeout?: number } = {},
): Promise<string> {
  const maxRetries = options.retries ?? config.scraper.retryAttempts;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Apply rate limiting
      await rateLimit(url);

      logger.debug({ url, attempt }, 'Fetching URL');
      const response = await httpClient.get(url, {
        timeout: options.timeout ?? config.scraper.timeoutMs,
      });

      logger.debug({ url, status: response.status }, 'URL fetched successfully');
      return response.data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      const axiosError = error as AxiosError;

      // Check if error is retryable
      const status = axiosError.response?.status;
      const isRetryable =
        !status || // Network error
        status === 429 || // Rate limited
        status === 503 || // Service unavailable
        status === 504; // Gateway timeout

      if (isRetryable && attempt < maxRetries) {
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000); // Exponential backoff
        logger.warn(
          { url, attempt, maxRetries, status, backoffMs },
          'Request failed, retrying with backoff',
        );
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } else {
        logger.error(
          { url, attempt, maxRetries, status, error: lastError.message },
          'Request failed permanently',
        );
        break;
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${maxRetries} attempts`);
}

/**
 * Fetch JSON data
 */
export async function fetchJson<T = any>(url: string): Promise<T> {
  const html = await fetchUrl(url);
  try {
    return JSON.parse(html) as T;
  } catch (error) {
    logger.error({ url, error }, 'Failed to parse JSON response');
    throw new Error(`Invalid JSON response from ${url}`);
  }
}

/**
 * Simulate random delay to avoid detection
 */
export function getRandomDelay(min: number = 500, max: number = 2000): number {
  return Math.random() * (max - min) + min;
}

/**
 * Delay execution
 */
export async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
