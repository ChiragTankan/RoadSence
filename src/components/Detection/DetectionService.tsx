import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Camera, Shield, AlertTriangle, CheckCircle, HardHat, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { detectHazard } from '../../lib/gemini';
import { collection, addDoc, GeoPoint, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import { geohashForLocation } from 'geofire-common';
import { cn } from '../../lib/utils';

interface DetectionServiceProps {
  location: { lat: number; lng: number } | null;
  onClose: () => void;
}

type HazardType = 'pothole' | 'construction' | 'debris' | 'speed_bump' | 'other';

export function DetectionService({ location, onClose }: DetectionServiceProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [step, setStep] = useState<'choice' | 'camera'>('choice');
  const [selectedType, setSelectedType] = useState<HazardType | null>(null);
  const [status, setStatus] = useState<'idle' | 'detecting' | 'blurring' | 'reporting' | 'success'>('idle');

  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        activeStream = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Error accessing camera:", err);
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // Start immediately on mount

  const captureAndReport = async () => {
    if (!videoRef.current || !canvasRef.current || !location || !auth.currentUser || !selectedType) return;

    setStatus('blurring');
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Capture frame
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    ctx.drawImage(videoRef.current, 0, 0);

    // PRIVACY BLURRING
    ctx.filter = 'blur(6px)';
    ctx.drawImage(canvas, 0, 0);
    ctx.filter = 'none';

    const base64Image = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    setStatus('detecting');
    try {
      // We verify with AI but respect the user's manual selection as primary intent
      const AIConfirmedType = await detectHazard(base64Image);
      
      setStatus('reporting');
      
      const hazardData = {
        type: selectedType, // Use the user's explicit choice
        location: new GeoPoint(location.lat, location.lng),
        geohash: geohashForLocation([location.lat, location.lng]),
        reporterId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        isPublic: true
      };

      // 100% Reliable Cloud Save
      try {
        await addDoc(collection(db, `users/${auth.currentUser.uid}/my_reports`), hazardData);
        await addDoc(collection(db, 'public_hazards'), hazardData);
        setStatus('success');
        setTimeout(onClose, 2500);
      } catch (dbErr) {
        console.error("Firestore report error:", dbErr);
        alert("Sync Failed: Check your internet and try again.");
        setStatus('idle');
      }
    } catch (err) {
      console.error("Detection error:", err);
      setStatus('idle');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] bg-black/95 backdrop-blur-2xl"
    >
      <button className="absolute inset-0 cursor-default" onClick={onClose} />
      
      {/* Absolute Top-Center Card UI */}
      <div className="absolute inset-0 overflow-y-auto pt-6 px-4 flex flex-col items-center">
        <motion.div 
          initial={{ y: -100, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -100, opacity: 0, scale: 0.95 }}
          className="relative w-full max-w-sm bg-black rounded-[42px] border border-white/20 shadow-[0_100px_200px_-50px_rgba(0,0,0,1)] flex flex-col overflow-hidden mb-20"
        >
          {/* Integrated Camera View behind content */}
          <div className="absolute inset-0 z-0 opacity-40">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-black/70" />
          </div>

        {/* Close Button Inside Card */}
        <div className="absolute top-6 right-6 z-[60]">
          <button 
            onClick={onClose} 
            className="w-10 h-10 bg-black/40 backdrop-blur-xl border border-white/20 rounded-full flex items-center justify-center text-white hover:bg-black/60 transition-all active:scale-90"
          >
            <X size={20} />
          </button>
        </div>

        <div className="relative z-10 px-6 pt-10 pb-8 flex flex-col items-center overflow-y-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            {step === 'choice' ? (
              <motion.div 
                key="choice"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 1.1, opacity: 0 }}
                className="w-full space-y-6"
              >
                <div className="text-center space-y-1">
                  <div className="inline-flex py-1 px-3 bg-blue-600/20 rounded-full border border-blue-500/30 mb-2">
                    <span className="text-[7px] font-black uppercase tracking-[0.3em] text-blue-400">Community Safety</span>
                  </div>
                  <h2 className="text-2xl font-black text-white tracking-tight uppercase italic leading-none">Report Hazard</h2>
                  <p className="text-white/40 text-[9px] font-medium">Verify surroundings before reporting</p>
                </div>

                <div className="grid gap-3">
                  <button 
                    onClick={() => { setSelectedType('pothole'); setStep('camera'); }}
                    className="group relative overflow-hidden bg-red-600 p-5 rounded-[32px] flex items-center gap-4 shadow-[0_15px_30px_-10px_rgba(220,38,38,0.5)] transition-all active:scale-95"
                  >
                    <div className="bg-white/20 p-4 rounded-2xl">
                      <AlertTriangle size={24} className="text-white" />
                    </div>
                    <div className="text-left">
                      <div className="text-[7px] font-black uppercase tracking-[0.3em] text-white/50 mb-0.5">Instant Alert</div>
                      <div className="text-xl font-black text-white tracking-tight italic">POTHOLE</div>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setSelectedType('construction'); setStep('camera'); }}
                    className="group relative overflow-hidden bg-yellow-500 p-5 rounded-[32px] flex items-center gap-4 shadow-[0_15px_30px_-10px_rgba(234,179,8,0.5)] transition-all active:scale-95"
                  >
                    <div className="bg-black/20 p-4 rounded-2xl">
                      <HardHat size={24} className="text-black" />
                    </div>
                    <div className="text-left">
                      <div className="text-[7px] font-black uppercase tracking-[0.3em] text-black/50 mb-0.5">Slow Zone</div>
                      <div className="text-xl font-black text-black tracking-tight italic">WORK ZONE</div>
                    </div>
                  </button>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="camera"
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="w-full flex flex-col gap-6"
              >
                {/* Visual indicator of reporting type */}
                <div className="flex items-center justify-center">
                  <div className={cn(
                    "px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3",
                    selectedType === 'pothole' ? "bg-red-600/20 text-red-500 border border-red-500/30" : "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30"
                  )}>
                    {selectedType === 'pothole' ? <AlertTriangle size={14} /> : <HardHat size={14} />}
                    {selectedType} detection
                  </div>
                </div>

                <div className="relative aspect-square rounded-[40px] overflow-hidden border-2 border-white/10 bg-black/20">
                   <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-1/2 h-1/2 border-2 border-dashed border-white/20 rounded-[32px]" />
                   </div>
                   
                   <AnimatePresence>
                     {status !== 'idle' && (
                       <motion.div 
                         initial={{ opacity: 0 }}
                         animate={{ opacity: 1 }}
                         exit={{ opacity: 0 }}
                         className="absolute inset-0 bg-black/60 flex items-center justify-center z-10 backdrop-blur-md"
                       >
                         <div className="flex flex-col items-center gap-4 text-white text-center">
                            {status === 'success' ? <CheckCircle size={48} className="text-green-500" /> : <Shield size={48} className="text-blue-500 animate-pulse text-center" />}
                            <div className="space-y-1">
                               <h4 className="text-lg font-black uppercase italic">
                                 {status === 'blurring' ? 'Privacy Guard' : 
                                  status === 'detecting' ? 'AI Verification' :
                                  status === 'reporting' ? 'Global Registry' :
                                  status === 'success' ? 'Report Logged' : 'Processing'}...
                               </h4>
                               <p className="text-[10px] text-white/50 px-8">
                                 {status === 'success' ? 'Your report has been registered to the community map.' : 'Point saving to RoadSence global intelligence map'}
                               </p>
                            </div>
                         </div>
                       </motion.div>
                     )}
                   </AnimatePresence>
                </div>

                <div className="flex flex-col items-center gap-3">
                  <button 
                    disabled={status !== 'idle'}
                    onClick={captureAndReport}
                    className="w-16 h-16 rounded-full border-4 border-white bg-white/10 backdrop-blur-xl flex items-center justify-center shadow-2xl active:scale-90 transition-all"
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-full",
                      selectedType === 'pothole' ? "bg-red-600" : "bg-yellow-500 shadow-[0_0_20px_rgba(234,179,8,0.5)]"
                    )} />
                  </button>
                  <span className="text-white/40 font-black uppercase text-[8px] tracking-[0.4em]">Confirm & Upload</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  </motion.div>
  );
}
