import type { Place } from '../lib'

export const place = (o: Partial<Place> = {}): Place => ({
  id: 'p', kind: 'activity', name: 'X', description: null, price_jpy: 1000, halal: null, nearest_hotels: [],
  travel_text: null, travel_minutes: 10, wait_text: null, wait_minutes: 0, long_line: null, taste: null,
  maps_url: 'https://maps.app.goo.gl/x', website_url: null, image_url: null, auto_fields: [], auto_sources: null, category: null, lat: 35.67, lng: 139.75, visit_minutes: null,
  visited: false, visited_at: null, created_by: null, created_at: '2026-10-18', ...o,
})

