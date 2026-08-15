import crypto from 'crypto';
import { dbRun } from '../db.js';

/**
 * Geocoding Service — Landmark-to-LatLng Resolver
 * 
 * Converts spoken Indian addresses + landmarks into precise GPS coordinates
 * using the Google Maps Geocoding API, with a smart local fallback for testing.
 * Also generates SMS pin-drop links when geocoding confidence is low.
 */

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

/**
 * Geocode a spoken address + landmark into lat/lng
 * @param {string} spokenAddress - The raw spoken address from the caller
 * @param {string} landmark - Nearby landmark (e.g., "near Senthil Hospital")
 * @param {string} city - City name (default: Coimbatore)
 * @returns {Promise<{latitude, longitude, formatted_address, confidence}>}
 */
export async function geocodeSpokenAddress(spokenAddress, landmark, city = 'Coimbatore') {
  const parts = [spokenAddress, landmark ? `near ${landmark}` : '', city, 'India'].filter(Boolean);
  const query = parts.join(', ');

  // ── Try Google Maps Geocoding API ──
  if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key') {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}&region=in&language=en`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const loc = result.geometry.location;
        const confidence = mapLocationType(result.geometry.location_type);

        console.log(`[Geocode] "${query}" → ${loc.lat}, ${loc.lng} (${confidence})`);

        return {
          latitude: loc.lat,
          longitude: loc.lng,
          formatted_address: result.formatted_address,
          confidence,
          place_id: result.place_id,
        };
      }

      console.log(`[Geocode] No results for: "${query}" (status: ${data.status})`);
    } catch (err) {
      console.error('[Geocode] Google Maps API error:', err.message);
    }
  }

  // ── Smart Local Fallback (Coimbatore-centered with landmark heuristics) ──
  return fallbackGeocode(spokenAddress, landmark, city);
}

/**
 * Map Google's location_type to our confidence levels
 */
function mapLocationType(locationType) {
  switch (locationType) {
    case 'ROOFTOP': return 'HIGH';
    case 'RANGE_INTERPOLATED': return 'MEDIUM';
    case 'GEOMETRIC_CENTER': return 'MEDIUM';
    case 'APPROXIMATE': return 'LOW';
    default: return 'UNKNOWN';
  }
}

/**
 * Smart fallback geocoder for offline/testing mode
 * Uses known Coimbatore area landmarks for approximate coordinates
 */
function fallbackGeocode(spokenAddress, landmark, city) {
  const text = `${spokenAddress} ${landmark || ''} ${city}`.toLowerCase();

  // Known Coimbatore landmarks → approximate coordinates
  const landmarks = {
    'rs puram': { lat: 11.0060, lng: 76.9543 },
    'gandhipuram': { lat: 11.0183, lng: 76.9725 },
    'gandhi nagar': { lat: 11.0140, lng: 76.9630 },
    'peelamedu': { lat: 11.0289, lng: 77.0001 },
    'saibaba colony': { lat: 11.0242, lng: 76.9608 },
    'race course': { lat: 11.0118, lng: 76.9650 },
    'town hall': { lat: 10.9987, lng: 76.9607 },
    'ukkadam': { lat: 10.9928, lng: 76.9596 },
    'singanallur': { lat: 10.9981, lng: 77.0270 },
    'hope college': { lat: 11.0040, lng: 76.9627 },
    'brookefields': { lat: 11.0237, lng: 76.9890 },
    'fun republic': { lat: 11.0207, lng: 76.9987 },
    'psg tech': { lat: 11.0243, lng: 77.0028 },
    'senthil hospital': { lat: 11.0105, lng: 76.9625 },
    'bharathi park': { lat: 11.0065, lng: 76.9595 },
    'avinashi road': { lat: 11.0200, lng: 77.0050 },
  };

  for (const [name, coords] of Object.entries(landmarks)) {
    if (text.includes(name)) {
      // Add slight random offset to simulate real addresses near the landmark
      const jitter = () => (Math.random() - 0.5) * 0.002;
      console.log(`[Geocode] Fallback matched landmark "${name}" for: "${spokenAddress}"`);
      return {
        latitude: coords.lat + jitter(),
        longitude: coords.lng + jitter(),
        formatted_address: `${spokenAddress}, Near ${landmark || name}, ${city}`,
        confidence: 'MEDIUM',
        place_id: null,
      };
    }
  }

  // Default: Coimbatore city center
  console.log(`[Geocode] Fallback → Coimbatore center for: "${spokenAddress}"`);
  return {
    latitude: 11.0168,
    longitude: 76.9558,
    formatted_address: `${spokenAddress}${landmark ? `, Near ${landmark}` : ''}, ${city}`,
    confidence: 'LOW',
    place_id: null,
  };
}

/**
 * Check if geocoding confidence warrants a fallback SMS pin drop
 * @param {string} confidence - 'HIGH', 'MEDIUM', 'LOW', or 'UNKNOWN'
 * @returns {boolean}
 */
export function needsPinDrop(confidence) {
  return confidence === 'LOW' || confidence === 'UNKNOWN';
}

/**
 * Creates a cryptographically random, single-use, time-expiring PIN drop confirmation token
 */
export async function createPinDropToken(orderId, phone = null, lat = 11.0168, lng = 76.9558) {
  const token = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(); // 2 hours expiration

  try {
    await dbRun(
      `INSERT INTO pin_tokens (token_hash, order_id, phone, expires_at)
       VALUES (?, ?, ?, ?)`,
      [tokenHash, typeof orderId === 'number' ? orderId : parseInt(orderId, 10) || 1, phone, expiresAt]
    );
  } catch (err) {
    console.warn('[PinToken] Failed to save pin token to database:', err.message);
  }

  return generatePinDropUrl(token, lat, lng);
}

/**
 * Generate a pin-drop URL with opaque token
 */
export function generatePinDropUrl(tokenOrOrderId, lat = 11.0168, lng = 76.9558) {
  const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
  return `${baseUrl}/pin/${tokenOrOrderId}?lat=${lat}&lng=${lng}`;
}
