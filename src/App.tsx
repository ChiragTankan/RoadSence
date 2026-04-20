/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, Bell, Map as MapIcon, Shield, Search, AlertOctagon, User, LogIn, Camera, X, AlertTriangle, HardHat, Info, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useLocation as useRouterLocation, useSearchParams } from 'react-router-dom';
import { auth, signInWithGoogle, db } from './lib/firebase';
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
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
         </div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12]
});

const constructionIcon = L.divIcon({
  html: `<div class="hazard-marker-construction">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="2" rx="1"/><path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"/><path d="M8 11v-4"/><path d="M16 11v-4"/><path d="m12 11 4 4"/><path d="m12 11-4 4"/></svg>
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
    if (criticalHazards.length > 0) {
      triggerNotification(criticalHazards[0].type);
    }
  }, [criticalHazards.length]);

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
        const routeRes = await fetch(`https://router.project-osrm.org/route/v1/driving/${location.lng},${location.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson`);
        const routeData = await routeRes.json();

        if (routeData.routes && routeData.routes[0]) {
          const coords = routeData.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
          setRoute(coords);
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
            <h1 className="text-4xl font-bold tracking-tight">RoadSence</h1>
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
      
      {/* Top Controls - Simplified */}
      {!isNavigating && (
        <header className="absolute top-6 inset-x-6 z-[600] flex justify-between items-center pointer-events-none">
          <div className="h-14 w-auto px-5 bg-black backdrop-blur-3xl shadow-lg rounded-[24px] flex items-center gap-3 pointer-events-auto border border-white/20">
            <Shield size={28} className="text-blue-500" />
            <span className="font-black text-xl text-white tracking-tighter italic uppercase">RoadSence</span>
          </div>
          
          <div className="relative flex items-center pointer-events-auto">
            <button 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className={cn(
                "h-14 w-14 bg-black backdrop-blur-3xl shadow-lg rounded-[24px] flex items-center justify-center transition-all border border-white/20 overflow-hidden group",
                showProfileMenu ? "bg-white/10 ring-2 ring-blue-500/50" : "hover:bg-gray-900"
              )}
            >
              <User size={28} className={cn("text-white transition-transform duration-300", showProfileMenu ? "scale-90" : "group-hover:scale-110")} />
            </button>

            {/* Profile Dropdown */}
            <AnimatePresence>
              {showProfileMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-16 right-0 w-56 bg-black/95 backdrop-blur-3xl border border-white/20 rounded-[28px] shadow-2xl overflow-hidden py-2"
                >
                  <div className="px-4 py-3 border-b border-white/10 mb-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 leading-none">Logged In as</p>
                    <p className="text-sm font-bold text-white truncate mt-1">{user?.displayName || 'User'}</p>
                  </div>
                  
                  <div className="flex flex-col">
                    <button 
                      onClick={() => auth.signOut()}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-red-600/10 text-left transition-colors"
                    >
                      <div className="w-8 h-8 rounded-xl bg-red-600/20 flex items-center justify-center border border-red-500/30">
                        <LogIn size={16} className="text-red-400 -rotate-180" />
                      </div>
                      <span className="text-[11px] font-black uppercase tracking-widest text-red-400">Sign Out</span>
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>
      )}

      {/* Community Stats Badge */}
      {!isNavigating && hazards.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-24 left-0 right-0 z-[550] pointer-events-none flex justify-center px-4"
        >
          <div className="bg-black backdrop-blur-3xl shadow-2xl border border-white/20 rounded-[28px] px-6 py-4 flex items-center gap-4 pointer-events-auto">
             <div className="flex -space-x-2">
                {[1,2,3].map(i => (
                   <div key={i} className="w-6 h-6 rounded-full bg-blue-900/40 border border-white/20 flex items-center justify-center overflow-hidden">
                      <User size={12} className="text-blue-400" />
                   </div>
                ))}
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider leading-none">Global Coverage</span>
                <span className="text-xs font-bold text-white/70">{hazards.length} potholes synced</span>
             </div>
          </div>
        </motion.div>
      )}

      {/* Map Legend - Responsive and Polished */}
      {!isNavigating && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-50 flex flex-col items-end gap-3 pointer-events-none group/legend">
          {/* Mobile Toggle Button */}
          <button 
            onClick={() => setShowLegend(!showLegend)}
            className="md:hidden w-10 h-10 bg-black backdrop-blur-3xl shadow-2xl rounded-xl flex items-center justify-center pointer-events-auto border border-white/20 active:scale-95 transition-all text-white"
          >
            <Info size={18} className={cn("text-blue-500 transition-transform duration-500", showLegend ? "rotate-90" : "")} />
          </button>

          {/* Legend Box */}
          <motion.div 
            initial={false}
            animate={{ 
              x: (showLegend || (typeof window !== 'undefined' && window.innerWidth >= 768)) ? 0 : 40,
              opacity: (showLegend || (typeof window !== 'undefined' && window.innerWidth >= 768)) ? 1 : 0,
              scale: (showLegend || (typeof window !== 'undefined' && window.innerWidth >= 768)) ? 1 : 0.9
            }}
            className={cn(
              "bg-black backdrop-blur-3xl p-3 rounded-[24px] border border-white/20",
              "shadow-[0_20px_50px_-12px_rgba(0,0,0,1)]",
              "flex flex-col gap-3 pointer-events-auto transition-all duration-300",
              "w-28 md:w-32 lg:w-32",
              showLegend ? "flex" : "hidden md:flex"
            )}
          >
            <div className="flex items-center gap-2 border-b border-white/10 pb-2">
               <div className="w-5 h-5 rounded-md bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                 <MapIcon size={10} className="text-white" />
               </div>
               <span className="text-[7px] font-black uppercase tracking-[0.2em] text-gray-500 italic leading-none">Legend</span>
            </div>
            
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 group/item">
                <div className="relative">
                  <div className="w-8 h-8 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover/item:scale-110 transition-transform duration-300">
                    <AlertTriangle size={14} className="text-white" />
                  </div>
                  <div className="absolute inset-0 rounded-full bg-red-500 animate-ping opacity-20 pointer-events-none" />
                </div>
                <div className="flex flex-col items-start">
                  <span className="text-[8px] font-black uppercase italic leading-none text-white">Pothole</span>
                  <span className="text-[6px] font-bold text-gray-500 mt-0.5">Alert</span>
                </div>
              </div>

              <div className="flex items-center gap-2 group/item">
                <div className="w-8 h-8 rounded-lg bg-yellow-500 flex items-center justify-center shadow-lg group-hover/item:scale-110 transition-transform duration-300">
                  <HardHat size={14} className="text-black" />
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="text-[8px] font-black uppercase italic leading-none text-white">Work</span>
                  <span className="text-[6px] font-bold text-gray-500 mt-0.5">Caution</span>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-10">
                <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                  <Navigation size={14} className="text-white/40" />
                </div>
                <div className="flex flex-col items-start opacity-70">
                  <span className="text-[8px] font-black uppercase italic leading-none text-white/40">Path</span>
                </div>
              </div>
            </div>

            {/* Micro Detail */}
            <div className="mt-1 flex justify-center">
               <div className="w-6 h-1 rounded-full bg-white/10" />
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
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
                  <Popup className="dark-popup">
                    <div className="p-3 text-center bg-black/95 text-white rounded-xl border border-white/20 min-w-[140px]">
                      {hazard.type === 'construction' ? <HardHat className="mx-auto text-yellow-500 mb-2" size={28} /> : <AlertTriangle className="mx-auto text-red-500 mb-2" size={28} />}
                      <p className="font-black text-white uppercase italic leading-tight text-lg">{hazard.type}</p>
                      
                      <div className="mt-2 flex flex-col gap-1 items-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border",
                          hazard.source === 'osm' ? "bg-blue-500/20 text-blue-400 border-blue-500/30" :
                          hazard.source === 'geosadak' ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                          hazard.source === 'rdd2022' ? "bg-purple-500/20 text-purple-400 border-purple-500/30" :
                          hazard.source === 'static' ? "bg-gray-500/20 text-gray-400 border-gray-500/30" :
                          "bg-green-500/20 text-green-400 border-green-500/30"
                        )}>
                          {hazard.source === 'osm' ? 'OSM Intel' : 
                           hazard.source === 'geosadak' ? 'GeoSadak Verified' :
                           hazard.source === 'rdd2022' ? 'RDD2022 AI Verified' :
                           hazard.source === 'static' ? 'System Verified' : 
                           'Community Live'}
                        </span>
                        
                        <p className="text-[9px] text-white/40 font-bold">
                          {hazard.timestamp?.toDate ? `Sighted: ${hazard.timestamp.toDate().toLocaleTimeString()}` : 'Live Status'}
                        </p>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

          {route.length > 0 && (
            <Polyline positions={route} color="#3b82f6" weight={8} opacity={0.8} lineCap="round" />
          ) }

          {location && criticalHazards.length > 0 && (
             <Circle 
               center={currentPos} 
               pathOptions={{ fillColor: 'red', color: 'red', weight: 1, fillOpacity: 0.2 }} 
               radius={200} 
             />
          )}
        </MapContainer>
      </div>

      {/* Floating Notifications / Alerts */}
      <AnimatePresence>
        {criticalHazards.length > 0 && location && (
          <motion.div 
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="absolute top-16 left-0 right-0 z-[800] pointer-events-none flex justify-center px-6"
          >
            <div className="bg-red-600 text-white p-6 rounded-[32px] shadow-[0_40px_80px_-15px_rgba(220,38,38,0.5)] flex items-center gap-6 border-4 border-white/30 backdrop-blur-xl max-w-sm w-full pointer-events-auto ring-1 ring-black/20">
            <div className="bg-black/40 rounded-2xl p-3 shadow-inner border border-white/10">
                <AlertOctagon size={32} className="text-white animate-bounce" />
              </div>
              <div className="flex-1">
                <div className="font-black text-xl leading-tight uppercase tracking-tight italic">
                  CAUTION!
                </div>
                <div className="text-sm font-medium opacity-90">
                  A <span className="underline decoration-white/40">{criticalHazards[0].type}</span> is spotted in next 500m.
                </div>
                <div className="font-bold text-[10px] bg-black/20 mt-1 py-1 px-2 rounded-lg inline-block uppercase tracking-wider">
                  Go slow, be safe.
                </div>
              </div>
            </div>
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
                    <div className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Navigating to</div>
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

      {/* Full Screen Location Blocker */}
      <AnimatePresence>
        {locError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-3xl flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-md w-full bg-black border border-white/20 rounded-[40px] p-8 text-center shadow-2xl space-y-8"
            >
              <div className="relative mx-auto w-24 h-24">
                <div className="absolute inset-0 bg-red-500/20 rounded-full animate-ping" />
                <div className="relative w-full h-full bg-red-600/20 rounded-[32px] flex items-center justify-center border border-red-500/30">
                  <MapPin size={48} className="text-red-500" />
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-3xl font-black italic uppercase tracking-tighter text-white">Location Access Required</h2>
                <p className="text-gray-400 text-sm leading-relaxed">
                  RoadSence is an active safety engine. We cannot scan for potholes or provide proximity alerts without your real-time GPS coordinates.
                </p>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-left space-y-4">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 shrink-0 bg-blue-500/20 rounded-xl flex items-center justify-center border border-blue-500/30">
                    <Info size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase text-blue-400 tracking-widest">Protocol</p>
                    <p className="text-xs text-white/70 font-bold mt-1">Enable location permissions in your browser or device settings to start your journey.</p>
                  </div>
                </div>
              </div>

              <button 
                onClick={() => window.location.reload()}
                className="w-full h-16 bg-white text-black rounded-[28px] font-black uppercase italic tracking-widest hover:bg-gray-200 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Navigation size={20} />
                Refresh Engine
              </button>

              <p className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] italic">Intelligence System Status: Offline</p>
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
