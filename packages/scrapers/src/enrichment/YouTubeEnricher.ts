/**
 * YouTube enricher — searches YouTube Data API v3 for a hotel's promotional video.
 *
 * Requires env var:  YOUTUBE_API_KEY  (Google Cloud project with YouTube Data API v3 enabled)
 *
 * Free quota: 10 000 units/day. Each search costs 100 units → 100 free searches/day.
 * If the key is not set the enricher is a no-op.
 */

import { logger } from '../base/logger.js';
import { jitteredDelay } from '../base/retry.js';

export class YouTubeEnricher {
  private readonly apiKey: string | null;

  constructor() {
    this.apiKey = process.env['YOUTUBE_API_KEY'] ?? null;
  }

  isAvailable(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Returns a YouTube video ID (e.g. "dQw4w9WgXcQ") or null if nothing found.
   */
  async findHotelVideo(hotelName: string, location: string): Promise<string | null> {
    if (!this.apiKey) return null;

    try {
      await jitteredDelay(500, 300);

      const query = `${hotelName} ${location} hotel`;
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.set('part', 'snippet');
      url.searchParams.set('q', query);
      url.searchParams.set('type', 'video');
      url.searchParams.set('maxResults', '5');
      url.searchParams.set('videoDuration', 'medium'); // 4–20 min — typical hotel tour length
      url.searchParams.set('relevanceLanguage', 'pl');
      url.searchParams.set('key', this.apiKey);

      const res = await fetch(url.toString());

      if (!res.ok) {
        logger.warn('YouTube API error', { status: res.status, hotel: hotelName });
        return null;
      }

      const data = (await res.json()) as {
        items?: Array<{
          id: { videoId: string };
          snippet: { title: string; description: string };
        }>;
      };

      const items = data.items ?? [];
      if (items.length === 0) return null;

      // Prefer items whose title contains the hotel name
      const nameLower = hotelName.toLowerCase();
      const best =
        items.find((i) => i.snippet.title.toLowerCase().includes(nameLower)) ?? items[0];

      return best?.id?.videoId ?? null;
    } catch (err) {
      logger.warn('YouTube enrichment failed', { hotel: hotelName, error: String(err) });
      return null;
    }
  }
}
