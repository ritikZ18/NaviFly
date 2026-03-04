package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"io"
	"net/url"
	"os"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
)

var (
	ctx = context.Background()
	rdb *redis.Client
)

type TelemetryPing struct {
	VehicleID string  `json:"vehicle_id"`
	Lat       float64 `json:"lat"`
	Lon       float64 `json:"lon"`
	Speed     float64 `json:"speed"`
	Heading   float64 `json:"heading"`
	Timestamp int64   `json:"timestamp"`
}

func IngestTelemetry(w http.ResponseWriter, r *http.Request) {
	var ping TelemetryPing
	if err := json.NewDecoder(r.Body).Decode(&ping); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	if ping.Timestamp == 0 {
		ping.Timestamp = time.Now().Unix()
	}

	// Store latest state in Redis
	data, _ := json.Marshal(ping)
	_ = rdb.Set(ctx, fmt.Sprintf("vehicle:%s", ping.VehicleID), data, 0).Err()

	// Push to a list for historical tracking (MVP)
	_ = rdb.LPush(ctx, fmt.Sprintf("history:%s", ping.VehicleID), data).Err()
	_ = rdb.LTrim(ctx, fmt.Sprintf("history:%s", ping.VehicleID), 0, 100).Err()

	log.Printf("Telemetry: [%s] %.4f, %.4f | Speed: %.1f km/h", ping.VehicleID, ping.Lat, ping.Lon, ping.Speed)
	w.WriteHeader(http.StatusAccepted)
}

func GetLatest(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	vid := vars["id"]

	val, err := rdb.Get(ctx, fmt.Sprintf("vehicle:%s", vid)).Result()
	if err != nil {
		http.Error(w, "Vehicle not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprint(w, val)
}

func GetAllVehicles(w http.ResponseWriter, r *http.Request) {
	// Scan all vehicle:* keys
	var cursor uint64
	var keys []string
	for {
		var batch []string
		var err error
		batch, cursor, err = rdb.Scan(ctx, cursor, "vehicle:*", 100).Result()
		if err != nil {
			http.Error(w, "Redis scan error", http.StatusInternalServerError)
			return
		}
		keys = append(keys, batch...)
		if cursor == 0 {
			break
		}
	}

	vehicles := make([]json.RawMessage, 0, len(keys))
	for _, k := range keys {
		val, err := rdb.Get(ctx, k).Result()
		if err == nil {
			vehicles = append(vehicles, json.RawMessage(val))
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(vehicles); err != nil {
		http.Error(w, "Encode error", http.StatusInternalServerError)
	}
}

func GetNearbyWebcams(w http.ResponseWriter, r *http.Request) {
	lat := r.URL.Query().Get("lat")
	lon := r.URL.Query().Get("lon")
	radius := r.URL.Query().Get("radiusKm")
	if radius == "" {
		radius = "10"
	}

	apiKey := os.Getenv("WINDY_API_KEY")
	if apiKey == "" {
		// Fallback to VITE_WINDY_API_KEY if not in environment but passed in during dev
		apiKey = os.Getenv("VITE_WINDY_API_KEY")
	}

	if apiKey == "" {
		http.Error(w, "Windy API key not configured on server", http.StatusServiceUnavailable)
		return
	}

	// Windy V3 API URL
	windyUrl := fmt.Sprintf("https://api.windy.com/webcams/api/v3/webcams?latitude=%s&longitude=%s&radius=%s&include=location,images,urls,player",
		url.QueryEscape(lat), url.QueryEscape(lon), url.QueryEscape(radius))

	req, _ := http.NewRequest("GET", windyUrl, nil)
	req.Header.Set("x-windy-api-key", apiKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, "Failed to connect to Windy API", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func GetAircraft(w http.ResponseWriter, r *http.Request) {
	// Proxy OpenSky for the AZ bounding box
	openskyUrl := "https://opensky-network.org/api/states/all?lamin=31.0&lomin=-115.0&lamax=37.0&lomax=-109.0"

	resp, err := http.Get(openskyUrl)
	if err != nil {
		http.Error(w, "Failed to connect to OpenSky", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, resp.Body)
}

func main() {
	redisAddr := os.Getenv("REDIS_URL")
	if redisAddr == "" {
		redisAddr = "localhost:6379"
	}

	rdb = redis.NewClient(&redis.Options{
		Addr: redisAddr,
	})

	r := mux.NewRouter()
	r.HandleFunc("/ingest", IngestTelemetry).Methods("POST")
	r.HandleFunc("/vehicles", GetAllVehicles).Methods("GET")
	r.HandleFunc("/vehicle/{id}", GetLatest).Methods("GET")
	r.HandleFunc("/api/webcams/nearby", GetNearbyWebcams).Methods("GET")
	r.HandleFunc("/api/traffic/aircraft", GetAircraft).Methods("GET")
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if err := rdb.Ping(ctx).Err(); err != nil {
			http.Error(w, "Redis Down", http.StatusServiceUnavailable)
			return
		}
		fmt.Fprint(w, "OK")
	}).Methods("GET")

	// Add Root Handler
	r.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "NaviFly Telemetry Service Online 🛰️")
	}).Methods("GET")

	log.Println("Telemetry service starting on :8081...")

	// CORS Headers
	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "OPTIONS"})

	// Wrap with Logging and CORS
	loggedRouter := handlers.LoggingHandler(os.Stdout, r)
	log.Fatal(http.ListenAndServe(":8081", handlers.CORS(originsOk, headersOk, methodsOk)(loggedRouter)))
}
