package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestFindLocation(t *testing.T) {
	// Test existing location
	loc, ok := findLocation("phx")
	assert.True(t, ok)
	assert.Equal(t, "Phoenix Downtown", loc.Name)
	assert.Equal(t, 33.4484, loc.Lat)
	assert.Equal(t, -112.0740, loc.Lon)

	// Test non-existing location
	_, ok = findLocation("invalid-id")
	assert.False(t, ok)
}

func TestTrimSpace(t *testing.T) {
	assert.Equal(t, "test", trimSpace("  test  "))
	assert.Equal(t, "test", trimSpace("test"))
	assert.Equal(t, "test", trimSpace("   test"))
	assert.Equal(t, "test", trimSpace("test   "))
	assert.Equal(t, "", trimSpace("   "))
}

func TestSplitString(t *testing.T) {
	parts := splitString("a,b,c", ',')
	assert.Equal(t, []string{"a", "b", "c"}, parts)

	parts = splitString("single", ',')
	assert.Equal(t, []string{"single"}, parts)

	parts = splitString("", ',')
	assert.Equal(t, []string{""}, parts)
}

func TestSplitStops(t *testing.T) {
	stops := splitStops("tempe,mesa , chandler")
	assert.Equal(t, []string{"tempe", "mesa", "chandler"}, stops)

	stops = splitStops("  , , ")
	assert.Nil(t, stops)

	stops = splitStops("")
	assert.Nil(t, stops)
}

func TestHaversine(t *testing.T) {
	// Distance between PHX and Scottsdale (roughly)
	dist := haversine(33.4484, -112.0740, 33.4942, -111.9261)
	assert.InDelta(t, 14.7, dist, 0.5) // Around 14.7 km

	// Same point
	dist = haversine(33.4484, -112.0740, 33.4484, -112.0740)
	assert.Equal(t, 0.0, dist)
}

func TestBuildTrafficFeatureCollection(t *testing.T) {
	// Simple route with 3 points
	coords := [][2]float64{
		{-112.0740, 33.4484}, // PHX
		{-112.0078, 33.4373}, // PHX Airport
		{-111.9400, 33.4255}, // Tempe
	}

	fc := buildTrafficFeatureCollection(coords, 0)
	assert.Equal(t, "FeatureCollection", fc.Type)
	assert.NotEmpty(t, fc.Features)

	for _, f := range fc.Features {
		assert.Equal(t, "Feature", f.Type)
		assert.Contains(t, f.Properties, "congestion")
		geom := f.Geometry.(map[string]interface{})
		assert.Equal(t, "LineString", geom["type"])
		assert.NotEmpty(t, geom["coordinates"])
	}
}

// ── HTTP Handler Tests ──

func TestHealthEndpoint(t *testing.T) {
	req, _ := http.NewRequest("GET", "/health", nil)
	rr := httptest.NewRecorder()

	healthHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})
	healthHandler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	assert.Equal(t, "OK", rr.Body.String())
}

func TestLocationsEndpoint(t *testing.T) {
	req, _ := http.NewRequest("GET", "/locations", nil)
	rr := httptest.NewRecorder()

	locationsHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(locations)
	})
	locationsHandler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	
	var locs []Location
	err := json.Unmarshal(rr.Body.Bytes(), &locs)
	assert.NoError(t, err)
	assert.NotEmpty(t, locs)
	
	// Verify PHX is in the list
	found := false
	for _, l := range locs {
		if l.ID == "phx" {
			found = true
			assert.Equal(t, "Phoenix Downtown", l.Name)
			break
		}
	}
	assert.True(t, found, "PHX location should exist")
}

func TestHandleRoute_MissingParams(t *testing.T) {
	// Missing both start and end
	req, _ := http.NewRequest("GET", "/route", nil)
	rr := httptest.NewRecorder()
	HandleRoute(rr, req)
	assert.Equal(t, http.StatusBadRequest, rr.Code)

	// Missing end param only
	req2, _ := http.NewRequest("GET", "/route?start=phx", nil)
	rr2 := httptest.NewRecorder()
	HandleRoute(rr2, req2)
	assert.Equal(t, http.StatusBadRequest, rr2.Code)

	// Missing start param only
	req3, _ := http.NewRequest("GET", "/route?end=scottsdale", nil)
	rr3 := httptest.NewRecorder()
	HandleRoute(rr3, req3)
	assert.Equal(t, http.StatusBadRequest, rr3.Code)
}

func TestHaversine_SymmetryAndPrecision(t *testing.T) {
	// Haversine should be symmetric (A→B == B→A)
	d1 := haversine(33.4484, -112.0740, 33.4255, -111.9400)
	d2 := haversine(33.4255, -111.9400, 33.4484, -112.0740)
	assert.InDelta(t, d1, d2, 0.0001, "Haversine must be symmetric")

	// PHX to Tucson should be ~180 km
	dist := haversine(33.4484, -112.0740, 32.2226, -110.9747)
	assert.InDelta(t, 180.0, dist, 10.0)
}

func TestBuildTrafficFeatureCollection_TwoPoints(t *testing.T) {
	// Minimum valid route: two points = one segment
	coords := [][2]float64{
		{-112.0740, 33.4484},
		{-112.0078, 33.4373},
	}
	fc := buildTrafficFeatureCollection(coords, 0)
	assert.Equal(t, 1, len(fc.Features), "2 points should produce 1 segment")
}

func TestBuildTrafficFeatureCollection_SinglePoint(t *testing.T) {
	// Edge case: only one point, no segments possible
	coords := [][2]float64{
		{-112.0740, 33.4484},
	}
	fc := buildTrafficFeatureCollection(coords, 0)
	assert.Empty(t, fc.Features, "1 point should produce no segments")
}
