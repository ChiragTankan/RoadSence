import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, GeoPoint, Timestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';

export interface Hazard {
  id: string;
  type: 'pothole' | 'construction' | 'debris' | 'speed_bump' | 'other';
  location: GeoPoint;
  geohash: string;
  reporterId: string;
  timestamp: Timestamp;
  isPublic: boolean;
}

export function useHazards(currentLocation: { lat: number, lng: number } | null, user: any) {
  const [hazards, setHazards] = useState<Hazard[]>([]);

  useEffect(() => {
    // Only subscribe if we have an authenticated session (matches firestore rules)
    if (!user) {
      setHazards([]);
      return;
    }

    const q = query(collection(db, 'public_hazards'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Hazard[];
      console.log(`Synced ${docs.length} global hazards from community.`);
      setHazards(docs);
    }, (error) => {
      console.error("Firestore listening error:", error);
    });

    return () => unsubscribe();
  }, [user]);

  // Filter hazards by distance locally for the warning logic (200m)
  const nearbyHazards = currentLocation 
    ? hazards.filter(h => {
        const dist = distanceBetween([h.location.latitude, h.location.longitude], [currentLocation.lat, currentLocation.lng]) * 1000; // to meters
        return dist < 1000; // Show markers within 1km
      })
    : [];

  const criticalHazards = currentLocation
    ? hazards.filter(h => {
        const dist = distanceBetween([h.location.latitude, h.location.longitude], [currentLocation.lat, currentLocation.lng]) * 1000;
        return dist < 200; // Trigger alert within 200m
      })
    : [];

  return { hazards, nearbyHazards, criticalHazards };
}
