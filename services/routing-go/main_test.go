package main

import (
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
