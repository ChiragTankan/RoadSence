/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Navigation, Bell, Map as MapIcon, Shield, Search, AlertOctagon, User, LogIn, Camera, X, AlertTriangle, HardHat, Info, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
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
  html: `<div class="bg-red-600 rounded-full w-9 h-9 flex items-center justify-center border-2 border-white shadow-2xl animate-pulse">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
         </div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
});

const constructionIcon = L.divIcon({
  html: `<div class="bg-yellow-500 rounded-xl w-9 h-9 flex items-center justify-center border-2 border-white shadow-2xl">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="2" rx="1"/><path d="M5 11V7a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4"/><path d="M8 11v-4"/><path d="M16 11v-4"/><path d="m12 11 4 4"/><path d="m12 11-4 4"/></svg>
         </div>`,
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18]
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
  const [user, setUser] = useState(auth.currentUser);
  const { location, error: locError } = useLocation();
  const { hazards, criticalHazards } = useHazards(location, user);
  const [activeTab, setActiveTab] = useState<'map' | 'reports'>('map');
  const [searchQuery, setSearchQuery] = useState('');
  const [route, setRoute] = useState<[number, number][]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDetection, setShowDetection] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showGoModal, setShowGoModal] = useState(false);
  const [destinationInput, setDestinationInput] = useState('');

  const [showLegend, setShowLegend] = useState(false);

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
        body: `Caution: ${hazardType} detected within 200m.`,
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

  const handleGo = async (destName: string) => {
    if (!destName || !location) return;

    setIsSearching(true);
    setShowGoModal(false);
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
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white font-sans">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-8 max-w-md"
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
            className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold py-4 px-6 rounded-2xl hover:bg-gray-100 transition-all active:scale-95"
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
    <div className="relative h-screen w-full bg-black overflow-hidden font-sans">
      
      {/* Top Controls - Simplified */}
      {!isNavigating && (
        <header className="absolute top-4 inset-x-4 z-50 flex justify-between items-center pointer-events-none">
          <div className="h-12 w-auto px-4 bg-white/95 backdrop-blur shadow-lg rounded-2xl flex items-center gap-3 pointer-events-auto border border-blue-100">
            <Shield size={24} className="text-blue-600" />
            <span className="font-bold text-gray-800 tracking-tight">RoadSence</span>
          </div>
          <button className="h-12 w-12 bg-white/95 backdrop-blur shadow-lg rounded-2xl flex items-center justify-center pointer-events-auto hover:bg-gray-50 transition-all">
            <User size={24} className="text-gray-700" />
          </button>
        </header>
      )}

      {/* Community Stats Badge */}
      {!isNavigating && hazards.length > 0 && (
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute top-20 left-4 z-50 pointer-events-none"
        >
          <div className="bg-white/90 backdrop-blur shadow-xl border border-blue-100 rounded-full px-4 py-2 flex items-center gap-3">
             <div className="flex -space-x-2">
                {[1,2,3].map(i => (
                   <div key={i} className="w-6 h-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center overflow-hidden">
                      <User size={12} className="text-blue-600" />
                   </div>
                ))}
             </div>
             <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase text-blue-600 tracking-wider leading-none">Global Coverage</span>
                <span className="text-xs font-bold text-gray-700">{hazards.length} potholes synced</span>
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
            className="md:hidden w-10 h-10 bg-white/95 backdrop-blur-3xl shadow-[0_15px_35px_-5px_rgba(59,130,246,0.2)] rounded-xl flex items-center justify-center pointer-events-auto border border-white active:scale-95 transition-all"
          >
            <Info size={18} className={cn("text-blue-600 transition-transform duration-500", showLegend ? "rotate-90" : "")} />
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
              "bg-white/90 backdrop-blur-3xl p-3 rounded-[24px] border border-white/60",
              "shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15),0_0_0_1px_rgba(255,255,255,0.8)_inset,0_0_20px_rgba(59,130,246,0.1)]",
              "flex flex-col gap-3 pointer-events-auto transition-all duration-300",
              "w-28 md:w-32 lg:w-32",
              showLegend ? "flex" : "hidden md:flex"
            )}
          >
            <div className="flex items-center gap-2 border-b border-gray-100 pb-2">
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
                  <span className="text-[8px] font-black uppercase italic leading-none text-gray-900">Pothole</span>
                  <span className="text-[6px] font-bold text-gray-400 mt-0.5">Alert</span>
                </div>
              </div>

              <div className="flex items-center gap-2 group/item">
                <div className="w-8 h-8 rounded-lg bg-yellow-500 flex items-center justify-center shadow-lg group-hover/item:scale-110 transition-transform duration-300">
                  <HardHat size={14} className="text-black" />
                </div>
                <div className="flex flex-col items-start text-left">
                  <span className="text-[8px] font-black uppercase italic leading-none text-gray-900">Work</span>
                  <span className="text-[6px] font-bold text-gray-400 mt-0.5">Caution</span>
                </div>
              </div>

              <div className="flex items-center gap-2 opacity-25">
                <div className="w-8 h-8 rounded-lg bg-gray-100 border border-gray-200 flex items-center justify-center">
                  <Navigation size={14} className="text-gray-400" />
                </div>
                <div className="flex flex-col items-start opacity-70">
                  <span className="text-[8px] font-black uppercase italic leading-none text-gray-400">Path</span>
                </div>
              </div>
            </div>

            {/* Micro Detail */}
            <div className="mt-1 flex justify-center">
               <div className="w-6 h-1 rounded-full bg-gray-100" />
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
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
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

            {hazards.map((hazard) => (
              <Marker
                key={hazard.id}
                position={[hazard.location.latitude, hazard.location.longitude]}
                icon={hazard.type === 'construction' ? constructionIcon : potholeIcon}
                zIndexOffset={1000}
              >
                <Popup className="dark-popup">
                  <div className="p-2 text-center bg-black/95 text-white rounded-lg">
                    {hazard.type === 'construction' ? <HardHat className="mx-auto text-yellow-500 mb-1" size={24} /> : <AlertTriangle className="mx-auto text-red-500 mb-1" size={24} />}
                    <p className="font-black text-white uppercase italic leading-tight">{hazard.type}</p>
                    <p className="text-[10px] text-white/50 font-bold mt-1">Sighted: {hazard.timestamp?.toDate().toLocaleTimeString()}</p>
                  </div>
                </Popup>
              </Marker>
            ))}

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
            className="absolute top-6 right-6 left-6 z-[70]"
          >
            <div className="bg-red-600 text-white p-5 rounded-3xl shadow-2xl flex items-center gap-5 border-4 border-white/30 backdrop-blur-md">
              <div className="bg-white rounded-2xl p-3 shadow-inner">
                <AlertOctagon size={32} className="text-red-600 animate-bounce" />
              </div>
              <div className="flex-1">
                <div className="font-black text-xl leading-tight uppercase tracking-tight italic">
                  CAUTION!
                </div>
                <div className="text-sm font-medium opacity-90">
                  {criticalHazards[0].type} in next {Math.round(distanceBetween(
                    [criticalHazards[0].location.latitude, criticalHazards[0].location.longitude],
                    [location.lat, location.lng]
                  ) * 1000)} meters.
                </div>
                <div className="font-bold text-[10px] bg-black/20 mt-1 py-1 px-2 rounded-lg inline-block uppercase tracking-wider">
                  be awair, and go slow.
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
            <div className="bg-black/95 backdrop-blur-2xl border border-white/10 p-6 rounded-[40px] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] flex items-center justify-between pointer-events-auto overflow-hidden relative">
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
        "absolute bottom-8 inset-x-6 z-50 flex flex-col gap-4 transition-all duration-700",
        isNavigating ? "translate-y-24 opacity-0 pointer-events-none" : "translate-y-0 opacity-100"
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
              "flex-1 h-20 rounded-3xl shadow-2xl flex items-center justify-center gap-4 transition-all active:scale-95 group relative overflow-hidden border border-white/10",
              isNavigating 
                ? "bg-red-600 text-white" 
                : "bg-black/90 backdrop-blur-xl text-white"
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
              className="w-16 h-16 bg-black/90 backdrop-blur-xl text-white rounded-2xl shadow-2xl flex flex-col items-center justify-center gap-1 hover:bg-gray-900 transition-all active:scale-90 border border-white/10"
            >
              <Bell size={24} />
              <span className="text-[10px] font-bold uppercase tracking-tight">Alerts</span>
            </button>
          )}
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
              className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-md flex items-center justify-center p-6"
            >
              <motion.div 
                initial={{ scale: 0.9, y: 30, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 30, opacity: 0 }}
                className="bg-black/95 backdrop-blur-3xl w-full max-w-sm rounded-[42px] overflow-hidden shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8),0_0_20_rgba(59,130,246,0.1)] border border-white/20"
              >
                <div className="p-8 pb-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black tracking-tight text-white italic uppercase leading-tight">Plan Trip</h3>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-500">Smart Route Sync</p>
                  </div>
                  <button 
                    onClick={() => setShowGoModal(false)} 
                    className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-all active:scale-90"
                  >
                    <X size={20} />
                  </button>
                </div>
                
                <div className="p-8 pt-2 space-y-6">
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/50 group-focus-within:text-blue-500 transition-all">
                      <Search size={20} />
                    </div>
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="Where are you heading?"
                      value={destinationInput}
                      onChange={(e) => setDestinationInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGo(destinationInput)}
                      className="w-full h-16 pl-14 pr-6 bg-white/5 rounded-[28px] border border-white/10 focus:ring-2 focus:ring-blue-500/20 shadow-inner transition-all outline-none text-white font-bold text-lg placeholder:text-white/20 placeholder:font-medium" 
                    />
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
                <div className="bg-white/5 p-4 px-8 border-t border-white/10 flex justify-between items-center group cursor-pointer hover:bg-white/10 transition-colors">
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">Home Base</span>
                      <span className="text-[11px] font-bold text-white/70">Set current location</span>
                   </div>
                   <MapPin size={18} className="text-white/30" />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Dynamic Navigation Progress Bar */}
      {isNavigating && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-800 z-[60]">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: '40%' }}
            className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]"
          />
        </div>
      )}

      {/* Bottom Gradients */}
      <div className="absolute bottom-0 inset-x-0 h-48 bg-gradient-to-t from-black/40 to-transparent pointer-events-none z-20" />

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
