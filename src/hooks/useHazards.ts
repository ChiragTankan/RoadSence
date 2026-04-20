import { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, onSnapshot, GeoPoint, Timestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { distanceBetween } from 'geofire-common';
import baseHazardsData from '../data/hazards.json';

export interface Hazard {
  id: string;
  type: 'pothole' | 'construction' | 'debris' | 'speed_bump' | 'other';
  location: GeoPoint | { latitude: number; longitude: number };
  geohash: string;
  reporterId: string;
  timestamp: Timestamp | { toDate: () => Date } | null;
  isPublic: boolean;
  source?: 'community' | 'static' | 'osm' | 'geosadak' | 'rdd2022';
}

export function useHazards(
  currentLocation: { lat: number, lng: number } | null, 
  user: any,
  activeRoute: [number, number][] = []
) {
  const [liveHazards, setLiveHazards] = useState<Hazard[]>([]);
  const [osmHazards, setOsmHazards] = useState<Hazard[]>([]);

  // Destination (last point of route)
  const destination = activeRoute.length > 0 ? activeRoute[activeRoute.length - 1] : null;

  // Fetch OpenStreetMap Data (Real-world construction/hazards/potholes)
  const fetchOsmData = useCallback(async (lat: number, lng: number, key: string) => {
    try {
      // Fetch construction zones and hazards within ~10km from Overpass API
      // We look for specific road defect tags: hazard, smoothness=horrible, surface=potholes
      // Optimized for high volume search mentioned in user request
      const overpassQuery = `
        [out:json][timeout:60];
        (
          node["highway"="construction"](around:10000, ${lat}, ${lng});
          way["highway"="construction"](around:10000, ${lat}, ${lng});
          node["hazard"~"pothole|road_damage"](around:10000, ${lat}, ${lng});
          node["surface"~"potholes|damaged"](around:10000, ${lat}, ${lng});
          node["smoothness"~"very_horrible|horrible|impassable"](around:10000, ${lat}, ${lng});
          way["smoothness"~"very_horrible|horrible|impassable"](around:10000, ${lat}, ${lng});
        );
        out body;
        >;
        out skel qt;
      `;
      
      const res = await fetch(`https://overpass-api.de/api/interpreter`, {
        method: 'POST',
        body: `data=${encodeURIComponent(overpassQuery)}`,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });
      
      if (!res.ok) {
        throw new Error(`Overpass API responded with status ${res.status}`);
      }

      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await res.text();
        console.warn("Unexpected non-JSON response from Overpass:", text.slice(0, 100));
        return;
      }

      const data = await res.json();
      
      const newHazards: Hazard[] = data.elements
        .filter((e: any) => e.lat && e.lon)
        .map((e: any) => ({
          id: `osm-${e.id}-${key}`,
          type: (e.tags?.hazard === 'pothole' || e.tags?.surface === 'potholes') ? 'pothole' : 'construction',
          location: { latitude: e.lat, longitude: e.lon },
          geohash: '',
          reporterId: 'osm-intelligence',
          timestamp: null,
          isPublic: true,
          source: 'osm'
        }));
      
      setOsmHazards(prev => {
        // Simple deduplication by ID
        const combined = [...prev, ...newHazards];
        const unique = Array.from(new Map(combined.map(h => [h.id, h])).values());
        return unique;
      });
    } catch (err) {
      console.error("OSM intel fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    if (currentLocation) {
      fetchOsmData(currentLocation.lat, currentLocation.lng, 'local');
    }
  }, [currentLocation?.lat, currentLocation?.lng]);

  useEffect(() => {
    if (destination) {
      fetchOsmData(destination[0], destination[1], 'dest');
    }
  }, [destination?.[0], destination?.[1]]);

  // Prepare base hazards from JSON
  const baseHazards = useMemo(() => {
    return baseHazardsData.hazards.map((h: any) => ({
      id: h.id,
      type: h.type as any,
      location: { latitude: h.lat, longitude: h.lng },
      geohash: '',
      reporterId: 'system',
      timestamp: null,
      isPublic: true,
      source: h.source || 'static'
    })) as Hazard[];
  }, []);

  useEffect(() => {
    // Only subscribe if we have an authenticated session (matches firestore rules)
    if (!user) {
      setLiveHazards([]);
      return;
    }

    const q = query(collection(db, 'public_hazards'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Hazard[];
      console.log(`Synced ${docs.length} global hazards from community.`);
      setLiveHazards(docs);
    }, (error) => {
      console.error("Firestore listening error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Merge datasets
  const hazards = useMemo(() => [...baseHazards, ...liveHazards, ...osmHazards], [baseHazards, liveHazards, osmHazards]);

  // Utility to get coordinates robustly
  const getCoords = (h: Hazard): [number, number] | null => {
    const lat = (h.location as any).latitude ?? (h.location as any).lat;
    const lng = (h.location as any).longitude ?? (h.location as any).lng;
    if (lat === undefined || lng === undefined) return null;
    return [lat, lng];
  };

  // Determine which hazards to show on map
  const visibleHazards = useMemo(() => {
    let filtered = hazards;

    // If navigating, only show hazards close to the route
    if (activeRoute.length > 0) {
      filtered = hazards.filter(h => {
        const coords = getCoords(h);
        if (!coords) return false;
        return activeRoute.some((point) => {
          const dist = distanceBetween(coords, point) * 1000;
          return dist < 300; 
        });
      });
    } else if (currentLocation) {
      // Otherwise show nearby hazards (within 2km for general overview)
      filtered = hazards.filter(h => {
        const coords = getCoords(h);
        if (!coords) return false;
        const dist = distanceBetween(coords, [currentLocation.lat, currentLocation.lng]) * 1000;
        return dist < 2000;
      });
    }

    // SPATIAL DEDUPLICATION / CLUSTERING
    // Group markers that are very close (e.g., within 50 meters) to prevent "marker overlap frustration"
    const uniqueHazards: Hazard[] = [];
    const minDistanceMeters = 50;

    filtered.forEach(h => {
      const coords = getCoords(h);
      if (!coords) return;

      const isDuplicate = uniqueHazards.some(uh => {
        const uhCoords = getCoords(uh);
        if (!uhCoords) return false;
        return distanceBetween(coords, uhCoords) * 1000 < minDistanceMeters;
      });

      if (!isDuplicate) {
        uniqueHazards.push(h);
      }
    });

    return uniqueHazards;
  }, [hazards, activeRoute, currentLocation]);

  const nearbyHazards = currentLocation 
    ? hazards.filter(h => {
        const coords = getCoords(h);
        if (!coords) return false;
        const dist = distanceBetween(coords, [currentLocation.lat, currentLocation.lng]) * 1000; // to meters
        return dist < 1000; // Show markers within 1km
      })
    : [];

  const criticalHazards = currentLocation
    ? hazards.filter(h => {
        const coords = getCoords(h);
        if (!coords) return false;
        const dist = distanceBetween(coords, [currentLocation.lat, currentLocation.lng]) * 1000;
        return dist < 500; // Trigger alert within 500m (Safety distance)
      })
    : [];

  return { hazards, visibleHazards, nearbyHazards, criticalHazards };
}
