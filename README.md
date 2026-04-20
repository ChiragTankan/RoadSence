# RoadSence — Shielding Your Journey with AI Hazard Intelligence

**Team Name:** KSB48  
**Participant:** Chirag Tankan (Solo)  
**Hackathon:** HackIndia 2026

---

## 🛡️ Project Overview

**RoadSence** is an AI-powered active safety engine designed to mitigate road accidents by providing real-time intelligence on road conditions. It transforms a standard navigation experience into a high-fidelity "Specialist Tool" for drivers, providing instant proximity warnings for potholes, construction zones, and other critical hazards.

According to global road safety data, road defects like potholes and unmarked construction contribute significantly to urban accidents. **RoadSence** solves this by aggregating multi-source data (OpenStreetMap, GeoSadak, RDD2022 AI datasets, and Community Live feeds) into a single, tactical interface.

---

## 🚀 Key Features

### 1. **AI Safety Intelligence Header**
A high-fidelity instrument panel displaying real-time system metrics:
- **AI_CORE Status**: Real-time heartbeat of the detection engine.
- **Satellite Telemetry**: Connectivity status for precision positioning.
- **System Latency**: Monitoring data processing speed (e.g., 14.2ms) for mission-critical response.

### 2. **Tactical Proximity Warnings**
When a hazard is intercepted within the **500m safety radius**, the system triggers an immersive **Safety Intercept Alert**. This high-priority notification forces driver focus with pulsing visual cues and direct "Immediate Action Required" instructions.

### 3. **Spatial Deduplication Engine**
To resolve visual clutter in high-density hazard areas, RoadSence uses an advanced spatial merging algorithm. Markers within a **50-meter radius** are consolidated into a single actionable point, providing a clean, scannable route while maintaining safety precision.

### 4. **Multi-Source Data Fusion**
RoadSence isn't just a map; it's a data aggregator. Every hazard popup provides an "Intelligence Report" detailing:
- **Source Origin**: OSM Dataset 04A, GeoSadak Verified, or Community Live.
- **Confidence Rating**: AI-calculated verification percentage (e.g., 92.4%).
- **TR-ID**: Unique transaction tracking for every synchronized hazard.

### 5. **Specialist Design Language**
Built using a "Specialist Tool" aesthetic:
- **Dark Architecture**: Native CARTO DarkMatter tiles for high-contrast visibility.
- **Glassmorphism**: Advanced UI panels with backdrop-blur and border highlights.
- **Typography**: JetBrains Mono for a precise, technical "Mission Control" feel.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, Vite, TypeScript
- **Styling**: Tailwind CSS (Specialist Tool Utility Classes)
- **Mapping**: Leaflet, React Leaflet (Native Dark Tiles)
- **Animations**: Framer Motion (Immersive Transitions & Alerts)
- **Backend/Storage**: Firebase (Auth & Firestore Intelligence Sync)
- **APIs**:
    - **Overpass API**: For real-world OpenStreetMap hazard ingestion.
    - **Nominatim API**: For fast, efficient location indexing.
    - **OSRM**: For high-speed route geometries.

---

## 📸 Presentation Details

RoadSence is presented through a "Systems Startup" sequence. Upon initialization, the user is briefed on the **Location Protocol** required for real-time scanning. The interface then transitions from a sleek startup screen into the **Active Monitoring Mesh**.

### **How it Works**
1. **Mesh Sync**: The app starts by syncing thousands of global hazard points from the cloud.
2. **Scanner Mode**: As the user moves, the system monitors their 500m "Safety Bubble."
3. **Intercept**: If a pothole or construction zone enters the bubble, the HUD shifts to high-alert "Proximity Mode."
4. **Report**: Users can report live hazards via the "Access Terminal," which are instantly shared with the global KSB48 mesh.

---

## 🛣️ Roadmap
- [ ] **Direct Neural Vision**: Integrating device camera for real-time AI pothole detection through the browser.
- [ ] **V-Sync Audio Alerts**: High-precision spatial audio for direction-aware hazard warnings.
- [ ] **Fleet Intelligence**: Dedicated dashboard for city authorities to track and fix reported defects.

---

**Developed with 🛡️ by Team KSB48 (Chirag Tankan)**
