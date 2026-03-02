package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

var (
	db *gorm.DB
)

// ── Database Models ──

type RouteCache struct {
	ID        uint      `gorm:"primaryKey"`
	StartID   string    `gorm:"index:idx_route_pair"`
	EndID     string    `gorm:"index:idx_route_pair"`
	Data      []byte    `gorm:"type:jsonb"`
	CreatedAt time.Time
}

// ── Shared Types ──

type Feature struct {
	Type       string                 `json:"type"`
	Properties map[string]interface{} `json:"properties"`
	Geometry   interface{}            `json:"geometry"`
}

type FeatureCollection struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
}

type EnhancedRoute struct {
	Geometry   FeatureCollection `json:"geometry"`
	Distance   float64           `json:"distance"`
	Duration   float64           `json:"duration"`
	Label      string            `json:"label"`
	FullCoords [][2]float64      `json:"full_coords"`
}

type EnhancedResponse struct {
	Routes []EnhancedRoute `json:"routes"`
}

type Location struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

var locations = []Location{
	// Major Cities
	{"phx", "Phoenix Downtown", 33.4484, -112.0740},
	{"scottsdale", "Scottsdale Old Town", 33.4942, -111.9261},
	{"tempe", "Tempe (ASU)", 33.4255, -111.9400},
	{"mesa", "Mesa Arts Center", 33.4152, -111.8315},
	{"chandler", "Chandler Fashion", 33.3032, -111.9224},
	{"gilbert", "Gilbert Heritage", 33.3528, -111.7890},
	{"glendale", "Glendale Stadium", 33.5387, -112.1860},
	{"peoria", "Peoria Sports", 33.5806, -112.2374},
	{"tucson", "Tucson", 32.2226, -110.9747},
	{"flagstaff", "Flagstaff", 35.1983, -111.6513},
	{"sedona", "Sedona", 34.8697, -111.7610},
	{"grand-canyon", "Grand Canyon Village", 36.0544, -112.1401},
	{"yuma", "Yuma", 32.6927, -114.6277},
	{"kingman", "Kingman", 35.1894, -114.0530},
	{"show-low", "Show Low", 34.2542, -110.0298},
	{"payson", "Payson", 34.2309, -111.3251},
	{"surprise", "Surprise", 33.6292, -112.3679},
	{"goodyear", "Goodyear", 33.4353, -112.3583},
	{"buckeye", "Buckeye", 33.3703, -112.5838},
	{"maricopa", "Maricopa", 33.0581, -112.0476},
	{"casa-grande", "Casa Grande", 32.8795, -111.7573},
	{"sierra-vista", "Sierra Vista", 31.5545, -110.3037},
	{"prescott", "Prescott", 34.5400, -112.4685},
	{"lake-havasu", "Lake Havasu City", 34.5066, -114.2690},
	{"nogales", "Nogales", 31.3404, -110.9348},

	// Airports
	{"phx-airport", "Phoenix Sky Harbor (PHX)", 33.4373, -112.0078},
	{"tus-airport", "Tucson International (TUS)", 32.1161, -110.9410},
	{"flg-airport", "Flagstaff Pulliam (FLG)", 35.1385, -111.6711},
	{"mesa-gateway", "Mesa Gateway Airport (AZA)", 33.3078, -111.6553},

	// National Parks & Landmarks
	{"saguaro-east", "Saguaro National Park (East)", 32.1797, -110.7380},
	{"saguaro-west", "Saguaro National Park (West)", 32.2477, -111.1880},
	{"petrified-forest", "Petrified Forest NP", 34.9100, -109.7880},
	{"monument-valley", "Monument Valley", 36.9980, -110.0985},
	{"horseshoe-bend", "Horseshoe Bend", 36.8791, -111.5104},
	{"antelope-canyon", "Antelope Canyon (Page)", 36.8619, -111.3743},
	{"tombstone", "Tombstone", 31.7129, -110.0676},
	{"meteor-crater", "Meteor Crater", 35.0275, -111.0228},

	// Universities & Campuses
	{"asu-downtown", "ASU Downtown Phoenix", 33.4510, -112.0663},
	{"uofa", "University of Arizona", 32.2319, -110.9501},
	{"nau", "Northern Arizona University", 35.1889, -111.6543},
	{"gcu", "Grand Canyon University", 33.5086, -112.1258},

	// Regional Towns
	{"pinetop", "Pinetop-Lakeside", 34.1420, -109.9295},
	{"winslow", "Winslow", 35.0242, -110.6973},
	{"williams", "Williams", 35.2494, -112.1910},
	{"cottonwood", "Cottonwood", 34.7392, -112.0099},
	{"camp-verde", "Camp Verde", 34.5636, -111.8543},
	{"wickenburg", "Wickenburg", 33.9686, -112.7296},
	{"florence", "Florence", 33.0314, -111.3873},
	{"safford", "Safford", 32.8340, -109.7076},
	{"clifton", "Clifton", 33.0509, -109.2962},
	{"globe", "Globe", 33.3942, -110.7866},
	{"apache-jct", "Apache Junction", 33.4150, -111.5495},
	{"fountain-hills", "Fountain Hills", 33.6117, -111.7174},
	{"paradise-valley", "Paradise Valley", 33.5310, -111.9426},
	{"cave-creek", "Cave Creek", 33.8322, -111.9507},
	{"carefree", "Carefree", 33.8222, -111.9182},
}

func main() {
	// Initialize Database
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "host=localhost user=admin password=navifly dbname=navifly port=5432 sslmode=disable"
	}

	var err error
	for i := 0; i < 10; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		log.Printf("Waiting for database... (%d/10)", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}

	// Migrate schema
	db.AutoMigrate(&RouteCache{})

	// Pre-populate cache with REAL OSRM road geometry
	go preCalculateRealRoutes()

	log.Println("Routing service starting on :8080...")

	r := mux.NewRouter()
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}).Methods("GET")

	r.HandleFunc("/locations", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(locations)
	}).Methods("GET")

	r.HandleFunc("/osrm-route", HandleRoute).Methods("GET")
	r.HandleFunc("/route", HandleRoute).Methods("GET")

	// Add Root Handler for health checks
	r.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "NaviFly Routing Service Online 🛣️")
	}).Methods("GET")

	corsObj := handlers.CORS(
		handlers.AllowedOrigins([]string{"*"}),
		handlers.AllowedMethods([]string{"GET", "POST", "OPTIONS"}),
		handlers.AllowedHeaders([]string{"Content-Type", "Authorization"}),
	)

	log.Fatal(http.ListenAndServe(":8080", corsObj(r)))
}

func HandleRoute(w http.ResponseWriter, r *http.Request) {
	startID := r.URL.Query().Get("start")
	endID := r.URL.Query().Get("end")
	stopsParam := r.URL.Query().Get("stops") // comma-separated location IDs

	if startID == "" || endID == "" {
		http.Error(w, "Missing start or end parameter", http.StatusBadRequest)
		return
	}

	// If stops are provided, use multi-waypoint routing (skip cache)
	if stopsParam != "" {
		log.Printf("Multi-stop route: %s → [%s] → %s", startID, stopsParam, endID)
		resp, err := fetchMultiStopRoute(startID, endID, stopsParam)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
		return
	}

	// 1. Check DB Cache (only for direct A→B routes)
	var cached RouteCache
	if err := db.Where("start_id = ? AND end_id = ?", startID, endID).First(&cached).Error; err == nil {
		log.Printf("✅ DB hit: %s → %s", startID, endID)
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached.Data)
		return
	}

	// 2. Fetch from OSRM on cache miss
	log.Printf("DB miss. Fetching real route from OSRM: %s → %s", startID, endID)
	resp, err := fetchAndCacheRoute(startID, endID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// ── OSRM Integration ──

type OSRMResponse struct {
	Routes []struct {
		Geometry struct {
			Coordinates [][]float64 `json:"coordinates"`
		} `json:"geometry"`
		Distance float64 `json:"distance"`
		Duration float64 `json:"duration"`
	} `json:"routes"`
	Code string `json:"code"`
}

func findLocation(id string) (Location, bool) {
	for _, loc := range locations {
		if loc.ID == id {
			return loc, true
		}
	}
	return Location{}, false
}

func fetchMultiStopRoute(startID, endID, stopsParam string) (*EnhancedResponse, error) {
	startLoc, ok := findLocation(startID)
	if !ok {
		return nil, fmt.Errorf("unknown start location: %s", startID)
	}
	endLoc, ok := findLocation(endID)
	if !ok {
		return nil, fmt.Errorf("unknown end location: %s", endID)
	}

	// Build coordinate string: start;stop1;stop2;...;end
	coordParts := []string{fmt.Sprintf("%f,%f", startLoc.Lon, startLoc.Lat)}

	stopIDs := splitStops(stopsParam)
	for _, sid := range stopIDs {
		sLoc, ok := findLocation(sid)
		if !ok {
			log.Printf("⚠️ Unknown stop ID %s, skipping", sid)
			continue
		}
		coordParts = append(coordParts, fmt.Sprintf("%f,%f", sLoc.Lon, sLoc.Lat))
	}

	coordParts = append(coordParts, fmt.Sprintf("%f,%f", endLoc.Lon, endLoc.Lat))

	// Build OSRM URL with all waypoints
	coordStr := ""
	for i, p := range coordParts {
		if i > 0 {
			coordStr += ";"
		}
		coordStr += p
	}

	url := fmt.Sprintf(
		"http://router.project-osrm.org/route/v1/driving/%s?overview=full&geometries=geojson&alternatives=false",
		coordStr,
	)

	log.Printf("🗺️ Multi-stop OSRM URL: %s", url)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("OSRM multi-stop request failed: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read OSRM response: %v", err)
	}

	var osrmResp OSRMResponse
	if err := json.Unmarshal(body, &osrmResp); err != nil {
		return nil, fmt.Errorf("failed to parse OSRM response: %v", err)
	}

	if osrmResp.Code != "Ok" || len(osrmResp.Routes) == 0 {
		return nil, fmt.Errorf("OSRM returned no routes (code: %s)", osrmResp.Code)
	}

	// Build enhanced response
	enhancedResp := EnhancedResponse{Routes: []EnhancedRoute{}}

	for i, osrmRoute := range osrmResp.Routes {
		coords := make([][2]float64, len(osrmRoute.Geometry.Coordinates))
		for j, c := range osrmRoute.Geometry.Coordinates {
			coords[j] = [2]float64{c[0], c[1]}
		}

		fc := buildTrafficFeatureCollection(coords, i)

		enhancedResp.Routes = append(enhancedResp.Routes, EnhancedRoute{
			Geometry:   fc,
			Distance:   osrmRoute.Distance,
			Duration:   osrmRoute.Duration,
			Label:      "Multi-Stop Route",
			FullCoords: coords,
		})
	}

	log.Printf("✅ Multi-stop route: %d waypoints, %.1f km", len(coordParts), osrmResp.Routes[0].Distance/1000)
	return &enhancedResp, nil
}

func splitStops(s string) []string {
	var result []string
	for _, part := range splitString(s, ',') {
		trimmed := trimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func splitString(s string, sep byte) []string {
	var parts []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == sep {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

func trimSpace(s string) string {
	start, end := 0, len(s)
	for start < end && s[start] == ' ' {
		start++
	}
	for end > start && s[end-1] == ' ' {
		end--
	}
	return s[start:end]
}

func fetchOSRMRoute(startLon, startLat, endLon, endLat float64, alternatives bool) (*OSRMResponse, error) {
	altParam := "false"
	if alternatives {
		altParam = "true"
	}
	url := fmt.Sprintf(
		"http://router.project-osrm.org/route/v1/driving/%f,%f;%f,%f?overview=full&geometries=geojson&alternatives=%s",
		startLon, startLat, endLon, endLat, altParam,
	)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("OSRM request failed: %v", err)
	}
	defer resp.Body.Close()

	body, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read OSRM response: %v", err)
	}

	var osrmResp OSRMResponse
	if err := json.Unmarshal(body, &osrmResp); err != nil {
		return nil, fmt.Errorf("failed to parse OSRM response: %v", err)
	}

	if osrmResp.Code != "Ok" || len(osrmResp.Routes) == 0 {
		return nil, fmt.Errorf("OSRM returned no routes (code: %s)", osrmResp.Code)
	}

	return &osrmResp, nil
}

func fetchAndCacheRoute(startID, endID string) (*EnhancedResponse, error) {
	var startLoc, endLoc Location
	for _, loc := range locations {
		if loc.ID == startID {
			startLoc = loc
		}
		if loc.ID == endID {
			endLoc = loc
		}
	}

	if startLoc.ID == "" || endLoc.ID == "" {
		return nil, fmt.Errorf("unknown location ID")
	}

	osrmResp, err := fetchOSRMRoute(startLoc.Lon, startLoc.Lat, endLoc.Lon, endLoc.Lat, true)
	if err != nil {
		return nil, err
	}

	enhancedResp := EnhancedResponse{Routes: []EnhancedRoute{}}

	labels := []string{"Fastest", "Scenic Route", "Alternative"}
	speeds := []float64{90.0, 85.0, 80.0}

	for i, osrmRoute := range osrmResp.Routes {
		coords := make([][2]float64, len(osrmRoute.Geometry.Coordinates))
		for j, c := range osrmRoute.Geometry.Coordinates {
			coords[j] = [2]float64{c[0], c[1]} // [lon, lat]
		}

		fc := buildTrafficFeatureCollection(coords, i)

		label := "Alternative"
		if i < len(labels) {
			label = labels[i]
		}
		speed := speeds[0]
		if i < len(speeds) {
			speed = speeds[i]
		}

		enhancedResp.Routes = append(enhancedResp.Routes, EnhancedRoute{
			Geometry:   fc,
			Distance:   osrmRoute.Distance,
			Duration:   (osrmRoute.Distance / 1000.0 / speed) * 3600,
			Label:      label,
			FullCoords: coords,
		})
	}

	// Cache in DB
	data, _ := json.Marshal(enhancedResp)
	db.Create(&RouteCache{
		StartID: startID,
		EndID:   endID,
		Data:    data,
	})
	log.Printf("💾 Cached real OSRM route: %s → %s (%d coords)", startID, endID, len(osrmResp.Routes[0].Geometry.Coordinates))

	return &enhancedResp, nil
}

// ── Pre-calculation ──

func preCalculateRealRoutes() {
	log.Println("🚀 Starting pre-calculation with REAL OSRM road geometry...")

	// Clear old fake routes
	db.Where("1 = 1").Delete(&RouteCache{})
	log.Println("🗑️ Cleared old fake route cache")

	count := 0
	failed := 0

	for i, l1 := range locations {
		for j, l2 := range locations {
			if l1.ID == l2.ID {
				continue
			}

			// Rate limit: OSRM demo server allows ~1 req/sec
			time.Sleep(1100 * time.Millisecond)

			_, err := fetchAndCacheRoute(l1.ID, l2.ID)
			if err != nil {
				log.Printf("⚠️ Failed %s → %s: %v", l1.ID, l2.ID, err)
				failed++
				continue
			}
			count++
			log.Printf("📍 [%d/%d] Cached: %s → %s", count, len(locations)*(len(locations)-1), l1.ID, l2.ID)

			// Log progress every batch
			if count%25 == 0 {
				total := len(locations) * (len(locations) - 1)
				pct := float64(count+failed) / float64(total) * 100
				log.Printf("📊 Progress: %.1f%% (%d cached, %d failed)", pct, count, failed)
			}

			_ = i
			_ = j
		}
	}

	log.Printf("✅ Pre-calculation complete! %d routes cached, %d failed.", count, failed)
}

// ── Traffic Segmentation ──

func buildTrafficFeatureCollection(coords [][2]float64, routeIndex int) FeatureCollection {
	fc := FeatureCollection{Type: "FeatureCollection", Features: make([]Feature, 0)}

	if len(coords) < 2 {
		return fc
	}

	// Calculate total distance for realistic segment sizing
	totalDist := 0.0
	for i := 0; i < len(coords)-1; i++ {
		totalDist += haversine(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0])
	}

	// Target ~2-5 km per traffic segment for realistic look
	targetSegmentDist := 3.0 // km
	if totalDist < 20 {
		targetSegmentDist = 1.0
	} else if totalDist > 200 {
		targetSegmentDist = 8.0
	}

	// Congestion patterns (weighted toward low for highway driving)
	congestionWeights := []struct {
		level  string
		weight float64
	}{
		{"low", 0.55},
		{"moderate", 0.20},
		{"low", 0.10},
		{"high", 0.08},
		{"low", 0.07},
	}

	segStart := 0
	segDist := 0.0
	segIdx := 0

	for i := 0; i < len(coords)-1; i++ {
		d := haversine(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0])
		segDist += d

		if segDist >= targetSegmentDist || i == len(coords)-2 {
			segEnd := i + 2
			if segEnd > len(coords) {
				segEnd = len(coords)
			}

			segCoords := coords[segStart:segEnd]

			// Determine congestion based on position + route index for variety
			hash := (segIdx + routeIndex*7) % len(congestionWeights)
			congestion := congestionWeights[hash].level

			// Urban areas (near city centers) get more congestion
			midIdx := (segStart + segEnd) / 2
			if midIdx < len(coords) {
				midCoord := coords[midIdx]
				for _, loc := range locations {
					distToCity := haversine(midCoord[1], midCoord[0], loc.Lat, loc.Lon)
					if distToCity < 5.0 { // Within 5km of a city
						if segIdx%3 == 0 {
							congestion = "high"
						} else {
							congestion = "moderate"
						}
						break
					}
				}
			}

			fc.Features = append(fc.Features, Feature{
				Type: "Feature",
				Properties: map[string]interface{}{
					"congestion": congestion,
				},
				Geometry: map[string]interface{}{
					"type":        "LineString",
					"coordinates": segCoords,
				},
			})

			segStart = i + 1
			segDist = 0
			segIdx++
		}
	}

	return fc
}

func haversine(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371.0 // Earth radius in km
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
