package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"navifly/routing/internal/routing"
	"github.com/gorilla/mux"
	"github.com/gorilla/handlers"
)

var cityGraph *routing.Graph

func init() {
	// Full Arizona Route Graph
	cityGraph = routing.NewGraph()
	
	// Phoenix Metro Area
	cityGraph.AddNode(&routing.Node{ID: "phx", Lat: 33.4484, Lon: -112.0740, Name: "Phoenix Downtown"})
	cityGraph.AddNode(&routing.Node{ID: "phx-airport", Lat: 33.4373, Lon: -112.0078, Name: "Phoenix Sky Harbor"})
	cityGraph.AddNode(&routing.Node{ID: "tempe", Lat: 33.4255, Lon: -111.9400, Name: "Tempe (ASU)"})
	cityGraph.AddNode(&routing.Node{ID: "mesa", Lat: 33.4152, Lon: -111.8315, Name: "Mesa"})
	cityGraph.AddNode(&routing.Node{ID: "scottsdale", Lat: 33.4942, Lon: -111.9261, Name: "Scottsdale"})
	cityGraph.AddNode(&routing.Node{ID: "glendale", Lat: 33.5387, Lon: -112.1859, Name: "Glendale"})
	cityGraph.AddNode(&routing.Node{ID: "chandler", Lat: 33.3062, Lon: -111.8413, Name: "Chandler"})
	
	// Southern Arizona
	cityGraph.AddNode(&routing.Node{ID: "tucson", Lat: 32.2226, Lon: -110.9747, Name: "Tucson"})
	cityGraph.AddNode(&routing.Node{ID: "yuma", Lat: 32.6927, Lon: -114.6277, Name: "Yuma"})
	cityGraph.AddNode(&routing.Node{ID: "casa-grande", Lat: 32.8795, Lon: -111.7574, Name: "Casa Grande"})
	
	// Northern Arizona
	cityGraph.AddNode(&routing.Node{ID: "flagstaff", Lat: 35.1983, Lon: -111.6513, Name: "Flagstaff"})
	cityGraph.AddNode(&routing.Node{ID: "sedona", Lat: 34.8697, Lon: -111.7610, Name: "Sedona"})
	cityGraph.AddNode(&routing.Node{ID: "grand-canyon", Lat: 36.0544, Lon: -112.1401, Name: "Grand Canyon"})
	cityGraph.AddNode(&routing.Node{ID: "prescott", Lat: 34.5400, Lon: -112.4685, Name: "Prescott"})
	cityGraph.AddNode(&routing.Node{ID: "page", Lat: 36.9147, Lon: -111.4558, Name: "Page (Lake Powell)"})
	
	// Eastern Arizona
	cityGraph.AddNode(&routing.Node{ID: "show-low", Lat: 34.2542, Lon: -110.0298, Name: "Show Low"})
	
	// Phoenix Metro connections (I-10, I-17, US-60, Loop 101/202)
	cityGraph.AddEdge("phx", "phx-airport", 8.0)
	cityGraph.AddEdge("phx", "tempe", 12.0)
	cityGraph.AddEdge("phx", "scottsdale", 15.0)
	cityGraph.AddEdge("phx", "glendale", 14.0)
	cityGraph.AddEdge("phx-airport", "tempe", 6.0)
	cityGraph.AddEdge("tempe", "mesa", 10.0)
	cityGraph.AddEdge("tempe", "chandler", 12.0)
	cityGraph.AddEdge("mesa", "chandler", 8.0)
	cityGraph.AddEdge("scottsdale", "tempe", 10.0)
	
	// I-10 West (Phoenix to Yuma)
	cityGraph.AddEdge("phx", "glendale", 14.0)
	cityGraph.AddEdge("glendale", "yuma", 180.0)
	
	// I-10 East/South (Phoenix to Tucson)
	cityGraph.AddEdge("phx", "casa-grande", 70.0)
	cityGraph.AddEdge("chandler", "casa-grande", 45.0)
	cityGraph.AddEdge("casa-grande", "tucson", 65.0)
	
	// I-17 North (Phoenix to Flagstaff)
	cityGraph.AddEdge("phx", "prescott", 100.0)
	cityGraph.AddEdge("prescott", "sedona", 60.0)
	cityGraph.AddEdge("sedona", "flagstaff", 45.0)
	
	// US-89 North (Flagstaff to Grand Canyon/Page)
	cityGraph.AddEdge("flagstaff", "grand-canyon", 80.0)
	cityGraph.AddEdge("flagstaff", "page", 135.0)
	cityGraph.AddEdge("grand-canyon", "page", 140.0)
	
	// US-60 East (Phoenix to Show Low)
	cityGraph.AddEdge("mesa", "show-low", 175.0)
	cityGraph.AddEdge("show-low", "flagstaff", 125.0)
}

type RouteRequest struct {
	StartID string `json:"start_id"`
	EndID   string `json:"end_id"`
}

type RouteResponse struct {
	Path         []string              `json:"path"`
	Distance     float64               `json:"distance"`
	Nodes        []*routing.Node       `json:"nodes"`
	Instructions []routing.Instruction `json:"instructions"`
}

func GetRoute(w http.ResponseWriter, r *http.Request) {
	var req RouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	path, dist := routing.AStar(cityGraph, req.StartID, req.EndID)
	
	resp := RouteResponse{
		Path:         path,
		Distance:     dist,
		Instructions: routing.GenerateInstructions(path, cityGraph),
	}

	for _, id := range path {
		resp.Nodes = append(resp.Nodes, cityGraph.Nodes[id])
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GetLocations returns all available locations for the UI dropdowns
func GetLocations(w http.ResponseWriter, r *http.Request) {
	locations := make([]*routing.Node, 0, len(cityGraph.Nodes))
	for _, node := range cityGraph.Nodes {
		locations = append(locations, node)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(locations)
}

func main() {
	r := mux.NewRouter()
	r.HandleFunc("/route", GetRoute).Methods("POST")
	r.HandleFunc("/locations", GetLocations).Methods("GET")
	r.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "OK")
	}).Methods("GET")

	// Add Root Handler so localhost:8080 doesn't 404
	r.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprint(w, "NaviFly Routing Service Online 🚀")
	}).Methods("GET")
	
	log.Println("Routing service starting on :8080...")

	// CORS Headers
	headersOk := handlers.AllowedHeaders([]string{"X-Requested-With", "Content-Type", "Authorization"})
	originsOk := handlers.AllowedOrigins([]string{"*"})
	methodsOk := handlers.AllowedMethods([]string{"GET", "HEAD", "POST", "PUT", "OPTIONS"})

	// Wrap with Logging and CORS
	loggedRouter := handlers.LoggingHandler(os.Stdout, r)
	log.Fatal(http.ListenAndServe(":8080", handlers.CORS(originsOk, headersOk, methodsOk)(loggedRouter)))
}
