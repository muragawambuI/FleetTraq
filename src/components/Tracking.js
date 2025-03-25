import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, ChevronLeft, Crosshair, MapIcon, Trash2 } from "lucide-react";
import { useFleet } from "../context/FleetContext";
import { collection, addDoc, onSnapshot, query, orderBy, where, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../firebase";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Button from "./Button";
import { v4 as uuidv4 } from "uuid";

import icon from "leaflet/dist/images/marker-icon.png";
import iconShadow from "leaflet/dist/images/marker-shadow.png";
import carIcon from './assets/car-icon.png';

// Default marker icon
let DefaultIcon = L.icon({
  iconUrl: icon,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

// Car icon for vehicle location
let CarIcon = L.icon({
  iconUrl: carIcon,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

L.Marker.prototype.options.icon = DefaultIcon;

// Map view controller component
const MapViewController = ({ center, zoom }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, zoom);
    }
  }, [center, zoom, map]);
  
  return null;
};

const Tracking = () => {
  const navigate = useNavigate();
  const { darkMode, vehicles, trackingData, setTrackingData, user } = useFleet();
  const [selectedVehicle, setSelectedVehicle] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [error, setError] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");
  const [locationName, setLocationName] = useState("");
  const [useManualCoordinates, setUseManualCoordinates] = useState(false);
  const [trackingHistory, setTrackingHistory] = useState([]);
  const [trackedVehicles, setTrackedVehicles] = useState([]);
  const [deviceId] = useState(() => localStorage.getItem("deviceId") || uuidv4());
  const [controllingDeviceId, setControllingDeviceId] = useState(null);

  localStorage.setItem("deviceId", deviceId);

  const nairobiCoordinates = useMemo(() => ({ lat: -1.2864, lng: 36.8172 }), []);

  // Fetch all tracked vehicles
  useEffect(() => {
    const q = query(collection(db, "tracking"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allTracking = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const uniqueVehicles = [...new Map(allTracking.map(item => [item.vehicleId, item])).values()];
      setTrackedVehicles(uniqueVehicles);
    }, (err) => {
      setError("Failed to fetch tracked vehicles: " + err.message);
    });
    return () => unsubscribe();
  }, []);

  const handleTrackVehicle = async () => {
    if (!selectedVehicle) {
      setError("Please select a vehicle to track.");
      return;
    }
    
    setError(null);
    
    if (trackedVehicles.some(v => v.vehicleId === selectedVehicle && v.deviceId !== deviceId)) {
      setError("This vehicle is already being tracked by another device.");
      return;
    }

    if (useManualCoordinates) {
      if (!manualLat || !manualLng) {
        setError("Please enter both latitude and longitude values.");
        return;
      }
      
      const lat = parseFloat(manualLat);
      const lng = parseFloat(manualLng);
      
      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setError("Please enter valid coordinates.");
        return;
      }
      
      await saveLocation(lat, lng, locationName || "Manual Location", "manual");
    } else {
      setIsTracking(true);
      startTracking();
    }
  };

  const saveLocation = useCallback(async (lat, lng, name, method) => {
    const newLocation = { lat, lng, name };
    setCurrentLocation(newLocation);
    setTrackingData(newLocation);
    
    try {
      const docRef = await addDoc(collection(db, "tracking"), {
        vehicleId: selectedVehicle,
        lat,
        lng,
        locationName: name,
        timestamp: new Date().toISOString(),
        method,
        deviceId: deviceId,
        accountId: user?.uid || "YOUR_ACCOUNT_ID",
        isTracking: true,
      });
      setControllingDeviceId(deviceId);
      return docRef.id;
    } catch (err) {
      setError("Failed to save location: " + err.message);
      throw err;
    }
  }, [selectedVehicle, deviceId, user, setCurrentLocation, setTrackingData, setError]);

  const startTracking = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setLocationName("Current Location");
          await saveLocation(latitude, longitude, "Current Location", "gps");
        },
        (err) => {
          setIsTracking(false);
          setError("Unable to get your location: " + err.message);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setError("Geolocation is not supported by your browser.");
      setIsTracking(false);
    }
  };

  // Real-time tracking updates
  useEffect(() => {
    let watchId = null;
    
    if (isTracking && !useManualCoordinates && navigator.geolocation && (!controllingDeviceId || controllingDeviceId === deviceId)) {
      watchId = navigator.geolocation.watchPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          setLocationName("Current Location");
          await saveLocation(latitude, longitude, "Current Location", "gps");
        },
        (err) => {
          setError("Tracking error: " + err.message);
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }
    
    return () => {
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
      }
    };
  }, [isTracking, useManualCoordinates, saveLocation, controllingDeviceId, deviceId]);

  // Listen for tracking updates for selected vehicle
  useEffect(() => {
    if (!selectedVehicle) {
      setCurrentLocation(null);
      setTrackingHistory([]);
      setControllingDeviceId(null);
      return;
    }

    const q = query(
      collection(db, "tracking"),
      where("vehicleId", "==", selectedVehicle),
      orderBy("timestamp", "desc")
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const updates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTrackingHistory(updates);
      
      if (updates.length > 0) {
        const latest = updates[0];
        setControllingDeviceId(latest.deviceId);
        const newLocation = {
          lat: latest.lat,
          lng: latest.lng,
          name: latest.locationName
        };
        setCurrentLocation(newLocation);
        setTrackingData(newLocation);
        setLocationName(latest.locationName);
        setIsTracking(latest.isTracking);
      } else {
        setCurrentLocation(null);
        setTrackingHistory([]);
        setControllingDeviceId(null);
      }
    }, (err) => {
      setError("Failed to fetch tracking updates: " + err.message);
    });

    return () => unsubscribe();
  }, [selectedVehicle, setTrackingData]);

  // Set initial map view
  useEffect(() => {
    if (!trackingData) {
      setTrackingData(nairobiCoordinates);
    }
  }, [trackingData, setTrackingData, nairobiCoordinates]);

  const stopTracking = async (vehicleId, trackingDocId) => {
    if (!trackingDocId) {
      setError("No active tracking session found.");
      return;
    }

    const trackingRef = doc(db, "tracking", trackingDocId);

    try {
      await updateDoc(trackingRef, { isTracking: false });
      setIsTracking(false);
      setControllingDeviceId(null);
      setError(null);
    } catch (err) {
      setError("Failed to stop tracking: " + err.message);
    }
  };

  const removeVehicleFromTracking = async (trackingDocId) => {
    if (!trackingDocId) {
      setError("No tracking entry selected for removal.");
      return;
    }

    const trackingRef = doc(db, "tracking", trackingDocId);
    const vehicleTracking = trackedVehicles.find(v => v.id === trackingDocId);

    if (!vehicleTracking) {
      setError("Tracking entry not found.");
      return;
    }

    try {
      await deleteDoc(trackingRef);
      setError(null);
      if (selectedVehicle === vehicleTracking.vehicleId) {
        setCurrentLocation(null);
        setTrackingHistory([]);
        setControllingDeviceId(null);
        setIsTracking(false);
        setSelectedVehicle("");
      }
      setTrackedVehicles(prev => prev.filter(v => v.id !== trackingDocId));
    } catch (err) {
      setError("Failed to remove vehicle from tracking: " + err.message);
    }
  };

  const MapComponent = () => {
    const position = currentLocation || trackingData || nairobiCoordinates;
    
    return (
      <MapContainer 
        center={[position.lat, position.lng]} 
        zoom={13} 
        style={{ height: "800px", width: "100%", borderRadius: "0.5rem" }}
      >
        <TileLayer 
          attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' 
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {currentLocation && (
          <Marker 
            position={[currentLocation.lat, currentLocation.lng]} 
            icon={CarIcon}
          >
            <Popup>
              {selectedVehicle ? 
                `Vehicle: ${vehicles.find(v => v.id === selectedVehicle)?.make} ${vehicles.find(v => v.id === selectedVehicle)?.model}` : 
                "Current Location"}
              <br />
              {currentLocation.name && <span><strong>Location:</strong> {currentLocation.name}<br /></span>}
              <strong>Coordinates:</strong> {currentLocation.lat.toFixed(6)}, {currentLocation.lng.toFixed(6)}
              {trackingHistory.length > 0 && (
                <>
                  <br />
                  <strong>Last Update:</strong> {new Date(trackingHistory[0].timestamp).toLocaleString()}
                  <br />
                  <strong>Tracking Device:</strong> {controllingDeviceId === deviceId ? "This Device" : "Another Device"}
                </>
              )}
            </Popup>
          </Marker>
        )}
        
        <MapViewController center={[position.lat, position.lng]} zoom={13} />
      </MapContainer>
    );
  };

  const themeStyles = {
    background: darkMode ? "linear-gradient(135deg, #080016 0%, #150025 100%)" : "linear-gradient(135deg, #f3f4f6 0%, #ffffff 100%)",
    color: darkMode ? "#fff" : "#000",
    cardBg: darkMode ? "rgba(20, 10, 40, 0.7)" : "rgba(255, 255, 255, 0.9)",
    cardBorder: darkMode ? "2px solid rgba(250, 204, 21, 0.5)" : "2px solid rgba(59, 130, 246, 0.5)",
    cardGlow: darkMode ? "0 0 15px rgba(250, 204, 21, 0.3)" : "0 0 15px rgba(59, 130, 246, 0.2)",
    inputBg: darkMode ? "#1a0033" : "#f3f4f6",
    inputBorder: `1px solid ${darkMode ? "#4b5563" : "#d1d5db"}`,
    inputText: darkMode ? "#fff" : "#000",
    labelText: darkMode ? "#facc15" : "#1f2937",
  };

  return (
    <motion.div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...themeStyles,
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <div style={{ flex: "1 0 auto" }}>
        <header
          style={{
            background: darkMode ? "rgba(0, 0, 0, 0.5)" : "#e5e7eb",
            padding: "12px 16px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <div
            style={{
              maxWidth: "1280px",
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "center" }}>
              <MapPin style={{ height: 40, width: 40, color: darkMode ? "#facc15" : "#1f2937", marginRight: "8px" }} />
              <div>
                <h1 style={{ fontSize: "24px", fontWeight: "bold", color: darkMode ? "#facc15" : "#1f2937" }}>
                  Track Your Vehicles
                </h1>
                <p style={{ fontSize: "14px", opacity: 0.7 }}>
                  See where your fleet is right now
                </p>
              </div>
            </div>
            <Button onClick={() => navigate("/dashboard")}>
              <ChevronLeft size={16} style={{ marginRight: "4px" }} /> 
              Back to Dashboard
            </Button>
          </div>
        </header>

        <main style={{ padding: "16px 24px", flexGrow: 1 }}>
          <div style={{ maxWidth: "1280px", margin: "0 auto" }}>
            {error && (
              <motion.div
                style={{ 
                  marginBottom: "16px", 
                  padding: "16px", 
                  background: "#dc2626", 
                  borderRadius: "8px", 
                  color: "#fff" 
                }}
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {error}
              </motion.div>
            )}

            {/* Tracked Vehicles List */}
            <div style={{ marginBottom: "24px" }}>
              <h2 style={{ color: themeStyles.labelText, fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>
                Currently Tracked Vehicles:
              </h2>
              {trackedVehicles.length > 0 ? (
                <ul style={{ listStyle: "none", padding: 0 }}>
                  {trackedVehicles.map((track) => (
                    <li key={track.id} style={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "12px" }}>
                      {vehicles.find(v => v.id === track.vehicleId)?.make || "Unknown"} {vehicles.find(v => v.id === track.vehicleId)?.model || "Vehicle"} 
                      ({track.deviceId === deviceId ? "This Device" : "Another Device"})
                      {track.isTracking && (
                        <Button 
                          onClick={() => stopTracking(track.vehicleId, track.id)}
                          style={{ background: "#dc2626", marginLeft: "8px" }}
                          disabled={!user} // Only disabled if not authenticated
                        >
                          Stop Tracking
                        </Button>
                      )}
                      <Button 
                        onClick={() => removeVehicleFromTracking(track.id)}
                        style={{ background: "#ff6b6b", marginLeft: "8px" }}
                        disabled={!user} // Only disabled if not authenticated
                      >
                        <Trash2 size={16} style={{ marginRight: "4px" }} /> Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No vehicles are currently being tracked.</p>
              )}
            </div>

            <motion.div
              style={{
                background: themeStyles.cardBg,
                padding: "24px",
                borderRadius: "8px",
                border: themeStyles.cardBorder,
                boxShadow: themeStyles.cardGlow,
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "24px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ color: themeStyles.labelText, fontSize: "18px", fontWeight: "600" }}>
                      Choose a Vehicle:
                    </label>
                    <select
                      value={selectedVehicle}
                      onChange={(e) => setSelectedVehicle(e.target.value)}
                      style={{
                        padding: "8px",
                        background: themeStyles.inputBg,
                        color: themeStyles.inputText,
                        border: themeStyles.inputBorder,
                        borderRadius: "4px",
                      }}
                    >
                      <option value="">Select a vehicle</option>
                      {vehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.make} {vehicle.model} ({vehicle.licensePlate})
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <label style={{ color: themeStyles.labelText, fontSize: "18px", fontWeight: "600" }}>
                      Location Name:
                    </label>
                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      placeholder="Enter location name (optional)"
                      style={{
                        padding: "8px",
                        background: themeStyles.inputBg,
                        color: themeStyles.inputText,
                        border: themeStyles.inputBorder,
                        borderRadius: "4px",
                      }}
                      disabled={controllingDeviceId && controllingDeviceId !== deviceId}
                    />
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "8px" }}>
                    <input
                      type="checkbox"
                      id="manualCoords"
                      checked={useManualCoordinates}
                      onChange={() => setUseManualCoordinates(!useManualCoordinates)}
                      style={{ accentColor: darkMode ? "#facc15" : "#3b82f6" }}
                      disabled={controllingDeviceId && controllingDeviceId !== deviceId}
                    />
                    <label htmlFor="manualCoords" style={{ color: themeStyles.inputText, cursor: "pointer" }}>
                      Enter coordinates manually
                    </label>
                  </div>
                  
                  {useManualCoordinates && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      <label style={{ color: themeStyles.labelText, fontSize: "16px", fontWeight: "600" }}>
                        <MapIcon size={16} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                        Manual Coordinates:
                      </label>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            value={manualLat}
                            onChange={(e) => setManualLat(e.target.value)}
                            placeholder="Latitude"
                            style={{
                              padding: "8px",
                              width: "100%",
                              background: themeStyles.inputBg,
                              color: themeStyles.inputText,
                              border: themeStyles.inputBorder,
                              borderRadius: "4px",
                            }}
                            disabled={controllingDeviceId && controllingDeviceId !== deviceId}
                          />
                        </div>
                        <div style={{ flex: 1 }}>
                          <input
                            type="text"
                            value={manualLng}
                            onChange={(e) => setManualLng(e.target.value)}
                            placeholder="Longitude"
                            style={{
                              padding: "8px",
                              width: "100%",
                              background: themeStyles.inputBg,
                              color: themeStyles.inputText,
                              border: themeStyles.inputBorder,
                              borderRadius: "4px",
                            }}
                            disabled={controllingDeviceId && controllingDeviceId !== deviceId}
                          />
                        </div>
                      </div>
                      <p style={{ fontSize: "12px", color: darkMode ? "#d1d5db" : "#6b7280" }}>
                        Format: Decimal degrees (e.g., -1.2864, 36.8172)
                      </p>
                    </div>
                  )}
                  
                  <Button 
                    onClick={handleTrackVehicle} 
                    disabled={!selectedVehicle || (controllingDeviceId && controllingDeviceId !== deviceId)}
                  >
                    <Crosshair size={16} style={{ marginRight: "4px" }} /> 
                    {isTracking && !useManualCoordinates ? "Tracking..." : useManualCoordinates ? "Set Location" : "Start Tracking"}
                  </Button>
                  
                  {isTracking && !useManualCoordinates && controllingDeviceId === deviceId && (
                    <Button 
                      onClick={() => stopTracking(selectedVehicle, trackingHistory[0]?.id)}
                      style={{ background: "#dc2626" }}
                    >
                      Stop Tracking
                    </Button>
                  )}

                  {currentLocation && (
                    <div style={{ 
                      marginTop: "16px", 
                      padding: "12px", 
                      background: darkMode ? "rgba(0,0,0,0.3)" : "rgba(0,0,0,0.05)", 
                      borderRadius: "8px" 
                    }}>
                      <h3 style={{ color: themeStyles.labelText, fontSize: "16px", fontWeight: "600" }}>
                        Current Location:
                      </h3>
                      {currentLocation.name && (
                        <p style={{ color: darkMode ? "#d1d5db" : "#4b5563", marginTop: "4px" }}>
                          <strong>Location:</strong> {currentLocation.name}
                        </p>
                      )}
                      <p style={{ color: darkMode ? "#d1d5db" : "#4b5563", marginTop: "4px" }}>
                        <strong>Latitude:</strong> {currentLocation.lat.toFixed(6)}
                      </p>
                      <p style={{ color: darkMode ? "#d1d5db" : "#4b5563" }}>
                        <strong>Longitude:</strong> {currentLocation.lng.toFixed(6)}
                      </p>
                      {trackingHistory.length > 0 && (
                        <>
                          <p style={{ color: darkMode ? "#d1d5db" : "#4b5563", marginTop: "4px" }}>
                            <strong>Last Update:</strong> {new Date(trackingHistory[0].timestamp).toLocaleString()}
                          </p>
                          <p style={{ color: darkMode ? "#d1d5db" : "#4b5563", marginTop: "4px" }}>
                            <strong>Tracking Device:</strong> {controllingDeviceId === deviceId ? "This Device" : "Another Device"}
                          </p>
                        </>
                      )}
                      {isTracking && !useManualCoordinates && controllingDeviceId === deviceId && (
                        <p style={{ 
                          color: darkMode ? "#facc15" : "#3b82f6", 
                          marginTop: "8px", 
                          fontSize: "14px", 
                          fontWeight: "500" 
                        }}>
                          ● Live tracking is active
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <h2 style={{ color: themeStyles.labelText, fontSize: "18px", fontWeight: "600", marginBottom: "8px" }}>
                    Vehicle Location Map:
                  </h2>
                  <MapComponent />
                </div>
              </div>
            </motion.div>
          </div>
        </main>
      </div>

      <footer
        style={{
          background: darkMode ? "rgba(0, 0, 0, 0.7)" : "rgba(255, 255, 255, 0.9)",
          padding: "16px",
          textAlign: "center",
          color: darkMode ? "#9ca3af" : "#6b7280",
          fontSize: "14px",
          flexShrink: 0,
        }}
      >
        © {new Date().getFullYear()} FleetTraq
      </footer>
    </motion.div>
  );
};

export default Tracking;