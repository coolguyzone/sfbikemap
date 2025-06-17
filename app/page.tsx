"use client";

import { useState } from "react";
import { GoogleMap, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";
import styles from "./page.module.css";

const containerStyle = {
  width: "100%",
  height: "400px",
  margin: "1rem 0"
};

const SF_CENTER = { lat: 37.7749, lng: -122.4194 };

export default function Home() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [steps, setSteps] = useState<google.maps.DirectionsStep[]>([]);
  const [loading, setLoading] = useState(false);
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: "AIzaSyDUsQaC3NoKKK7O837yCjcl26QriBN29Y4",
    libraries: ["places"]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) {
      alert("Please wait for the map to load");
      return;
    }

    console.log('Form submitted with values:', { start, end });
    setLoading(true);
    setDirections(null);
    setSteps([]);
    
    try {
      // Create geocoder instance
      const geocoder = new window.google.maps.Geocoder();
      
      // Geocode start and end
      const geocode = async (address: string): Promise<google.maps.LatLng> => {
        return new Promise((resolve, reject) => {
          geocoder.geocode({
            address: address,
            componentRestrictions: {
              locality: "San Francisco",
              administrativeArea: "CA",
              country: "US"
            }
          }, (results: google.maps.GeocoderResult[] | null, status: google.maps.GeocoderStatus) => {
            if (status === "OK" && results && results[0]) {
              resolve(results[0].geometry.location);
            } else {
              reject(new Error(`Geocoding failed: ${status}`));
            }
          });
        });
      };

      console.log('Starting geocoding for both addresses...');
      const [startLoc, endLoc] = await Promise.all([
        geocode(start),
        geocode(end)
      ]);
      console.log('Geocoding completed successfully:', { startLoc, endLoc });

      // Get directions
      const directionsService = new window.google.maps.DirectionsService();
      
      const result = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
        directionsService.route({
          origin: startLoc,
          destination: endLoc,
          travelMode: window.google.maps.TravelMode.BICYCLING
        }, (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
          if (status === "OK" && result) {
            resolve(result);
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        });
      });

      console.log('Successfully got directions');
      setDirections(result);
      setSteps(result.routes[0].legs[0].steps);
      
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      alert("Error: " + err);
    } finally {
      setLoading(false);
    }
  };

  // Get map center
  const mapCenter = directions && directions.legs && directions.legs[0]?.start_location
    ? directions.legs[0].start_location
    : SF_CENTER;

  if (loadError) {
    return <div>Error loading maps</div>;
  }

  return (
    <div style={{ maxWidth: 700, margin: "2rem auto", padding: 16 }}>
      <h1>San Francisco Bike Directions</h1>
      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <div>
          <label>Start (address or intersection):</label>
          <input
            type="text"
            value={start}
            onChange={e => setStart(e.target.value)}
            required
            disabled={!isLoaded || loading}
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="e.g. Market St & 5th St or 1 Dr Carlton B Goodlett Pl"
          />
        </div>
        <div>
          <label>Destination (address or intersection):</label>
          <input
            type="text"
            value={end}
            onChange={e => setEnd(e.target.value)}
            required
            disabled={!isLoaded || loading}
            style={{ width: "100%", marginBottom: 8 }}
            placeholder="e.g. Valencia St & 16th St or 501 Stanyan St"
          />
        </div>
        <button 
          type="submit" 
          disabled={!isLoaded || loading} 
          style={{ marginTop: 8 }}
        >
          {!isLoaded ? "Loading Maps..." : loading ? "Loading..." : "Get Bike Directions"}
        </button>
      </form>
      {isLoaded && (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={mapCenter}
          zoom={13}
        >
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                suppressMarkers: false,
                polylineOptions: {
                  strokeColor: "#FF0000",
                  strokeWeight: 5
                }
              }}
            />
          )}
        </GoogleMap>
      )}
      {steps.length > 0 && (
        <div>
          <h2>Directions</h2>
          <ol>
            {steps.map((step: google.maps.DirectionsStep, idx: number) => (
              <li key={idx} dangerouslySetInnerHTML={{ __html: step.instructions }} />
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
