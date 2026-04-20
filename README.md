# Road Sense — Shielding Your Journey with AI Hazard Intelligence

**Team Name:** KSB48  
**Participant:** Chirag Tankan (Solo)  
**Hackathon:** HackIndia 2026

---

## 🚩 Problem Statement
India faces a staggering crisis on its roads. Every year, **millions of accidents** occur due to unidentified hazards. According to government reports, **potholes alone cause thousands of deaths annually**, while uncoordinated, unmarked construction sites create "death traps" for unsuspecting motorists, especially at night or in rainy conditions.

Current navigation systems prioritize "Fastest Time" over "Safest Arrival." Drivers often find themselves on poorly maintained roads where sudden defects lead to tire bursts, loss of control, and fatal collisions. There is a critical lack of real-time, path-specific alerts that can warn a driver *before* they hit a disaster.

## 🛡️ The Solution: Road Sense
**Road Sense** is an AI-powered active safety engine that transforms navigation into a high-fidelity "Specialist Tool." It is designed to ensure that no driver ever hits a hazard they didn't see coming.

### **Our Smart Safety Pillars:**
1.  **Smart Safe Routing**: Unlike standard GPS, Road Sense analyzes alternative paths and selects the **Optimal Safe Route**—the one with the least density of potholes and construction zones.
2.  **Path-Locked Intelligence**: Hazards are **only** visible and alerts are **only** triggered when the user starts a "Registered Journey." This keeps the interface clean and the driver's focus strictly on their mission-critical path.
3.  **Proximity Intercept Alerts**: Real-time distance measurement (e.g., "Pothole detected in 120m") provides a high-priority HUD warning before the vehicle reaches the hazard, allowing for safe braking and maneuvering.
4.  **Community Self-Healing**: Utilizing a "Social Consensus" model, a hazard is automatically removed from the global map if 5 separate community members mark it as "Fixed."

---

## 🏗️ How it was Built (The Technical Journey)
Road Sense was built from scratch leveraging a modern full-stack architecture designed for extreme low latency and high data precision.

### **Phase 1: Real-Time Intelligence & Data Fusion**
We integrated multiple global and local data sources to build the initial "Hazard Mesh":
-   **Overpass API (OSM)**: We built a script to ingest live OpenStreetMap data, specifically searching for road defects tags like `highway=construction`, `surface=potholes`, and `smoothness=horrible`.
-   **GeoSadak & RDD2022**: We incorporated verified Indian road data and AI-detected pothole datasets.
-   **Firebase Firestore**: Created a real-time NoSQL backbone where community reports are synchronized across all users in milliseconds.

### **Phase 2: The Routing Engine (SafePath Algorithm)**
-   **OSRM (Open Source Routing Machine)**: We utilize OSRM for high-speed route geometries.
-   **SafePath Logic**: When a user inputs a destination, we fetch up to 3 alternative routes. We then run a spatial analysis against our Hazard Database, scoring each route by the number of obstacles within 150m of the path. The app then automatically selects the route with the lowest "Danger Score."

### **Phase 3: The Frontend & Immersive HUD**
-   **React 18 & TypeScript**: Used for a robust, type-safe application structure.
-   **React Leaflet**: Custom-themed with CARTO DarkMatter tiles to create a "Tactical Specialist" aesthetic.
-   **Framer Motion**: Powering the high-priority alerts and the immersion startup sequence.
-   **Geofire-Common**: Used for precise distance calculations between the user's GPS coordinates and identified markers.

---

## 🛠️ Tech Stack Recap
-   **Frontend**: React, Vite, Tailwind CSS, Framer Motion
-   **Mapping**: Leaflet, OSRM, Nominatim
-   **Backend**: Firebase (Auth & Firestore)
-   **Intelligence**: Overpass API, AI Road Defect Datasets

---

## 🚀 Impact & Future
By prioritizing safety over speed, Road Sense aims to reduce road-defect-related accidents by up to 40%. The vision is to turn every vehicle into a "Safe Mesh Node," contributing to a collective intelligence that makes Indian roads predictable and secure for everyone.

**Developed with 🛡️ by Team KSB48 (Chirag Tankan)**
