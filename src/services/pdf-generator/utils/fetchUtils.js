// utils/fetchUtils.js

/**
 * Utility module for handling fetch operations with fallbacks
 */

let _fetchInstance = null;
let _nodeFetch = null;

/**
 * Get a fetch instance, with fallback to node-fetch if needed
 * @returns {Promise<Function>} Fetch function
 */
export async function getFetch() {
  // Return existing instance if already created
  if (_fetchInstance) return _fetchInstance;

  // Try to use native fetch first
  if (typeof fetch !== 'undefined' && typeof window !== 'undefined') {
    _fetchInstance = fetch;
    return _fetchInstance;
  }

  // Fall back to node-fetch for Node.js environments
  try {
    if (!_nodeFetch) {
      // Dynamic import to avoid loading node-fetch in browser environments
      const nodeFetchModule = await import('node-fetch');
      _nodeFetch = nodeFetchModule.default || nodeFetchModule;
    }
    _fetchInstance = _nodeFetch;
    return _fetchInstance;
  } catch (error) {
    console.error('Failed to load fetch implementation:', error);
    throw new Error('No fetch implementation available');
  }
}

/**
 * Safe fetch wrapper with timeout and error handling
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds (default: 10000)
 * @returns {Promise<Response>} Fetch response
 */
export async function safeFetch(url, options = {}, timeoutMs = 10000) {
  const fetchFn = await getFetch();
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'PDF-Generator/1.0',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`Fetch timeout after ${timeoutMs}ms for URL: ${url}`);
    }
    
    throw error;
  }
}

/**
 * Fetch with retry logic
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @param {number} retryDelayMs - Delay between retries in milliseconds (default: 1000)
 * @returns {Promise<Response>} Fetch response
 */
export async function fetchWithRetry(url, options = {}, maxRetries = 3, retryDelayMs = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await safeFetch(url, options, 15000);
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      // Exponential backoff with jitter
      const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
      console.warn(`Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${delay}ms:`, error.message);
    }
  }
  
  throw new Error(`Failed to fetch ${url} after ${maxRetries + 1} attempts: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Fetch image as buffer with proper error handling
 * @param {string} url - Image URL
 * @param {number} timeoutMs - Timeout in milliseconds (default: 15000)
 * @returns {Promise<Buffer>} Image buffer
 */
export async function fetchImageBuffer(url, timeoutMs = 15000) {
  const response = await safeFetch(url, {}, timeoutMs);
  
  // Check if response is an image
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) {
    console.warn(`URL ${url} returned non-image content type: ${contentType}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Check if a URL is valid and reachable
 * @param {string} url - URL to check
 * @param {number} timeoutMs - Timeout in milliseconds (default: 5000)
 * @returns {Promise<boolean>} True if URL is reachable
 */
export async function isUrlReachable(url, timeoutMs = 5000) {
  try {
    const fetchFn = await getFetch();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetchFn(url, {
      method: 'HEAD',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Fetch with cache support (in-memory)
 */
export class CachedFetch {
  constructor() {
    this.cache = new Map();
    this.maxCacheSize = 100;
    this.defaultTTL = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Generate cache key from URL and options
   * @private
   */
  _generateCacheKey(url, options = {}) {
    return `${url}::${JSON.stringify(options)}`;
  }

  /**
   * Clear expired cache entries
   * @private
   */
  _cleanupCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiry < now) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Fetch with cache
   * @param {string} url - URL to fetch
   * @param {Object} options - Fetch options
   * @param {number} ttlMs - Time to live in milliseconds
   * @returns {Promise<Response>} Fetch response
   */
  async fetch(url, options = {}, ttlMs = this.defaultTTL) {
    // Cleanup before operation
    this._cleanupCache();

    const cacheKey = this._generateCacheKey(url, options);
    const cachedEntry = this.cache.get(cacheKey);

    if (cachedEntry && cachedEntry.expiry > Date.now()) {
      return cachedEntry.response;
    }

    // Enforce cache size limit
    if (this.cache.size >= this.maxCacheSize) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }

    const fetchFn = await getFetch();
    const response = await fetchFn(url, options);
    
    // Clone response for caching (responses can only be consumed once)
    const responseClone = response.clone();
    
    this.cache.set(cacheKey, {
      response: responseClone,
      expiry: Date.now() + ttlMs,
    });

    return response;
  }

  /**
   * Clear the cache
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const entry of this.cache.values()) {
      if (entry.expiry > now) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      total: this.cache.size,
      valid: validEntries,
      expired: expiredEntries,
      maxSize: this.maxCacheSize,
    };
  }
}

// Export a singleton instance
export const cachedFetch = new CachedFetch();

/**
 * Fetch utility for image optimization with caching
 */
export class ImageFetch {
  constructor() {
    this.fetchInstance = cachedFetch;
  }

  /**
   * Fetch image with caching and timeout
   * @param {string} url - Image URL
   * @returns {Promise<ArrayBuffer>} Image data as ArrayBuffer
   */
  async fetchImage(url) {
    try {
      const response = await this.fetchInstance.fetch(url, {}, 10 * 60 * 1000); // 10 minutes TTL for images
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.arrayBuffer();
    } catch (error) {
      console.warn(`Failed to fetch image from ${url}:`, error.message);
      throw error;
    }
  }

  /**
   * Fetch multiple images in parallel with concurrency limit
   * @param {string[]} urls - Array of image URLs
   * @param {number} concurrency - Maximum concurrent fetches (default: 5)
   * @returns {Promise<Array<{url: string, buffer: Buffer, error: Error|null}>>} Results array
   */
  async fetchImages(urls, concurrency = 5) {
    const results = [];
    const queue = [...urls];
    
    // Process queue with concurrency limit
    const workers = Array(concurrency).fill().map(async () => {
      while (queue.length > 0) {
        const url = queue.shift();
        if (!url) break;
        
        try {
          const arrayBuffer = await this.fetchImage(url);
          results.push({
            url,
            buffer: Buffer.from(arrayBuffer),
            error: null,
          });
        } catch (error) {
          results.push({
            url,
            buffer: null,
            error,
          });
        }
      }
    });
    
    await Promise.all(workers);
    return results;
  }
}

// Export a singleton instance
export const imageFetch = new ImageFetch();

// Default export
export default {
  getFetch,
  safeFetch,
  fetchWithRetry,
  fetchImageBuffer,
  isUrlReachable,
  cachedFetch,
  imageFetch,
  CachedFetch,
  ImageFetch,
};