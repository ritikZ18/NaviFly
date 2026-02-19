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

	if startID == "" || endID == "" {
		http.Error(w, "Missing start or end parameter", http.StatusBadRequest)
		return
	}

	// 1. Check DB Cache
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
