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
