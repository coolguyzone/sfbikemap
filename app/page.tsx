"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { GoogleMap, DirectionsRenderer, useJsApiLoader } from "@react-google-maps/api";
import styles from "./page.module.css";

const containerStyle = {
  width: "100%",
  height: "500px",
  margin: "1rem 0",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
};

const SF_CENTER = { lat: 37.7749, lng: -122.4194 };

// Enhanced interfaces based on technical spec
interface StepWithElevation extends google.maps.DirectionsStep {
  elevation?: number;
  grade?: number;
  maxGrade?: number;
}

interface RouteOption {
  id: string;
  name: string;
  description: string;
  directions: google.maps.DirectionsResult | null;
  elevationGain: number;
  elevationLoss: number;
  totalDistance: number;
  steps: StepWithElevation[];
  maxGrade: number;
  averageGrade: number;
}

interface CachedRoute {
  start: string;
  end: string;
  routes: RouteOption[];
  timestamp: number;
}

// Cache configuration
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const ELEVATION_SAMPLE_INTERVAL = 100; // meters

export default function Home() {
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<Map<string, CachedRoute>>(new Map());

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "AIzaSyDUsQaC3NoKKK7O837yCjcl26QriBN29Y4",
    libraries: ["places", "geometry"]
  });

  // Enhanced elevation data retrieval with better sampling
  const getElevationData = useCallback(async (path: google.maps.LatLng[]): Promise<number[]> => {
    return new Promise((resolve, reject) => {
      const elevator = new window.google.maps.ElevationService();
      
      // Calculate optimal sampling based on path length
      const totalDistance = google.maps.geometry.spherical.computeLength(path);
      const samples = Math.max(10, Math.min(100, Math.floor(totalDistance / ELEVATION_SAMPLE_INTERVAL)));
      
      elevator.getElevationAlongPath({
        path: path,
        samples: samples
      }, (results, status) => {
        if (status === "OK" && results) {
          resolve(results.map(r => r.elevation || 0));
        } else {
          reject(new Error(`Elevation request failed: ${status}`));
        }
      });
    });
  }, []);

  // Enhanced elevation calculations
  const calculateElevationMetrics = useCallback((elevations: number[]): {
    totalGain: number;
    totalLoss: number;
    maxGrade: number;
    averageGrade: number;
  } => {
    let totalGain = 0;
    let totalLoss = 0;
    let maxGrade = 0;
    let totalGrade = 0;
    let gradeCount = 0;

    for (let i = 1; i < elevations.length; i++) {
      const diff = elevations[i] - elevations[i - 1];
      const distance = 100; // Approximate distance between samples
      
      if (diff > 0) {
        totalGain += diff;
      } else {
        totalLoss += Math.abs(diff);
      }

      const grade = Math.abs((diff / distance) * 100);
      if (grade > maxGrade) {
        maxGrade = grade;
      }
      totalGrade += grade;
      gradeCount++;
    }

    return {
      totalGain: Math.round(totalGain),
      totalLoss: Math.round(totalLoss),
      maxGrade: Math.round(maxGrade * 10) / 10,
      averageGrade: gradeCount > 0 ? Math.round((totalGrade / gradeCount) * 10) / 10 : 0
    };
  }, []);

  // Cache management
  const getCacheKey = useCallback((start: string, end: string): string => {
    return `${start.toLowerCase().trim()}|${end.toLowerCase().trim()}`;
  }, []);

  const getCachedRoute = useCallback((start: string, end: string): RouteOption[] | null => {
    const key = getCacheKey(start, end);
    const cached = cache.get(key);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.routes;
    }
    
    return null;
  }, [cache, getCacheKey]);

  const setCachedRoute = useCallback((start: string, end: string, routes: RouteOption[]) => {
    const key = getCacheKey(start, end);
    const newCache = new Map(cache);
    newCache.set(key, {
      start,
      end,
      routes,
      timestamp: Date.now()
    });
    setCache(newCache);
  }, [cache, getCacheKey]);

  // Enhanced route finding with better variety
  const findRoutes = useCallback(async (
    startLoc: google.maps.LatLng,
    endLoc: google.maps.LatLng
  ): Promise<RouteOption[]> => {
    const directionsService = new window.google.maps.DirectionsService();
    const routes: RouteOption[] = [];
    
    // Get the default Google route
    try {
      const defaultRoute = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
        directionsService.route({
          origin: startLoc,
          destination: endLoc,
          travelMode: window.google.maps.TravelMode.BICYCLING,
          avoidHighways: true,
          avoidFerries: true
        }, (result, status) => {
          if (status === "OK" && result) {
            resolve(result);
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        });
      });

      const defaultPath: google.maps.LatLng[] = [];
      defaultRoute.routes[0].overview_path.forEach(point => {
        defaultPath.push(point);
      });
      
      const defaultElevations = await getElevationData(defaultPath);
      const defaultMetrics = calculateElevationMetrics(defaultElevations);
      const defaultSteps = await calculateStepsWithElevation(defaultRoute, defaultPath, defaultElevations);

      routes.push({
        id: "default",
        name: "Google's Recommended Route",
        description: "The route Google Maps recommends for cycling",
        directions: defaultRoute,
        elevationGain: defaultMetrics.totalGain,
        elevationLoss: defaultMetrics.totalLoss,
        totalDistance: defaultRoute.routes[0].legs[0].distance?.value || 0,
        steps: defaultSteps,
        maxGrade: defaultMetrics.maxGrade,
        averageGrade: defaultMetrics.averageGrade
      });
    } catch (error) {
      console.error('Error getting default route:', error);
    }

    // Enhanced alternative route finding
    const alternativeRoutes = await findAlternativeRoutes(startLoc, endLoc, routes[0]?.elevationGain || 0);
    routes.push(...alternativeRoutes);

    return routes;
  }, [getElevationData, calculateElevationMetrics]);

  // Enhanced alternative route finding
  const findAlternativeRoutes = useCallback(async (
    startLoc: google.maps.LatLng,
    endLoc: google.maps.LatLng,
    baselineElevation: number
  ): Promise<RouteOption[]> => {
    const directionsService = new window.google.maps.DirectionsService();
    const routes: RouteOption[] = [];
    
    // Enhanced waypoint strategies
    const waypointStrategies = [
      // Flat areas strategy
      {
        name: "Minimum Elevation Route",
        description: "Optimized for flat terrain",
        waypoints: [
          { location: new window.google.maps.LatLng(37.7952, -122.4029) }, // Embarcadero
          { location: new window.google.maps.LatLng(37.7700, -122.3900) }, // Mission Bay
          { location: new window.google.maps.LatLng(37.8025, -122.4358) }, // Marina
          { location: new window.google.maps.LatLng(37.7924, -122.4012) }  // Financial District
        ]
      },
      // Moderate elevation strategy
      {
        name: "Balanced Route",
        description: "Moderate elevation with good cycling infrastructure",
        waypoints: [
          { location: new window.google.maps.LatLng(37.7767, -122.4347) }, // Hayes Valley
          { location: new window.google.maps.LatLng(37.7722, -122.4347) }, // Lower Haight
          { location: new window.google.maps.LatLng(37.7697, -122.4347) }, // Duboce Triangle
          { location: new window.google.maps.LatLng(37.7767, -122.4347) }  // Western Addition
        ]
      },
      // Scenic route strategy
      {
        name: "Scenic Route",
        description: "More scenic path with moderate hills",
        waypoints: [
          { location: new window.google.maps.LatLng(37.8025, -122.4358) }, // Marina
          { location: new window.google.maps.LatLng(37.8099, -122.4104) }, // North Beach
          { location: new window.google.maps.LatLng(37.8025, -122.4358) }, // Fisherman's Wharf
          { location: new window.google.maps.LatLng(37.7952, -122.4029) }  // Embarcadero
        ]
      }
    ];

    for (const strategy of waypointStrategies) {
      try {
        const routeOptions = [
          { avoidHighways: true, avoidFerries: true, waypoints: [strategy.waypoints[0]] },
          { avoidHighways: true, avoidFerries: true, waypoints: [strategy.waypoints[1]] },
          { avoidHighways: true, avoidFerries: true, waypoints: [strategy.waypoints[0], strategy.waypoints[1]] },
          { avoidHighways: true, avoidFerries: true, region: "us", waypoints: [strategy.waypoints[0]] }
        ];

        let bestRoute: google.maps.DirectionsResult | null = null;
        let bestElevation = strategy.name.includes("Minimum") ? Infinity : baselineElevation;

        for (const options of routeOptions) {
          try {
            const result = await new Promise<google.maps.DirectionsResult | null>((resolve, reject) => {
              directionsService.route({
                origin: startLoc,
                destination: endLoc,
                travelMode: window.google.maps.TravelMode.BICYCLING,
                ...options
              }, async (result: google.maps.DirectionsResult | null, status: google.maps.DirectionsStatus) => {
                if (status === "OK" && result) {
                  try {
                    const path: google.maps.LatLng[] = [];
                    result.routes[0].overview_path.forEach(point => {
                      path.push(point);
                    });

                    const elevations = await getElevationData(path);
                    const metrics = calculateElevationMetrics(elevations);
                    
                    const isBetter = strategy.name.includes("Minimum") 
                      ? metrics.totalGain < bestElevation
                      : Math.abs(metrics.totalGain - baselineElevation) < Math.abs(bestElevation - baselineElevation);

                    if (isBetter) {
                      bestElevation = metrics.totalGain;
                      bestRoute = result;
                    }
                    resolve(null);
                  } catch (error) {
                    reject(error);
                  }
                } else {
                  resolve(null);
                }
              });
            });

            if (bestRoute) break;
          } catch (error) {
            console.error('Error trying route option:', error);
            continue;
          }
        }

        if (bestRoute) {
          const path: google.maps.LatLng[] = [];
          (bestRoute as google.maps.DirectionsResult).routes[0].overview_path.forEach((point: google.maps.LatLng) => {
            path.push(point);
          });
          
          const elevations = await getElevationData(path);
          const metrics = calculateElevationMetrics(elevations);
          const steps = await calculateStepsWithElevation(bestRoute as google.maps.DirectionsResult, path, elevations);

          routes.push({
            id: strategy.name.toLowerCase().replace(/\s+/g, '-'),
            name: strategy.name,
            description: strategy.description,
            directions: bestRoute as google.maps.DirectionsResult,
            elevationGain: metrics.totalGain,
            elevationLoss: metrics.totalLoss,
            totalDistance: (bestRoute as google.maps.DirectionsResult).routes[0].legs[0].distance?.value || 0,
            steps: steps,
            maxGrade: metrics.maxGrade,
            averageGrade: metrics.averageGrade
          });
        }
      } catch (error) {
        console.error(`Error finding ${strategy.name}:`, error);
      }
    }

    return routes;
  }, [getElevationData, calculateElevationMetrics]);

  // Enhanced step calculation with elevation
  const calculateStepsWithElevation = useCallback(async (
    result: google.maps.DirectionsResult,
    path: google.maps.LatLng[],
    elevations: number[]
  ): Promise<StepWithElevation[]> => {
    return result.routes[0].legs[0].steps.map(step => {
      const stepPath = step.path;
      const stepStartIndex = path.findIndex(p => 
        p.lat() === stepPath[0].lat() && p.lng() === stepPath[0].lng()
      );
      const stepEndIndex = path.findIndex(p => 
        p.lat() === stepPath[stepPath.length - 1].lat() && 
        p.lng() === stepPath[stepPath.length - 1].lng()
      );

      const stepElevations = elevations.slice(stepStartIndex, stepEndIndex + 1);
      const stepMetrics = calculateElevationMetrics(stepElevations);
      const distance = step.distance?.value || 0; // in meters
      const grade = distance === 0 ? 0 : (stepMetrics.totalGain / distance) * 100;

      return {
        ...step,
        elevation: stepMetrics.totalGain,
        grade: Math.round(grade * 10) / 10,
        maxGrade: stepMetrics.maxGrade
      };
    });
  }, [calculateElevationMetrics]);

  // Enhanced form submission with caching and better error handling
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!isLoaded) {
      setError("Please wait for the map to load");
      return;
    }

    if (!start.trim() || !end.trim()) {
      setError("Please enter both start and destination locations");
      return;
    }

    setLoading(true);
    setError(null);
    setRouteOptions([]);
    setSelectedRoute(null);
    
    try {
      // Check cache first
      const cachedRoutes = getCachedRoute(start, end);
      if (cachedRoutes) {
        setRouteOptions(cachedRoutes);
        setSelectedRoute(cachedRoutes[0].id);
        setLoading(false);
        return;
      }

      // Create geocoder instance
      const geocoder = new window.google.maps.Geocoder();
      
      // Enhanced geocoding with better error handling
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
              reject(new Error(`Could not find location: "${address}". Please check the spelling and try again.`));
            }
          });
        });
      };

      const [startLoc, endLoc] = await Promise.all([
        geocode(start),
        geocode(end)
      ]);

      const routes = await findRoutes(startLoc, endLoc);
      
      if (routes.length === 0) {
        throw new Error("No routes found between these locations");
      }

      setRouteOptions(routes);
      setSelectedRoute(routes[0].id);
      
      // Cache the results
      setCachedRoute(start, end, routes);
      
    } catch (err) {
      console.error('Error in handleSubmit:', err);
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  }, [isLoaded, start, end, getCachedRoute, setCachedRoute, findRoutes]);

  // Memoized map center calculation
  const mapCenter = useMemo(() => {
    const selectedRouteOption = routeOptions.find(r => r.id === selectedRoute);
    return selectedRouteOption?.directions?.routes[0]?.legs[0]?.start_location || SF_CENTER;
  }, [routeOptions, selectedRoute]);

  // Enhanced error display
  if (loadError) {
    return (
      <div style={{ 
        maxWidth: 700, 
        margin: "2rem auto", 
        padding: 16,
        textAlign: "center",
        color: "#dc3545"
      }}>
        <h2>Error Loading Maps</h2>
        <p>Unable to load Google Maps. Please check your internet connection and try again.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800, margin: "2rem auto", padding: 16 }}>
      <h1 style={{ textAlign: "center", marginBottom: "2rem", color: "#2c3e50" }}>
        🚴 San Francisco Bike Directions
      </h1>
      
      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
            Start Location:
          </label>
          <input
            type="text"
            value={start}
            onChange={e => setStart(e.target.value)}
            required
            disabled={!isLoaded || loading}
            style={{ 
              width: "100%", 
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: "16px"
            }}
            placeholder="e.g. Market St & 5th St, San Francisco"
          />
        </div>
        
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 8, fontWeight: "bold" }}>
            Destination:
          </label>
          <input
            type="text"
            value={end}
            onChange={e => setEnd(e.target.value)}
            required
            disabled={!isLoaded || loading}
            style={{ 
              width: "100%", 
              padding: "12px",
              border: "1px solid #ddd",
              borderRadius: "6px",
              fontSize: "16px"
            }}
            placeholder="e.g. Valencia St & 16th St, San Francisco"
          />
        </div>
        
        <button 
          type="submit" 
          disabled={!isLoaded || loading} 
          style={{ 
            width: "100%",
            padding: "14px",
            backgroundColor: loading ? "#6c757d" : "#007bff",
            color: "white",
            border: "none",
            borderRadius: "6px",
            fontSize: "16px",
            fontWeight: "bold",
            cursor: loading ? "not-allowed" : "pointer",
            transition: "background-color 0.2s"
          }}
        >
          {!isLoaded ? "Loading Maps..." : loading ? "Finding Routes..." : "🚴 Get Bike Directions"}
        </button>
      </form>

      {error && (
        <div style={{ 
          padding: "12px", 
          backgroundColor: "#f8d7da", 
          color: "#721c24", 
          border: "1px solid #f5c6cb",
          borderRadius: "6px",
          marginBottom: 16
        }}>
          {error}
        </div>
      )}

      {routeOptions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ marginBottom: 16, color: "#2c3e50" }}>Route Options</h3>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '1rem', 
            marginBottom: '1rem' 
          }}>
            {routeOptions.map(route => (
              <button
                key={route.id}
                onClick={() => setSelectedRoute(route.id)}
                style={{
                  padding: '1rem',
                  backgroundColor: selectedRoute === route.id ? '#007bff' : '#f8f9fa',
                  color: selectedRoute === route.id ? 'white' : '#2c3e50',
                  border: '2px solid',
                  borderColor: selectedRoute === route.id ? '#007bff' : '#dee2e6',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '0.5rem' }}>
                  {route.name}
                </div>
                <div style={{ fontSize: '0.9em', marginBottom: '0.5rem' }}>
                  {route.description}
                </div>
                <div style={{ fontSize: '0.8em', opacity: 0.8 }}>
                  📈 {route.elevationGain}m gain • 📉 {route.elevationLoss}m loss
                </div>
                <div style={{ fontSize: '0.8em', opacity: 0.8 }}>
                  🛣️ {(route.totalDistance / 1000).toFixed(1)}km • ⚡ Max grade: {route.maxGrade}%
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {isLoaded && (
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={mapCenter}
          zoom={13}
          options={{
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }]
              }
            ]
          }}
        >
          {routeOptions.find(r => r.id === selectedRoute)?.directions && (
            <DirectionsRenderer
              directions={routeOptions.find(r => r.id === selectedRoute)?.directions || undefined}
              options={{
                suppressMarkers: false,
                polylineOptions: {
                  strokeColor: "#FF0000",
                  strokeWeight: 6,
                  strokeOpacity: 0.8
                }
              }}
            />
          )}
        </GoogleMap>
      )}

      {routeOptions.find(r => r.id === selectedRoute)?.steps && (
        <div style={{ marginTop: 24 }}>
          <h2 style={{ color: "#2c3e50", marginBottom: 16 }}>Turn-by-Turn Directions</h2>
          <ol style={{ paddingLeft: 20 }}>
            {routeOptions.find(r => r.id === selectedRoute)!.steps.map((step: StepWithElevation, idx: number) => (
              <li key={idx} style={{ marginBottom: 12 }}>
                <div dangerouslySetInnerHTML={{ __html: step.instructions }} />
                {step.elevation && step.elevation > 0 && (
                  <div style={{ 
                    fontSize: '0.9em', 
                    color: '#666', 
                    marginTop: 4,
                    padding: '4px 8px',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '4px',
                    display: 'inline-block'
                  }}>
                    📈 +{step.elevation}m elevation
                    {step.grade && step.grade > 0 && ` (${step.grade}% grade)`}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
