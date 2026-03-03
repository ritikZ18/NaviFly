package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCheckFences_Inside(t *testing.T) {
	// Point inside Downtown-Zone-1 (-112.07, 33.45)
	p := Point{Lat: 33.45, Lon: -112.07}
	body, _ := json.Marshal(p)
	
	req, _ := http.NewRequest("POST", "/geofence/check", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	
	handler := http.HandlerFunc(CheckFences)
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	
	var resp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &resp)
	
	assert.True(t, resp["is_inside"].(bool))
	fencesList := resp["geofences"].([]interface{})
	assert.Contains(t, fencesList, "Downtown-Zone-1")
}

func TestCheckFences_Outside(t *testing.T) {
	// Point outside Downtown-Zone-1 (-111.0, 34.0)
	p := Point{Lat: 34.0, Lon: -111.0}
	body, _ := json.Marshal(p)
	
	req, _ := http.NewRequest("POST", "/geofence/check", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	
	handler := http.HandlerFunc(CheckFences)
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	
	var resp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &resp)
	
	assert.False(t, resp["is_inside"].(bool))
	fencesList := resp["geofences"].([]interface{})
	assert.Empty(t, fencesList)
}

func TestCheckFences_InvalidJSON(t *testing.T) {
	req, _ := http.NewRequest("POST", "/geofence/check", bytes.NewBufferString("invalid json"))
	rr := httptest.NewRecorder()
	
	handler := http.HandlerFunc(CheckFences)
	handler.ServeHTTP(rr, req)

	assert.Equal(t, http.StatusBadRequest, rr.Code)
}

// ── New Expanded Tests ──

func TestCheckFences_OnBoundary(t *testing.T) {
	// Point exactly on the boundary corner
	p := Point{Lat: 33.44, Lon: -112.08}
	body, _ := json.Marshal(p)

	req, _ := http.NewRequest("POST", "/geofence/check", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	http.HandlerFunc(CheckFences).ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	// Either inside or outside is valid for boundary — just ensure no error
	var resp map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.NotNil(t, resp["is_inside"])
}

func TestCheckFences_ResponseJSON(t *testing.T) {
	// Inside point: verify full JSON shape is correct
	p := Point{Lat: 33.45, Lon: -112.07}
	body, _ := json.Marshal(p)

	req, _ := http.NewRequest("POST", "/geofence/check", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	http.HandlerFunc(CheckFences).ServeHTTP(rr, req)

	assert.Equal(t, "application/json", rr.Header().Get("Content-Type"))

	var resp map[string]interface{}
	err := json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.NoError(t, err)
	assert.Contains(t, resp, "is_inside")
	assert.Contains(t, resp, "geofences")
}

func TestCheckFences_OriginPoint(t *testing.T) {
	// (0, 0) should definitely be outside any Arizona fence
	p := Point{Lat: 0.0, Lon: 0.0}
	body, _ := json.Marshal(p)

	req, _ := http.NewRequest("POST", "/geofence/check", bytes.NewBuffer(body))
	rr := httptest.NewRecorder()
	http.HandlerFunc(CheckFences).ServeHTTP(rr, req)

	assert.Equal(t, http.StatusOK, rr.Code)
	var resp map[string]interface{}
	json.Unmarshal(rr.Body.Bytes(), &resp)
	assert.False(t, resp["is_inside"].(bool))
	assert.Empty(t, resp["geofences"].([]interface{}))
}
