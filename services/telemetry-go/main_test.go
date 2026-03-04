package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/gorilla/mux"
	"github.com/stretchr/testify/assert"
)

func setupMockRedis(t *testing.T) *miniredis.Miniredis {
	mr, err := miniredis.Run()
	if err != nil {
		t.Fatalf("failed to start miniredis: %v", err)
	}
	
	rdb = redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})
	ctx = context.Background()
	
	return mr
}

func TestIngestTelemetry(t *testing.T) {
	mr := setupMockRedis(t)
	defer mr.Close()

	ping := TelemetryPing{
		VehicleID: "v123",
		Lat:       33.4484,
		Lon:       -112.0740,
		Speed:     65.0,
		Heading:   90.0,
		Timestamp: 1625097600,
	}

	body, _ := json.Marshal(ping)
	req, _ := http.NewRequest("POST", "/ingest", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	
	handler := http.HandlerFunc(IngestTelemetry)
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusAccepted, rr.Code)

	// Verify Redis storage
	val, err := mr.Get("vehicle:v123")
	assert.NoError(t, err)
	
	var stored TelemetryPing
	json.Unmarshal([]byte(val), &stored)
	assert.Equal(t, "v123", stored.VehicleID)
	assert.Equal(t, 65.0, stored.Speed)

	// Verify history list
	list, _ := mr.List("history:v123")
	assert.NotEmpty(t, list)
	assert.Contains(t, list[0], "\"vehicle_id\":\"v123\"")
}

func TestGetLatest(t *testing.T) {
	mr := setupMockRedis(t)
	defer mr.Close()

	// Pre-seed Redis
	ping := TelemetryPing{
		VehicleID: "v456",
		Lat:       34.5066,
		Lon:       -114.2690,
	}
	data, _ := json.Marshal(ping)
	mr.Set("vehicle:v456", string(data))

	req, _ := http.NewRequest("GET", "/vehicle/v456", nil)
	rr := httptest.NewRecorder()

	// Use mux to parse variables
	router := mux.NewRouter()
	router.HandleFunc("/vehicle/{id}", GetLatest)
	router.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	
	var received TelemetryPing
	json.Unmarshal(rr.Body.Bytes(), &received)
	assert.Equal(t, "v456", received.VehicleID)
}

func TestGetLatest_NotFound(t *testing.T) {
	mr := setupMockRedis(t)
	defer mr.Close()

	req, _ := http.NewRequest("GET", "/vehicle/nonexistent", nil)
	rr := httptest.NewRecorder()

	router := mux.NewRouter()
	router.HandleFunc("/vehicle/{id}", GetLatest)
	router.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusNotFound, rr.Code)
}
