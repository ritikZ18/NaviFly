package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	"os"

	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
	"github.com/gorilla/handlers"
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
	r.HandleFunc("/vehicle/{id}", GetLatest).Methods("GET")
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
