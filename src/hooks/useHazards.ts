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

  // Fetch OpenStreetMap Data (Real-world construction/hazards/potholes)
  const fetchOsmData = useCallback(async (lat: number, lng: number) => {
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
      
      const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
      const data = await res.json();
      
      const hazards: Hazard[] = data.elements
        .filter((e: any) => e.lat && e.lon)
        .map((e: any) => ({
          id: `osm-${e.id}`,
          type: (e.tags?.hazard === 'pothole' || e.tags?.surface === 'potholes') ? 'pothole' : 'construction',
          location: { latitude: e.lat, longitude: e.lon },
          geohash: '',
          reporterId: 'osm-intelligence',
          timestamp: null,
          isPublic: true,
          source: 'osm'
        }));
      
      setOsmHazards(hazards);
    } catch (err) {
      console.error("OSM intel fetch failed:", err);
    }
  }, []);

  useEffect(() => {
    if (currentLocation) {
      fetchOsmData(currentLocation.lat, currentLocation.lng);
    }
  }, [currentLocation?.lat, currentLocation?.lng, fetchOsmData]);

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
    // If navigating, only show hazards close to the route
    if (activeRoute.length > 0) {
      return hazards.filter(h => {
        const coords = getCoords(h);
        if (!coords) return false;
        
        // Check distance to any point in the route (approximate polyline distance)
        // For performance, we sample the route points if it's very long
        const sampleRate = activeRoute.length > 100 ? Math.ceil(activeRoute.length / 50) : 1;
        
        return activeRoute.some((point, idx) => {
          if (idx % sampleRate !== 0) return false;
          const dist = distanceBetween(coords, point) * 1000;
          return dist < 100; // Within 100m of the active path
        });
      });
    }
    
    // Otherwise show nearby hazards (within 2km for general overview)
    if (currentLocation) {
      return hazards.filter(h => {
        const coords = getCoords(h);
        if (!coords) return false;
        const dist = distanceBetween(coords, [currentLocation.lat, currentLocation.lng]) * 1000;
        return dist < 2000;
      });
    }
    
    return hazards;
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
