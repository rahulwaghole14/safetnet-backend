import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../../utils/colors';

export const LeafletMap = React.forwardRef<WebView, {
  latitude: number;
  longitude: number;
  officerLatitude?: number;
  officerLongitude?: number;
  zoom?: number;
  height?: number;
  showMarker?: boolean;
  markerTitle?: string;
  polygonCoordinates?: Array<{
    latitude: number;
    longitude: number;
  }>;
  multiplePolygons?: Array<{
    id: string;
    name: string;
    coordinates: Array<{
      latitude: number;
      longitude: number;
    }>;
    color?: string;
  }>;
  mapKey?: string;
  autoFitBounds?: boolean;
  showRoute?: boolean;
  userMarkers?: Array<{
    id: string;
    username: string;
    latitude: number;
    longitude: number;
    updated_at?: string;
  }>;
}>(({
  latitude,
  longitude,
  officerLatitude,
  officerLongitude,
  zoom = 16,
  height = 300,
  showMarker = true,
  markerTitle = 'Location',
  polygonCoordinates,
  multiplePolygons,
  mapKey,
  autoFitBounds = true,
  showRoute = false,
  userMarkers = []
}, ref) => {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const webViewRef = useRef<WebView>(null);

  // Forward the ref to the parent
  useImperativeHandle(ref, () => webViewRef.current!, []);

  // Create inline HTML with Leaflet
  const generateMapHTML = () => {
    console.log('Generating map HTML for coordinates:', latitude, longitude);
    console.log('Officer coordinates:', officerLatitude, officerLongitude);
    console.log('Multiple polygons count:', multiplePolygons?.length || 0);

    // Process single polygon coordinates (backward compatibility)
    console.log('🔍 LEAFLET DEBUG: polygonCoordinates received:', polygonCoordinates);
    console.log('🔍 LEAFLET DEBUG: polygonCoordinates length:', polygonCoordinates?.length || 0);
    console.log('🔍 LEAFLET DEBUG: polygonCoordinates sample:', polygonCoordinates?.slice(0, 3));
    
    const polygonCoordsString = polygonCoordinates && polygonCoordinates.length >= 3
      ? polygonCoordinates.map(coord => `[${coord.latitude}, ${coord.longitude}]`).join(',')
      : '';
      
    console.log('🔍 LEAFLET DEBUG: polygonCoordsString:', polygonCoordsString);
    console.log('🔍 LEAFLET DEBUG: will render polygon?', !!polygonCoordsString);

    // Process multiple polygons
    const multiplePolygonsJS = multiplePolygons && multiplePolygons.length > 0
      ? multiplePolygons.map(polygon => {
          console.log('🗺️ Processing polygon:', polygon.name, 'with', polygon.coordinates.length, 'points');
          const coordsString = polygon.coordinates.length >= 3
            ? polygon.coordinates.map(coord => `[${coord.latitude}, ${coord.longitude}]`).join(',')
            : '';
          console.log('🗺️ Coords string for', polygon.name, ':', coordsString);
          const color = polygon.color || '#3388ff';
          
          return `
            console.log('🗺️ Adding polygon:', '${polygon.name || "Assigned Zone"}', 'with coords:', [${coordsString}]);
            var polyId = '${polygon.id || Math.random().toString(36).substr(2, 9)}';
            var polygonObj = L.polygon([${coordsString}], {
              color: '${color}',
              fillColor: '${color}',
              fillOpacity: 0.2,
              weight: 2
            }).addTo(map);
            
            polygonObj.bindPopup('<div style="font-family: Arial, sans-serif;"><strong>${polygon.name || "Assigned Zone"}</strong><br/>Type: Assigned Zone</div>');
            
            // Add zone label if polygon is valid
            try {
              var bounds = polygonObj.getBounds();
              if (bounds.isValid()) {
                var center = bounds.getCenter();
                if (center && typeof center.lat === 'number' && typeof center.lng === 'number') {
                  L.marker([center.lat, center.lng], {
                    icon: L.divIcon({
                      html: '<div style="background: ${color}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; white-space: nowrap;">${polygon.name || "Assigned Zone"}</div>',
                      className: 'zone-label',
                      iconSize: [80, 16],
                      iconAnchor: [40, 8]
                    })
                  }).addTo(map);
                }
              }
            } catch (e) {
              console.warn('⚠️ Could not add label for polygon:', polyId, e);
            }
            console.log('✅ Polygon added:', '${polygon.name || "Assigned Zone"}');
          `;
        }).join('\n')
      : '';
      
    // Process user markers
    const userMarkersJS = userMarkers && userMarkers.length > 0
      ? userMarkers.map(user => {
          // Ensure coordinates are valid numbers before generating JS and clamp to precision
          const lat = typeof user.latitude === 'number' ? user.latitude : parseFloat(String(user.latitude));
          const lon = typeof user.longitude === 'number' ? user.longitude : parseFloat(String(user.longitude));
          
          if (isNaN(lat) || isNaN(lon)) return '';

          return `
            console.log('📍 Adding user marker for ${user.username} at [${lat}, ${lon}]');
            var userMarker = L.marker([${lat}, ${lon}], {
                icon: L.divIcon({
                    className: 'user-marker-icon',
                    html: "<div class='user-pulse'></div><div style='background-color: #10b981; width: 22px; height: 22px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white; font-size: 12px; font-weight: bold;'>👤</div>",
                    iconSize: [22, 22],
                    iconAnchor: [11, 11]
                }),
                riseOnHover: true,
                zIndexOffset: 2000
            }).addTo(map);
            
            // Add a permanent label if username exists
            L.marker([${lat}, ${lon}], {
                icon: L.divIcon({
                    className: 'user-label-icon',
                    html: "<div class='user-label'>${user.username}</div>",
                    iconSize: [100, 20],
                    iconAnchor: [50, -15]
                }),
                interactive: false,
                zIndexOffset: 2000
            }).addTo(map);

            userMarker.bindPopup('<div style="font-family: sans-serif; padding: 5px;">' +
              '<b style="color: #10b981; font-size: 14px;">👤 User: ${user.username}</b><br/>' +
              '<hr style="margin: 5px 0; border: none; border-top: 1px solid #eee;" />' +
              '<b>Coordinates:</b> ${lat.toFixed(6)}, ${lon.toFixed(6)}' + 
              '${user.updated_at ? `<br/><b>Last Seen:</b> ${new Date(user.updated_at).toLocaleTimeString()}` : ""}' +
              '</div>');
          `;
        }).join('\n')
      : '';

    // Determine if we should auto-fit bounds
    const shouldAutoFit = autoFitBounds && officerLatitude && officerLongitude;

    // Create HTML with embedded Leaflet CSS and JS
    const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Leaflet Map</title>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        #map {
            height: 100vh;
            width: 100vw;
        }
        .leaflet-control-attribution {
            background-color: rgba(255, 255, 255, 0.8);
            font-size: 10px;
        }
        .loading-text {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            text-align: center;
            color: #0369a1;
            font-size: 18px;
            font-weight: bold;
            z-index: 1000;
        }
        @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.4); opacity: 0.5; }
            100% { transform: scale(1); opacity: 1; }
        }
        .user-pulse {
            background-color: rgba(16, 185, 129, 0.4);
            border-radius: 50%;
            position: absolute;
            top: -6px;
            left: -6px;
            width: 30px;
            height: 30px;
            animation: pulse 2s infinite;
            z-index: -1;
        }
        .user-label {
            background: rgba(255, 255, 255, 0.9);
            border-radius: 4px;
            padding: 2px 6px;
            border: 1px solid #10b981;
            font-size: 10px;
            font-weight: bold;
            color: #065f46;
            white-space: nowrap;
            box-shadow: 0 1px 3px rgba(0,0,0,0.2);
            pointer-events: none;
        }
        .user-marker-icon {
            z-index: 1000 !important;
        }
        .user-label-icon {
            z-index: 1001 !important;
        }
    </style>
</head>
<body>
    <div id="map">
        <div class="loading-text">
            🗺️ Loading Map...<br>
            <small>Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}</small>
        </div>
    </div>

    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
        console.log('Initializing Leaflet map...');

        var map = null;
        var alertMarker = null;
        var officerMarker = null;

        function initMap() {
            try {
                console.log('Creating Leaflet map...');

                // Clear loading message
                var mapDiv = document.getElementById('map');
                if (mapDiv) {
                    var loadingDiv = mapDiv.querySelector('.loading-text');
                    if (loadingDiv) {
                        loadingDiv.style.display = 'none';
                    }
                }

                // Initialize map
                var initialCenter = [${latitude}, ${longitude}];
                map = L.map('map', {
                    center: initialCenter,
                    zoom: ${zoom},
                    zoomControl: true
                });

                // Add tile layer
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap contributors',
                    maxZoom: 19
                }).addTo(map);

                // Add polygon if coordinates provided (backward compatibility)
                ${polygonCoordsString ? `
                var coords = [${polygonCoordsString}];
                console.log('🗺️ Adding polygon with coords:', coords);
                
                // Add the main polygon with enhanced visibility (no corner markers)
                var polygon = L.polygon(coords, {
                    color: '#ff0000',      // Bright red border
                    fillColor: '#ff0000',  // Red fill
                    fillOpacity: 0.3,      // More visible fill
                    weight: 4,             // Thicker border
                    opacity: 1.0           // Full opacity
                }).addTo(map);
                
                console.log('✅ Enhanced polygon added without corner markers');
                ` : ''}

                // Add multiple polygons if provided
                ${multiplePolygonsJS ? `
                ${multiplePolygonsJS}
                console.log('Multiple geofence polygons added');
                ` : ''}

                // Add user markers from area last to ensure they are on top
                ${userMarkersJS ? `
                ${userMarkersJS}
                console.log('User markers added to map area');
                ` : ''}

                // Add alert marker (red)
                alertMarker = L.marker([${latitude}, ${longitude}], {
                    icon: L.divIcon({
                        className: 'custom-div-icon',
                        html: "<div style='background-color: #dc2626; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);'></div>",
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                    })
                }).addTo(map);
                alertMarker.bindPopup('<b>🔴 Alert Location</b><br/>${markerTitle}<br/>Lat: ${latitude.toFixed(6)}<br/>Lng: ${longitude.toFixed(6)}');

                // Add officer marker (blue) if coordinates provided
                ${officerLatitude && officerLongitude ? `
                officerMarker = L.marker([${officerLatitude}, ${officerLongitude}], {
                    icon: L.divIcon({
                        className: 'custom-div-icon',
                        html: "<div style='background-color: #2563eb; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);'></div>",
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                    })
                }).addTo(map);
                officerMarker.bindPopup('<b>🔵 Your Location</b><br/>Lat: ${officerLatitude.toFixed(6)}<br/>Lng: ${officerLongitude.toFixed(6)}');
                ` : ''}

                // Auto-fit bounds to show both markers
                ${shouldAutoFit ? `
                var group = new L.featureGroup([alertMarker]);
                if (officerMarker) {
                    group.addLayer(officerMarker);
                }
                map.fitBounds(group.getBounds().pad(0.1));
                console.log('Map auto-fitted to show both markers');
                ` : ''}

                // Add route (OSRM) if showRoute is true and we have both markers
                ${showRoute && officerLatitude && officerLongitude ? `
                console.log('🗺️ Fetching OSRM route...');
                var start = [${officerLongitude}, ${officerLatitude}];
                var end = [${longitude}, ${latitude}];
                var url = 'https://router.project-osrm.org/route/v1/driving/' + start[0] + ',' + start[1] + ';' + end[0] + ',' + end[1] + '?overview=full&geometries=geojson';
                
                fetch(url)
                    .then(response => response.json())
                    .then(data => {
                        if (data.code === 'Ok' && data.routes && data.routes[0]) {
                            var routeData = data.routes[0].geometry;
                            var polyline = L.geoJSON(routeData, {
                                style: {
                                    color: '#2563eb', // Blue route line
                                    weight: 6,
                                    opacity: 0.7,
                                    lineJoin: 'round'
                                }
                            }).addTo(map);
                            
                            // Adjust bounds to include the route
                            map.fitBounds(polyline.getBounds().pad(0.2));
                            console.log('✅ Route line added to map');
                        } else {
                            console.warn('⚠️ OSRM Route failed:', data.code);
                        }
                    })
                    .catch(err => console.error('❌ OSRM Fetch Error:', err));
                ` : ''}

                window.mapInstance = map;
                window.updateOfficerMarker = function(lat, lng) {
                    if (officerMarker) {
                        officerMarker.setLatLng([lat, lng]);
                        console.log('Officer marker updated to:', lat, lng);
                        
                        // Auto-fit bounds if needed
                        ${shouldAutoFit ? `
                        var group = new L.featureGroup([alertMarker, officerMarker]);
                        map.fitBounds(group.getBounds().pad(0.1));
                        ` : ''}
                    } else {
                        // Create officer marker if it doesn't exist
                        officerMarker = L.marker([lat, lng], {
                            icon: L.divIcon({
                                className: 'custom-div-icon',
                                html: "<div style='background-color: #2563eb; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);'></div>",
                                iconSize: [16, 16],
                                iconAnchor: [8, 8]
                            })
                        }).addTo(map);
                        officerMarker.bindPopup('<b>🔵 Your Location</b><br/>Lat: ' + lat.toFixed(6) + '<br/>Lng: ' + lng.toFixed(6));
                        
                        // Auto-fit bounds
                        ${shouldAutoFit ? `
                        var group = new L.featureGroup([alertMarker, officerMarker]);
                        map.fitBounds(group.getBounds().pad(0.1));
                        ` : ''}
                    }
                };

                // Notify React Native that map is loaded
                if (window.ReactNativeWebView) {
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type: 'mapLoaded'
                    }));
                }

                console.log('✅ Map loaded successfully');

            } catch (error) {
                console.error('❌ Map initialization failed:', error);

                var mapDiv = document.getElementById('map');
                if (mapDiv) {
                    mapDiv.innerHTML = '<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; color: #dc2626; padding: 20px;"><b>🗺️ Map Error</b><br><small>' + error.message + '</small><br><small>Please check your internet connection</small></div>';
                }
            }
        }

        // Initialize map
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initMap);
        } else {
            setTimeout(initMap, 100);
        }

        // Handle messages from React Native
        window.addEventListener('message', function(event) {
            try {
                var data = JSON.parse(event.data);
                console.log('📨 Message received:', data.type);

                if (data.type === 'updateOfficerMarker' && map) {
                    console.log('📍 Updating officer location:', data.latitude, data.longitude);
                    
                    // Use the global updateOfficerMarker function
                    if (window.updateOfficerMarker) {
                        window.updateOfficerMarker(data.latitude, data.longitude);
                    } else {
                        console.error('❌ updateOfficerMarker function not available');
                    }
                }

                if (data.type === 'centerOnGeofence') {
                    console.log('📨 Received centerOnGeofence message:', data);
                    console.log('🗺️ Map instance available:', !!map);
                    console.log('📍 Center coordinates:', data.center);

                    if (!map) {
                        console.log('❌ Map not initialized yet');
                        return;
                    }

                    if (!data.center || typeof data.center.latitude !== 'number' || typeof data.center.longitude !== 'number') {
                        console.log('❌ Invalid center coordinates:', data.center);
                        return;
                    }

                    try {
                        console.log('🎯 Setting map view to:', [data.center.latitude, data.center.longitude], 'zoom:', data.zoom || 15);
                        map.setView([data.center.latitude, data.center.longitude], data.zoom || 15);
                        console.log('✅ Map successfully centered on geofence');

                        // Optional: Add a marker at center for debugging
                        if (window.debugCenterMarker) {
                            map.removeLayer(window.debugCenterMarker);
                        }
                        window.debugCenterMarker = L.marker([data.center.latitude, data.center.longitude], {
                            icon: L.divIcon({
                                html: '<div style="background: blue; width: 10px; height: 10px; border-radius: 50%; border: 2px solid white;"></div>',
                                className: 'debug-center-marker',
                                iconSize: [14, 14],
                                iconAnchor: [7, 7]
                            })
                        }).addTo(map);

                    } catch (error) {
                        console.error('❌ Error centering map:', error);
                    }
                }

                if (data.type === 'centerOnOfficer' && map && data.center) {
                    console.log('👮 Centering map on officer location:', data.center, 'zoom:', data.zoom);
                    map.setView([data.center.latitude, data.center.longitude], data.zoom || 16);
                }
            } catch (error) {
                console.error('❌ Message handling error:', error);
            }
        });

        // Send initial loaded message
        setTimeout(function() {
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'loaded'
                }));
            }
        }, 500);
    </script>
</body>
</html>`;

    return html;
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      console.log('LeafletMap message:', data);
      if (data.type === 'mapLoaded') {
        setIsLoading(false);
        console.log('✅ Map loaded successfully');
      } else if (data.type === 'loaded') {
        console.log('✅ HTML document loaded');
      } else if (data.type === 'error') {
        console.error('❌ Map error:', data.message);
        setHasError(true);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('LeafletMap message parsing error:', error);
      console.log('LeafletMap raw message:', event.nativeEvent.data);
    }
  };

  const handleLoadEnd = () => {
    console.log('WebView load ended');
    // Fallback: hide loading after a timeout in case map load message isn't received
    setTimeout(() => {
      setIsLoading(false);
      console.log('Loading timeout reached, hiding loading indicator');
    }, 3000);
  };

  const handleError = (error: any) => {
    console.error('WebView error:', error);
    setHasError(true);
    setIsLoading(false);
  };

  return (
    <View style={[styles.container, { height }]}>
      {isLoading && !hasError && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.placeholderText}>Map Loading...</Text>
          <Text style={styles.placeholderSubtext}>
            Coordinates: {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </Text>
        </View>
      )}
      {hasError && (
        <View style={styles.loadingContainer}>
          <Text style={styles.placeholderText}>Map Failed to Load</Text>
          <Text style={styles.placeholderSubtext}>
            Check internet connection and try again
          </Text>
        </View>
      )}
      {!hasError && (
        <WebView
          ref={webViewRef}
          source={{ html: generateMapHTML() }}
          style={[styles.webview, { height }]}
          onMessage={handleMessage}
          onLoadEnd={handleLoadEnd}
          onError={handleError}
          onHttpError={handleError}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          scalesPageToFit={false}
          mixedContentMode="compatibility"
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          originWhitelist={['*']}
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={true}
          allowFileAccessFromFileURLs={true}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
        />
      )}
    </View>
  );
});

LeafletMap.displayName = 'LeafletMap';

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.lightGrayBg,
  },
  webview: {
    flex: 1,
    backgroundColor: colors.lightGrayBg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.lightGrayBg,
  },
  placeholderText: {
    marginTop: 16,
    fontSize: 18,
    fontWeight: '600',
    color: colors.darkText,
  },
  placeholderSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: colors.mediumText,
    textAlign: 'center',
    fontFamily: 'monospace',
  },
});