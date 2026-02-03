package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"

	"os"

	"github.com/gorilla/handlers"
	"github.com/gorilla/mux"
	"github.com/paulmach/orb"
	"github.com/paulmach/orb/planar"
)

type Point struct {
	Lat float64 `json:"lat"`
	Lon float64 `json:"lon"`
}

type Geofence struct {
	ID      string      `json:"id"`
	Polygon orb.Polygon `json:"polygon"`
}

var fences []Geofence

func init() {
	// Mock geofence for DT Phoenix
	poly := orb.Polygon{
		orb.Ring{
			orb.Point{-112.08, 33.44},
			orb.Point{-112.06, 33.44},
			orb.Point{-112.06, 33.46},
			orb.Point{-112.08, 33.46},
			orb.Point{-112.08, 33.44},
		},
	}
	fences = append(fences, Geofence{ID: "Downtown-Zone-1", Polygon: poly})
}

func CheckFences(w http.ResponseWriter, r *http.Request) {
	var p Point
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	pt := orb.Point{p.Lon, p.Lat}
	inside := []string{}

	for _, f := range fences {
		if planar.PolygonContains(f.Polygon, pt) {
			inside = append(inside, f.ID)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"geofences": inside,
		"is_inside": len(inside) > 0,
	})
}

func main() {
	r := mux.NewRouter()
	r.HandleFunc("/geofence/check", CheckFences).Methods("POST")
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, "OK")
	}).Methods("GET")
	
	// Add Root Handler
	r.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "NaviFly MapMatch Service Online 🗺️")
	}).Methods("GET")

	log.Println("Map-matching / Geo service starting on :8082...")

	// CORS Headers
	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "OPTIONS"})

	// Wrap with Logging and CORS
	loggedRouter := handlers.LoggingHandler(os.Stdout, r)
	log.Fatal(http.ListenAndServe(":8082", handlers.CORS(originsOk, headersOk, methodsOk)(loggedRouter)))
}
