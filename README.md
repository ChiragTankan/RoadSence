# 🛡️ RoadSence

**Empowering Drivers. Securing Roads. Crowdsourced Safety.**

RoadSence is a premium, community-driven application designed to make every journey safer. By combining real-time GPS tracking, high-performance AI detection, and community crowdsourcing, RoadSence keeps you informed of road hazards before they become a problem.

---

## 🚀 Key Features

### 📍 Intelligent Real-Time Map
* **Global Hazard Sync**: Instantly see reports from other drivers worldwide.
* **Dark-Mode Precision**: High-contrast, easy-to-read map optimized for both day and night driving.
* **Smart Context Legend**: A compact instrument-cluster legend that explains every marker on your path.

### ⚠️ Proactive Hazard Reporting
* **One-Tap Reporting**: Use the **Report (Camera)** button to flag Potholes or Work Zones in seconds.
* **AI-Verified Vision**: Every report is analyzed by the Gemini 1.5 Pro AI to ensure high accuracy while maintaining privacy through automatic blurring.
* **Visual Confirmation**: Real-time feedback cards show you exactly what is being reported and the status of the cloud sync.

### 🔔 Live Safety Alerts
* **Proximity Pings**: Receive high-priority "Impact Alerts" when you are within 200 meters of a critical hazard.
* **Dynamic Distance Tracker**: See exactly how far away a hazard is in real-time as you drive toward it.

### 🗺️ Smart Navigation
* **Trip Planner**: Use the **GO NOW** button to search for any destination.
* **Route Visualization**: High-clarity blue pathing that guides you through the safest possible roads.
* **One-Touch Stop**: Easily end your trip with the "Stop Trip" control.

---

## 📱 How to Use

### 1. Reporting a Hazard
1. Tap the **Blue Camera Icon** at the bottom left.
2. Select the type of hazard (**Pothole** or **Work Zone**).
3. The live camera card will appear. Point your phone at the hazard and tap the **Lens Trigger (Bottom Circle)**.
4. RoadSence will process the image, verify the location, and sync it to the global map automatically.

### 2. Planning a Trip
1. Tap the **GO NOW** center button.
2. Enter your destination (e.g., "Main Street" or "Airport").
3. Hit **START TRIP** to see your route and begin navigation.

### 3. Understanding Markers
* **🔴 Red Circle (Alert Triangle)**: Pothole detected. Drive with caution or avoid the lane.
* **🟡 Yellow Hexagon (Hard Hat)**: Ongoing construction or work zone. Expect delays or slow traffic.
* **🔵 Blue Pulsing Pulse**: Your current live location.

---

## 🛠️ Technical Excellence
RoadSence is built with a production-grade tech stack for maximum reliability:
* **Frontend**: React 18, Vite, and Framer Motion for a "Glassmorphic" floating UI.
* **Mapping**: Leaflet API with customized tile rendering.
* **Intelligence**: Google Gemini 1.5 Pro Vision for hazard verification.
* **Backend**: Firebase Firestore (NoSQL) for millisecond-latency global data sync.
* **Location**: Geofire-common for high-performance spatial queries.

---

## 🔒 Your Privacy
We believe in safety *and* privacy. RoadSence automatically applies a **6px Gaussian Blur** to all captured images before they reach the AI verification layer to protect personal information, license plates, and bystanders.

---
*RoadSence — Navigation Built on Community Trust.*
