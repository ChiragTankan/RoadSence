/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, Bell, Map as MapIcon, Shield, Search, AlertOctagon, User, LogIn, Camera, X, AlertTriangle, HardHat, Info, MapPin, LayoutGrid, Settings, Globe, CheckCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation as useRouterLocation, useSearchParams } from 'react-router-dom';
import { auth, signInWithGoogle, db } from './lib/firebase';
import { doc, updateDoc, arrayUnion, deleteDoc, increment, getDoc } from 'firebase/firestore';
import { distanceBetween } from 'geofire-common';
import { useLocation } from './hooks/useLocation';
import { useHazards } from './hooks/useHazards';
import { DetectionService } from './components/Detection/DetectionService';
import { cn } from './lib/utils';

// Fix Leaflet icons
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// Custom Icons for different hazards
const potholeIcon = L.divIcon({
  html: `<div class="hazard-marker-pothole">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-white"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
         </div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const constructionIcon = L.divIcon({
  html: `<div class="hazard-marker-construction">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-black"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 12 0v3"/><path d="m9 11 3 3 3-3"/></svg>
         </div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

// Component to handle map centering and route focus
function MapController({ center, route, isNavigating }: { center: [number, number] | null, route: [number, number][], isNavigating: boolean }) {
  const map = useMap();
  const hasFittedRef = useRef(false);

  useEffect(() => {
    if (route.length > 0 && !hasFittedRef.current) {
      const bounds = L.latLngBounds(route);
      map.fitBounds(bounds, { padding: [100, 100], animate: true });
      hasFittedRef.current = true;
    } else if (route.length === 0) {
      hasFittedRef.current = false;
      if (center) {
        map.setView(center, 15, { animate: true });
      }
    }
  }, [route, map, center]);

  // Active follow mode
  useEffect(() => {
    if (isNavigating && center && hasFittedRef.current) {
      // In a real nav app, we'd follow the user, but for route overview, we stay fitted.
      // If user moves significantly, we might want to re-center.
    } else if (!isNavigating && center) {
       map.setView(center, map.getZoom());
    }
  }, [center, isNavigating, map]);

  return null;
}

export default function App() {
  const navigate = useNavigate();
  const routerLocation = useRouterLocation();
  const [searchParams] = useSearchParams();

  const [user, setUser] = useState(auth.currentUser);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [allRoutes, setAllRoutes] = useState<any[]>([]);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const { location, error: locError } = useLocation();
  const { hazards, visibleHazards, criticalHazards } = useHazards(location, user, route);
  const [activeTab, setActiveTab] = useState<'map' | 'reports'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [showDetection, setShowDetection] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showGoModal, setShowGoModal] = useState(false);
  const [destinationInput, setDestinationInput] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isFetchingSuggestions, setIsFetchingSuggestions] = useState(false);

  const [showLegend, setShowLegend] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showLocationReminder, setShowLocationReminder] = useState(false);
  const [isAppLoading, setIsAppLoading] = useState(true);
  const [mapMode, setMapMode] = useState<'dark' | 'satellite'>('satellite');
  const [dismissedHazards, setDismissedHazards] = useState<Set<string>>(new Set());
  const [isVoting, setIsVoting] = useState<string | null>(null);

  const handleCommunityVote = async (hazard: any) => {
    if (!user) {
      alert("Please login to participate in community safety.");
      return;
    }

    if (hazard.source && hazard.source !== 'community') {
      alert("Only community-reported hazards can be marked as fixed by the community.");
      return;
    }

    if (hazard.votedToDeleteBy?.includes(user.uid)) {
      alert("You have already voted for this hazard.");
      return;
    }

    setIsVoting(hazard.id);
    try {
      const hazardRef = doc(db, 'public_hazards', hazard.id);
      const userReportRef = doc(db, `users/${hazard.reporterId}/my_reports`, hazard.id);

      const currentVotes = (hazard.deleteVotes || 0) + 1;

      if (currentVotes >= 5) {
        // Delete from both places
        await deleteDoc(hazardRef);
        try {
          await deleteDoc(userReportRef);
        } catch (e) {
          console.log("Personal report cleanup failed (might not be the owner)");
        }
        alert("Community Consensus Reached: Hazard permanent removal initiated.");
      } else {
        // Increment votes
        await updateDoc(hazardRef, {
          deleteVotes: increment(1),
          votedToDeleteBy: arrayUnion(user.uid)
        });
        alert(`Vote Registered. [${currentVotes}/5] votes needed for removal.`);
      }
    } catch (error) {
      console.error("Community voting error:", error);
      alert("Voting failed. Please check your connection.");
    } finally {
      setIsVoting(null);
    }
  };
  const activeCriticalHazards = useMemo(() => {
    return criticalHazards.filter(h => !dismissedHazards.has(h.id));
  }, [criticalHazards, dismissedHazards]);

  useEffect(() => {
    // Initial app loading sequence
    const timer = setTimeout(() => setIsAppLoading(false), 3500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Show location reminder for few seconds on initial load if location missing
    if (!location || locError) {
      setShowLocationReminder(true);
      const timer = setTimeout(() => setShowLocationReminder(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [location === null, locError !== null]);
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (destinationInput.length < 3) {
        setSuggestions([]);
        return;
      }

      setIsFetchingSuggestions(true);
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destinationInput)}&limit=5`);
        const data = await res.json();
        setSuggestions(data);
      } catch (err) {
        console.error("Suggestions error:", err);
      } finally {
        setIsFetchingSuggestions(false);
      }
    };

    const timeoutId = setTimeout(fetchSuggestions, 500);
    return () => clearTimeout(timeoutId);
  }, [destinationInput]);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => setUser(u));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (isNavigating) {
      setActiveTab('map');
      setShowDetection(false);
      setShowGoModal(false);
    }
  }, [isNavigating]);

  const triggerNotification = (hazardType: string) => {
    if (Notification.permission === 'granted') {
      new Notification("ROAD HAZARD AHEAD!", {
        body: `A ${hazardType} is spotted in next 500m. Go slow!`,
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission();
    }
  };

  useEffect(() => {
    if (activeCriticalHazards.length > 0 && isNavigating) {
      triggerNotification(activeCriticalHazards[0].type);
    }
  }, [activeCriticalHazards.length, isNavigating]);

  useEffect(() => {
    // Check for deep links on initial load / location ready
    const destParam = searchParams.get('dest');
    if (destParam && location && !isNavigating && !isSearching) {
      setDestinationInput(destParam);
      handleGo(destParam);
    }
  }, [location !== null, searchParams.get('dest')]);

  const handleGo = async (destName: string) => {
    if (!destName || !location) return;

    setIsSearching(true);
    setShowGoModal(false);
    
    // Update URL for sharing
    navigate(`/trip?dest=${encodeURIComponent(destName)}`, { replace: true });

    try {
      const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destName)}`);
      const geoData = await geoRes.json();

      if (geoData && geoData.length > 0) {
        const dest = { lat: parseFloat(geoData[0].lat), lng: parseFloat(geoData[0].lon) };
        const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&alternatives=3`);
        const routeData = await routeRes.json();

        if (routeData.routes && routeData.routes.length > 0) {
          // SMART SAFE ROUTING LOGIC
          // Score each route based on hazard density
          const processedRoutes = routeData.routes.map((r: any, idx: number) => {
            const coords = r.geometry.coordinates.map((c: any) => [c[1], c[0]]);
            let hazardCount = 0;

            // Simple danger score: how many known hazards are near this path?
            hazards.forEach(h => {
              const hLat = h.location?.latitude ?? (h as any).location?.lat;
              const hLng = h.location?.longitude ?? (h as any).location?.lng;
              if (hLat !== undefined && hLng !== undefined) {
                const isNear = coords.some((p: [number, number]) => {
                  return distanceBetween([hLat, hLng], p) * 1000 < 150; // within 150m of path
                });
                if (isNear) hazardCount++;
              }
            });

            return { 
              coords, 
              hazardCount, 
              distance: r.distance, 
              duration: r.duration,
              id: idx
            };
          });

          // Sort alternatives: we want to present them, but maybe highlight the safest
          setAllRoutes(processedRoutes);
          
          // Default to the safest route (lowest hazard count)
          const safestIdx = processedRoutes.indexOf(
            processedRoutes.reduce((prev: any, curr: any) => (prev.hazardCount < curr.hazardCount ? prev : curr))
          );
          
          setSelectedRouteIndex(safestIdx);
          setRoute(processedRoutes[safestIdx].coords);
          setIsNavigating(true);
        }
      } else {
        alert("Location not found.");
      }
    } catch (err) {
      console.error("Search/Routing error:", err);
      alert("Error finding route.");
    } finally {
      setIsSearching(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-start pt-24 p-6 text-white font-sans overflow-y-auto">
        <motion.div 
          initial={{ scale: 0.9, y: 20, opacity: 0 }}
          animate={{ scale: 1, y: 0, opacity: 1 }}
          className="text-center space-y-8 max-w-sm w-full"
        >
          <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-blue-500/20">
            <Shield size={40} className="text-white" />
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight">Road Sense</h1>
            <p className="text-gray-400">Intelligent hazard detection & real-time proximity warnings for safer roads.</p>
          </div>
          <button 
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 bg-black text-white border border-white/20 font-black py-4 px-6 rounded-2xl hover:bg-white/5 transition-all active:scale-95 uppercase italic tracking-widest"
          >
            <LogIn size={20} />
            Sign in with Google to Start
          </button>
        </motion.div>
      </div>
    );
  }

  const currentPos: [number, number] = location ? [location.lat, location.lng] : [20.5937, 78.9629];

  return (
    <div className="relative h-screen h-[100dvh] w-full bg-black overflow-hidden font-sans selection:bg-blue-500/30">
      
      {/* Top Controls - Specialist Instrument Header */}
      {!isNavigating && (
        <header className="absolute top-6 inset-x-6 z-[600] flex justify-between items-center pointer-events-none">
          <div className="flex flex-col gap-1 pointer-events-auto">
             <div className="h-14 w-auto px-5 bg-black backdrop-blur-3xl shadow-lg rounded-[24px] flex items-center gap-4 border border-white/20">
               <div className="relative">
                 <Shield size={28} className="text-blue-500" />
                 <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full animate-pulse border border-black" />
               </div>
               <div className="h-8 w-[1px] bg-white/10" />
               <div className="flex flex-col justify-center">
                 <span className="font-black text-xl text-white tracking-tighter italic uppercase leading-none">Road Sense</span>
                 <div className="flex items-center gap-2 mt-1">
                    <span className="mono-label text-blue-500/80">AI_CORE: ACTIVE</span>
                    <div className="flex gap-0.5">
                       {[1,1,1,0.4].map((op, i) => (
                         <div key={i} style={{ opacity: op }} className="w-1 h-2 bg-blue-500 rounded-full" />
                       ))}
                    </div>
                 </div>
               </div>
             </div>
          </div>
          
          <div className="relative flex items-center pointer-events-auto gap-3">
            {/* System Telemetry (Mock) */}
            <div className="hidden lg:flex items-center gap-6 px-6 h-14 bg-black/40 backdrop-blur-3xl border border-white/10 rounded-[24px]">
               <div className="flex flex-col">
                  <span className="mono-label text-white/30">System Latency</span>
                  <span className="mono-label text-green-400">14.2ms</span>
               </div>
               <div className="h-6 w-[1px] bg-white/10" />
               <div className="flex flex-col">
                  <span className="mono-label text-white/30">Satellites</span>
                  <span className="mono-label text-white">08/12</span>
               </div>
               <div className="h-6 w-[1px] bg-white/10" />
               <div className="flex flex-col">
                  <span className="mono-label text-white/30">Signal</span>
                  <div className="flex items-end gap-0.5 h-3">
                     {[2,4,6,8].map(h => <div key={h} style={{ height: h }} className="w-1 bg-blue-500 rounded-full" />)}
                  </div>
               </div>
            </div>

            {/* User Access Terminal */}
            <button 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={cn(
                "h-14 w-14 glass-panel shadow-lg rounded-[24px] flex items-center justify-center transition-all overflow-hidden group",
                showProfileMenu ? "bg-blue-600/20 ring-2 ring-blue-500/50" : "hover:bg-white/5"
              )}
            >
              <div className="relative">
                <User size={24} className={cn("text-white transition-transform duration-300", showProfileMenu ? "scale-90" : "group-hover:scale-110")} />
                <div className="absolute inset-0 border border-white/20 rounded-full scale-150 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>

            {/* Profile Terminal Panel */}
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-16 right-0 w-64 glass-panel rounded-[32px] shadow-2xl overflow-hidden p-2"
                >
                  <div className="p-4 bg-white/5 rounded-3xl border border-white/10 mb-2">
                    <div className="flex items-center gap-3 mb-3">
                       <div className="w-10 h-10 rounded-2xl bg-blue-600/20 flex items-center justify-center border border-blue-500/30">
                          <Shield size={18} className="text-blue-400" />
                       </div>
                       <div className="flex-1 min-w-0">
                          <p className="mono-label text-white/40 mb-0.5">Authorized Operative</p>
                          <p className="text-sm font-black text-white truncate uppercase italic tracking-tight">{user?.displayName || 'User'}</p>
                       </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/10">
                       <div className="p-2 bg-black/40 rounded-xl border border-white/5">
                          <p className="mono-label text-white/30 truncate">Reports</p>
                          <p className="text-xs font-bold text-white uppercase italic">12.4k</p>
                       </div>
                       <div className="p-2 bg-black/40 rounded-xl border border-white/5">
                          <p className="mono-label text-white/30 truncate">Trust</p>
                          <p className="text-xs font-bold text-blue-400 capitalize italic">Elite</p>
                       </div>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => auth.signOut()}
                    className="flex items-center gap-4 px-6 py-4 hover:bg-red-600/20 text-left transition-all group/out rounded-2xl w-full"
                  >
                    <div className="w-10 h-10 rounded-2xl bg-red-600/10 flex items-center justify-center border border-red-500/20 group-hover/out:bg-red-600/30 transition-colors">
                      <LogIn size={20} className="text-red-500 -rotate-180" />
                    </div>
                    <div className="flex flex-col">
                       <span className="text-[12px] font-black uppercase tracking-[0.15em] text-red-500 italic">Deactivate</span>
                       <span className="mono-label text-red-500/40">Secure Sign Out</span>
                    </div>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>
      )}


      {/* Map Legend - Specialist Hardware Panel */}
      {!isNavigating && (
        <div className="absolute right-6 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-4 pointer-events-none group/legend">
          {/* Mobile Toggle Button */}
          <button 
            onClick={() => setShowLegend(!showLegend)}
            className="md:hidden w-12 h-12 glass-panel shadow-2xl rounded-2xl flex items-center justify-center pointer-events-auto active:scale-95 transition-all text-white"
          >
            <Settings size={20} className={cn("text-blue-500 transition-transform duration-700", showLegend ? "rotate-90" : "")} />
          </button>

          {/* Tactical Status Panel */}
          <motion.div 
            initial={false}
            animate={{ 
              x: (showLegend || (typeof window !== 'undefined' && window.innerWidth >= 768)) ? 0 : 40,
              opacity: (showLegend || (typeof window !== 'undefined' && window.innerWidth >= 768)) ? 1 : 0,
              scale: (showLegend || (typeof window !== 'undefined' && window.innerWidth >= 768)) ? 1 : 0.9
            }}
            className={cn(
              "glass-panel p-4 rounded-[32px] shadow-[0_32px_64px_-16px_rgba(0,0,0,1)]",
              "flex flex-col gap-5 pointer-events-auto transition-all duration-300 w-36",
              showLegend ? "flex" : "hidden md:flex"
            )}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
               <span className="mono-label text-white/50 italic">Markers</span>
               <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            </div>
            
            <div className="space-y-5">
              <div className="flex items-center gap-3 group/item">
                <div className="relative shrink-0">
                  <div className="hazard-marker-pothole border-white/10 shadow-none scale-110">
                    <AlertTriangle size={12} className="text-white" />
                  </div>
                  <div className="absolute -inset-1 rounded-full border border-red-500/30 animate-pulse" />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-black uppercase text-white leading-none">Pothole</span>
                  <span className="mono-label text-red-500/60 mt-0.5">Critical</span>
                </div>
              </div>

              <div className="flex items-center gap-3 group/item">
                <div className="shrink-0 scale-110">
                   <div className="hazard-marker-construction border-white/10 shadow-none">
                      <HardHat size={12} className="text-black" />
                   </div>
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] font-black uppercase text-white leading-none">Work Zone</span>
                  <span className="mono-label text-yellow-500/60 mt-0.5">Caution</span>
                </div>
              </div>

            </div>

            <div className="pt-3 border-t border-white/10 text-center">
              <span className="mono-label text-[8px] text-white/20 tracking-[0.2em] italic">Road Sense V2.4</span>
            </div>
          </motion.div>
        </div>
      )}

      {/* Navigator Back Button */}
      {isNavigating && (
        <button 
          onClick={() => { setRoute([]); setIsNavigating(false); }}
          className="absolute top-4 left-4 z-50 h-12 px-4 bg-black/80 backdrop-blur text-white shadow-2xl rounded-2xl flex items-center gap-2 hover:bg-black transition-all"
        >
          <AlertOctagon size={20} className="text-yellow-400" />
          <span className="font-bold uppercase text-xs tracking-widest text-white">Exit Navigation</span>
        </button>
      )}

      {/* Map View - Leaflet (FREE) */}
      <div className={cn("absolute inset-0 z-10 bg-black transition-all", isNavigating ? "h-full" : "h-full")}>
        <MapContainer 
          center={currentPos} 
          zoom={15} 
          scrollWheelZoom={true}
          zoomControl={false}
          className="h-full w-full"
        >
          <TileLayer
            attribution={mapMode === 'dark' ? '&copy; CARTO' : '&copy; Esri'}
            url={mapMode === 'dark' 
              ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
            }
          />
          <MapController 
            center={location ? [location.lat, location.lng] : null} 
            route={route}
            isNavigating={isNavigating}
          />
          
          {location && (
            <Marker position={[location.lat, location.lng]}>
              <Popup>You are here</Popup>
            </Marker>
          )}

            {visibleHazards.map((hazard) => {
              // Robust coordinate extraction
              const lat = hazard.location?.latitude ?? (hazard.location as any)?.lat;
              const lng = hazard.location?.longitude ?? (hazard.location as any)?.lng;
              
              if (lat === undefined || lng === undefined) return null;

              return (
                <Marker
                  key={hazard.id}
                  position={[lat, lng]}
                  icon={hazard.type === 'construction' ? constructionIcon : potholeIcon}
                  zIndexOffset={1000}
                >
                  <Popup closeButton={false}>
                    <div className="p-0 overflow-hidden">
                      <div className="px-5 py-4 bg-black/40 border-b border-white/10 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center border",
                            hazard.type === 'construction' ? "bg-yellow-500/20 border-yellow-500/30" : "bg-red-500/20 border-red-500/30"
                          )}>
                            {hazard.type === 'construction' ? <HardHat className="text-yellow-500" size={20} /> : <AlertTriangle className="text-red-500" size={20} />}
                          </div>
                          <div>
                            <p className="mono-label text-white/40 mb-0.5 leading-none">Hazard Detected</p>
                            <p className="text-lg font-black text-white italic uppercase tracking-tighter leading-none">{hazard.type}</p>
                          </div>
                        </div>
                        <div className="h-10 w-[1px] bg-white/10" />
                        <div className="text-right">
                          <p className="mono-label text-white/40 mb-0.5 leading-none">Confidence</p>
                          <p className="text-[10px] font-black text-blue-400">92.4%</p>
                        </div>
                      </div>

                      <div className="p-5 space-y-4">
                        <div className="flex items-center justify-between">
                           <span className={cn(
                            "px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-[0.1em] border",
                            hazard.source === 'osm' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                            hazard.source === 'geosadak' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                            "bg-green-500/10 text-green-400 border-green-500/20"
                          )}>
                             {hazard.source === 'osm' ? 'OSM DATASET 04A' : 
                              hazard.source === 'geosadak' ? 'GEOSADAK VERIFIED' :
                              'LIVE FEED'}
                           </span>
                           <span className="mono-label text-white/30 italic">TR-ID: {hazard.id.slice(0, 8)}</span>
                        </div>

                        <div className="p-3 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                           <div className="flex justify-between items-center">
                              <span className="mono-label text-white/40">Timestamp</span>
                              <span className="mono-label text-white/70">{hazard.timestamp?.toDate ? hazard.timestamp.toDate().toLocaleTimeString() : 'ACTIVE_LIVE'}</span>
                           </div>
                           <div className="flex justify-between items-center">
                              <span className="mono-label text-white/40">Status</span>
                              <span className="mono-label text-green-400 flex items-center gap-1">
                                <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
                                Monitoring
                              </span>
                           </div>
                        </div>

                        <button 
                          onClick={() => handleCommunityVote(hazard)}
                          disabled={isVoting === hazard.id}
                          className={cn(
                            "w-full py-3 rounded-xl font-black uppercase tracking-widest text-[10px] italic active:scale-95 transition-all flex items-center justify-center gap-2",
                            hazard.votedToDeleteBy?.includes(user?.uid) 
                              ? "bg-green-600/20 text-green-500 border border-green-500/30" 
                              : "bg-white text-black hover:bg-white/90"
                          )}
                        >
                          {isVoting === hazard.id ? (
                            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                          ) : hazard.votedToDeleteBy?.includes(user?.uid) ? (
                            <>
                              <CheckCircle size={14} />
                              Vote Registered ({hazard.deleteVotes || 0}/5)
                            </>
                          ) : (
                            <>
                              <Shield size={14} />
                              Mark as Fixed ({hazard.deleteVotes || 0}/5)
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {isNavigating && allRoutes.length > 0 && (
            <>
              {/* Render alternative routes first (bottom layers) */}
              {allRoutes.map((r, idx) => idx !== selectedRouteIndex && (
                <Polyline 
                  key={`alt-${idx}`}
                  positions={r.coords} 
                  color="#94a3b8" 
                  weight={7} 
                  opacity={0.7} 
                  lineCap="round"
                  eventHandlers={{
                    click: () => {
                      setSelectedRouteIndex(idx);
                      setRoute(r.coords);
                    }
                  }}
                />
              ))}
              {/* Highlighted selected route (top layer) */}
              <Polyline 
                positions={allRoutes[selectedRouteIndex].coords} 
                color="#3b82f6" 
                weight={10} 
                opacity={1} 
                lineCap="round"
              />
            </>
          )}

        </MapContainer>
      </div>

      {/* Floating Notifications / Alerts */}
      <AnimatePresence mode="wait">
        {activeCriticalHazards.length > 0 && location && (
          <motion.div 
            key={activeCriticalHazards[0].id}
            initial={{ y: -120, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -120, opacity: 0, scale: 0.95 }}
            className="absolute top-24 left-0 right-0 z-[800] flex justify-center px-6"
          >
            {(() => {
              const alertHazard = activeCriticalHazards[0];
              const hLat = alertHazard.location?.latitude ?? (alertHazard.location as any)?.lat;
              const hLng = alertHazard.location?.longitude ?? (alertHazard.location as any)?.lng;
              const distMeters = Math.round(distanceBetween([hLat, hLng], [location.lat, location.lng]) * 1000);
              
              return (
                <div className={cn(
                  "shadow-[0_48px_100px_-20px_rgba(0,0,0,0.6)] rounded-[40px] p-[3px] max-w-sm w-full relative",
                  alertHazard.type === 'pothole' ? "bg-red-600 shadow-red-900/60" : "bg-yellow-500 shadow-yellow-900/60"
                )}>
                   {/* Cut Mark / Dismiss Button */}
                   <button 
                     onClick={() => setDismissedHazards(prev => new Set([...prev, alertHazard.id]))}
                     className="absolute -top-2 -right-2 w-10 h-10 bg-black rounded-full border-2 border-white/20 flex items-center justify-center text-white z-[810] shadow-2xl active:scale-90 transition-all cursor-pointer pointer-events-auto"
                   >
                     <X size={18} />
                   </button>

                   <div className="bg-black/10 backdrop-blur-3xl rounded-[38px] p-6 flex items-center gap-6 border border-white/20">
                      <div className="relative w-16 h-16 shrink-0 bg-white/10 rounded-3xl flex items-center justify-center border border-white/20">
                        {alertHazard.type === 'pothole' ? (
                          <AlertTriangle size={32} className="text-white animate-pulse" />
                        ) : (
                          <HardHat size={32} className="text-white animate-pulse" />
                        )}
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-white rounded-full flex items-center justify-center">
                           <div className={cn(
                             "w-1.5 h-1.5 rounded-full animate-ping",
                             alertHazard.type === 'pothole' ? "bg-red-600" : "bg-yellow-500"
                           )} />
                        </div>
                      </div>
                      
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-center">
                           <span className="mono-label text-white/60">Proximity Warning</span>
                           <span className="mono-label text-white/60 font-bold">{distMeters}m</span>
                        </div>
                        <h3 className="text-2xl font-black text-white italic uppercase tracking-tighter leading-tight">
                          {alertHazard.type}
                        </h3>
                        <p className="text-[10px] text-white/70 font-bold uppercase tracking-widest leading-none">
                          {alertHazard.type === 'pothole' ? 'Immediate Action Required: Go Slow' : 'Safety Caution: Active Personnel Ahead'}
                        </p>
                      </div>
                   </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Immersive Travel Mode UI */}
      <AnimatePresence>
        {isNavigating && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="absolute bottom-10 left-6 right-6 z-[60] pointer-events-none"
          >
            <div className="bg-black backdrop-blur-2xl border border-white/20 p-6 rounded-[40px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.9)] flex items-center justify-between pointer-events-auto overflow-hidden relative">
              <motion.div 
                animate={{ x: [-100, 400] }}
                transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                className="absolute top-0 left-0 w-40 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent opacity-50"
              />
              
              <div className="flex items-center gap-6">
                <div className="bg-blue-600/20 p-4 rounded-3xl border border-blue-500/30">
                  <Navigation size={32} className="text-blue-400 animate-pulse" />
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Route {selectedRouteIndex + 1}</div>
                    {allRoutes[selectedRouteIndex]?.hazardCount === 0 ? (
                      <span className="bg-green-500/20 text-green-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-green-500/30 uppercase">Safest</span>
                    ) : (
                      <span className="bg-yellow-500/20 text-yellow-400 text-[8px] font-bold px-1.5 py-0.5 rounded border border-yellow-500/30 uppercase">{allRoutes[selectedRouteIndex]?.hazardCount} Hazards</span>
                    )}
                    <span className="text-white/40 text-[10px] font-black uppercase tracking-[0.1em]">• {(allRoutes[selectedRouteIndex]?.distance / 1000).toFixed(1)} km</span>
                  </div>
                  <div className="text-white font-black text-2xl tracking-tight max-w-[150px] truncate italic uppercase">
                    {destinationInput || "Your Path"}
                  </div>
                </div>
              </div>

               <button 
                onClick={() => {
                  setIsNavigating(false);
                  setRoute([]);
                  setDestinationInput('');
                }}
                className="bg-red-600 hover:bg-red-700 text-white w-20 h-20 rounded-[30px] flex flex-col items-center justify-center shadow-xl active:scale-90 transition-all group border border-white/10"
               >
                 <X size={24} className="group-hover:rotate-90 transition-transform duration-300" />
                 <span className="text-[10px] font-black uppercase tracking-widest mt-1">Stop</span>
               </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Actions */}
      <div className={cn(
        "absolute bottom-16 inset-x-6 z-[500] flex flex-col gap-6 transition-all duration-700",
        isNavigating ? "translate-y-40 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
      )}>
        
        {/* Main Controls - Row of Actions */}
        <div className="flex justify-between items-end gap-4">
          
          {/* Report Button */}
          {!isNavigating && (
            <button 
              onClick={() => setShowDetection(true)}
              className="w-16 h-16 bg-blue-600 text-white rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-1 hover:bg-blue-700 transition-all active:scale-90"
            >
              <Camera size={24} />
              <span className="text-[10px] font-bold uppercase tracking-tight">Report</span>
            </button>
          )}

          {/* Share Button (When trip active) */}
          {isNavigating && (
             <button 
               onClick={() => {
                 const url = window.location.href;
                 navigator.clipboard.writeText(url);
                 alert("Trip link copied! You can now share this unique route.");
               }}
               className="h-16 px-6 bg-white/10 text-white rounded-2xl border border-white/20 flex flex-col items-center justify-center gap-1 backdrop-blur hover:bg-white/20 transition-all active:scale-95"
             >
               <MapPin size={24} className="text-blue-400" />
               <span className="text-[10px] font-black uppercase tracking-widest">Share Path</span>
             </button>
          )}

          {/* Go Button */}
          <button 
            onClick={() => {
              if (isNavigating) {
                setIsNavigating(false);
                setRoute([]); // Explicitly clear the blue path
                setDestinationInput(''); // Clear input for next trip
              } else {
                setShowGoModal(true);
              }
            }}
            disabled={isSearching}
            className={cn(
              "flex-1 h-20 rounded-3xl shadow-2xl flex items-center justify-center gap-4 transition-all active:scale-95 group relative overflow-hidden border border-white/20",
              isNavigating 
                ? "bg-red-600 text-white" 
                : "bg-black text-white"
            )}
          >
            {isSearching && <motion.div className="absolute inset-0 bg-blue-500/20 animate-pulse" />}
            <div className={cn(
              "w-12 h-12 rounded-2xl flex items-center justify-center transition-colors shadow-lg",
              isNavigating ? "bg-white/20" : "bg-blue-600"
            )}>
              {isNavigating ? <X size={24} className="text-white" /> : <Search size={24} className="text-white" />}
            </div>
            <div className="text-left">
              <div className={cn("text-xs font-bold uppercase tracking-widest", isNavigating ? "text-white/70" : "text-gray-500")}>
                {isNavigating ? "End Navigation" : "Ready to Travel?"}
              </div>
              <div className="text-xl font-black tracking-tight leading-4">
                {isNavigating ? "STOP TRIP" : "GO NOW"}
              </div>
            </div>
          </button>

          {/* History Button */}
          {!isNavigating && (
            <button 
              className="w-16 h-16 bg-black text-white rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-1 hover:bg-gray-900 transition-all active:scale-90 border border-white/20"
            >
              <Bell size={24} />
              <span className="text-[10px] font-bold uppercase tracking-tight">Alerts</span>
            </button>
          )}
        </div>
      </div>

      {/* AI Detection Overlay */}
      <AnimatePresence>
        {showDetection && location && (
          <DetectionService 
            location={location} 
            onClose={() => setShowDetection(false)} 
          />
        )}
      </AnimatePresence>

      {/* Go (Destination) Modal */}
      <AnimatePresence>
        {showGoModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[999] bg-black/95 backdrop-blur-2xl"
          >
            <button 
              className="absolute inset-0 cursor-default" 
              onClick={() => setShowGoModal(false)} 
            />
            
            <div className="absolute inset-0 overflow-y-auto pt-6 px-4 flex flex-col items-center">
              <motion.div 
                initial={{ y: -100, opacity: 0, scale: 0.95 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -100, opacity: 0, scale: 0.95 }}
                className="relative w-full max-w-sm bg-black rounded-[42px] border border-white/20 shadow-[0_100px_200px_-50px_rgba(0,0,0,1)] flex flex-col overflow-hidden mb-20"
              >
                <div className="p-8 pb-4 flex items-center justify-between shrink-0">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black tracking-tight text-white italic uppercase leading-tight">Plan Trip</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">Smart Route Sync</p>
                  </div>
                  <button 
                    onClick={() => setShowGoModal(false)} 
                    className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-full flex items-center justify-center text-white transition-all active:scale-90 border border-white/10"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-8 pt-2 space-y-6 overflow-y-auto scrollbar-hide">
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white group-focus-within:text-blue-500 transition-all">
                      {isFetchingSuggestions ? (
                        <motion.div 
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        >
                          <Shield size={20} className="text-blue-400" />
                        </motion.div>
                      ) : (
                        <Search size={20} />
                      )}
                    </div>
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="Where are you heading?"
                      value={destinationInput}
                      onChange={(e) => setDestinationInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGo(destinationInput)}
                      className="w-full h-16 pl-14 pr-6 bg-white/5 rounded-[28px] border border-white/20 focus:ring-1 focus:ring-white/20 shadow-inner transition-all outline-none text-white font-bold text-lg placeholder:text-white/20 placeholder:font-medium" 
                    />

                    {/* Suggestions Dropdown */}
                    <AnimatePresence>
                      {suggestions.length > 0 && (
                        <motion.div 
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          className="absolute left-0 right-0 top-full mt-2 bg-black border border-white/20 rounded-3xl overflow-hidden z-[1000] shadow-2xl"
                        >
                          <div className="max-h-60 overflow-y-auto scrollbar-hide">
                            {suggestions.map((s, idx) => (
                              <button
                                key={idx}
                                onClick={() => {
                                  setDestinationInput(s.display_name);
                                  setSuggestions([]);
                                  handleGo(s.display_name);
                                }}
                                className="w-full px-6 py-4 text-left hover:bg-white/10 transition-colors border-b border-white/5 flex items-start gap-3"
                              >
                                <MapPin size={18} className="text-blue-500 shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                  <div className="text-sm font-bold text-white truncate">{s.display_name.split(',')[0]}</div>
                                  <div className="text-[10px] text-white/40 leading-tight line-clamp-2">{s.display_name}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <button 
                    onClick={() => handleGo(destinationInput)}
                    disabled={!destinationInput || isSearching}
                    className="w-full h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[28px] shadow-lg shadow-blue-500/30 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:grayscale group"
                  >
                    <span className="font-black text-lg uppercase tracking-widest italic">{isSearching ? 'FINDING...' : 'START TRIP'}</span>
                    <Navigation size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  </button>
                </div>

                {/* Bottom Accents */}
                <div className="bg-black p-4 px-8 border-t border-white/20 flex justify-between items-center group cursor-pointer hover:bg-white/5 transition-colors shrink-0">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">Home Base</span>
                      <span className="text-[11px] font-bold text-white">Set current location</span>
                   </div>
                   <MapPin size={18} className="text-white/30" />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isNavigating && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-black z-[60] border-b border-white/10">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: '40%' }}
            className="h-full bg-blue-500 shadow-[0_0_15px_#3b82f6]"
          />
        </div>
      )}

      {/* Bottom Gradients */}
      <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-black/40 to-transparent pointer-events-none z-20" />

      {/* Initial Startup Loading Screen */}
      <AnimatePresence>
        {isAppLoading && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.8, ease: "easeOut" } }}
            className="fixed inset-0 z-[20000] bg-black flex flex-col items-center justify-center p-6 text-center"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5 }}
              className="space-y-12 max-w-sm"
            >
              <div className="relative mx-auto">
                <motion.div
                  animate={{ 
                    scale: [1, 1.2, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{ repeat: Infinity, duration: 3 }}
                  className="w-24 h-24 bg-blue-600 rounded-[32px] flex items-center justify-center shadow-2xl shadow-blue-500/20 mx-auto"
                >
                  <Shield size={48} className="text-white" />
                </motion.div>
                <div className="absolute -inset-4 bg-blue-500/10 rounded-full blur-2xl animate-pulse" />
              </div>

              <div className="space-y-4">
                <h1 className="text-5xl font-black italic uppercase tracking-tighter text-white">Road Sense</h1>
                <div className="flex items-center justify-center gap-3">
                  <div className="h-[1px] w-8 bg-white/20" />
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">AI Safety Intelligence</p>
                  <div className="h-[1px] w-8 bg-white/20" />
                </div>
              </div>

              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="bg-white/5 border border-white/10 rounded-3xl p-6 backdrop-blur-md"
              >
                <div className="flex gap-4 items-center">
                  <div className="w-10 h-10 bg-red-600/20 rounded-xl flex items-center justify-center border border-red-500/30">
                    <MapPin size={20} className="text-red-500 animate-bounce" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-[10px] font-black uppercase text-red-500 tracking-widest">Protocol Required</p>
                    <p className="text-[11px] font-bold text-white/70 leading-snug">Please ensure GPS/Location is ON for real-time hazard detection.</p>
                  </div>
                </div>
              </motion.div>

              <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: "100%" }}
                  transition={{ duration: 3 }}
                  className="h-full bg-blue-500"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Path Thinking Overlay */}
      <AnimatePresence>
        {isSearching && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-3xl flex flex-col items-center justify-center text-white"
          >
            <div className="relative">
              <motion.div
                animate={{ 
                  scale: [1, 1.1, 1],
                  opacity: [0.5, 1, 0.5]
                }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-32 h-32 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30"
              >
                <Shield size={64} className="text-blue-500" />
              </motion.div>
              
              {/* Radar Pings */}
              <motion.div 
                animate={{ scale: [1, 2], opacity: [0.8, 0] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 border-2 border-blue-500 rounded-full"
              />
              <motion.div 
                animate={{ scale: [1, 2], opacity: [0.8, 0] }}
                transition={{ repeat: Infinity, duration: 2, delay: 0.5 }}
                className="absolute inset-0 border-2 border-blue-500 rounded-full"
              />
            </div>

            <div className="mt-12 text-center space-y-4">
              <motion.div 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="font-black text-4xl tracking-tighter italic uppercase"
              >
                Thinking for the path...
              </motion.div>
              <div className="flex flex-col items-center">
                <div className="text-blue-400 font-black text-xs uppercase tracking-[0.4em] animate-pulse">
                  Querying Hazard Intel
                </div>
                <div className="mt-4 flex gap-1">
                  {[0, 1, 2].map(i => (
                    <motion.div
                      key={i}
                      animate={{ height: [8, 24, 8] }}
                      transition={{ repeat: Infinity, duration: 0.6, delay: i * 0.1 }}
                      className="w-1 bg-blue-500 rounded-full"
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Micro scan lines */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
              <motion.div
                animate={{ y: ['-100%', '100%'] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                className="h-20 w-full bg-gradient-to-b from-transparent via-blue-500 to-transparent"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function NavIcon({ active, icon, label, onClick }: { active: boolean, icon: React.ReactNode, label: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-all",
        active ? "text-blue-600 scale-110" : "text-gray-400 hover:text-gray-600"
      )}
    >
      {icon}
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );
}
