package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/mux"
)

// ── Arts Access Map: Models ─────────────────────────────────────────────────
// A School is a Miami-Dade public school. A Program is one arts organization
// running one discipline at that school (the "org → school" link that carries
// the survey/impact data). access_level is PRECOMPUTED on write so the public
// map never has to calculate it — it only ships tiny summary fields.

type School struct {
	ID          string    `gorm:"primaryKey" json:"id"`
	Name        string    `json:"name"`
	Address     string    `json:"address"`
	Lat         float64   `json:"lat"`
	Lng         float64   `json:"lng"`
	Region      string    `json:"region"`       // North Dade / Central Dade / South Dade
	Students    int       `json:"students"`     // total enrollment
	AccessLevel string    `json:"access_level"` // high / medium / low / none (precomputed)
	ImageURL    string    `json:"image_url"`    // school photo (placeholder until Airtable supplies one)
	Programs    []Program `gorm:"foreignKey:SchoolID" json:"programs,omitempty"`
}

type Program struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	SchoolID      string `gorm:"index" json:"school_id"`
	Organization  string `json:"organization"`
	Discipline    string `json:"discipline"` // Music / Dance / Visual Arts / Theater
	Students      int    `json:"students"`   // students served by THIS program
	Participation int    `json:"participation"`
	Impact        int    `json:"impact"` // 0-100 survey-based impact score
}

// schoolsGeoJSONCache holds the precomputed public FeatureCollection. It is
// rebuilt only when the data changes (seed or Airtable sync), never per request.
var (
	schoolsGeoJSONCache []byte
	schoolsCacheMu      sync.RWMutex
)

// computeAccessLevel derives a school's arts-access level from its programs.
// This is the one place the rule lives — the Airtable sync calls it too.
func computeAccessLevel(students int, programs []Program) string {
	if len(programs) == 0 {
		return "none"
	}
	served := 0
	for _, p := range programs {
		served += p.Students
	}
	coverage := 0.0
	if students > 0 {
		coverage = float64(served) / float64(students)
	}
	switch {
	case len(programs) >= 3 || coverage >= 0.5:
		return "high"
	case len(programs) == 2 || coverage >= 0.25:
		return "medium"
	default:
		return "low"
	}
}

// MigrateAndSeedSchools creates the tables and loads illustrative Miami-Dade
// sample data. In sample-data mode it refreshes on every startup so seed edits
// take effect immediately. (Once Airtable sync is wired, this wipe is gated off.)
func MigrateAndSeedSchools() {
	if err := db.AutoMigrate(&School{}, &Program{}); err != nil {
		log.Printf("⚠️ school migrate failed: %v", err)
		return
	}

	db.Where("1 = 1").Delete(&Program{})
	db.Where("1 = 1").Delete(&School{})

	seed := seedSchools()
	for i := range seed {
		if seed[i].ImageURL == "" {
			seed[i].ImageURL = fmt.Sprintf("https://picsum.photos/seed/%s/640/420", seed[i].ID)
		}
		seed[i].AccessLevel = computeAccessLevel(seed[i].Students, seed[i].Programs)
		if err := db.Create(&seed[i]).Error; err != nil {
			log.Printf("⚠️ seed school %s failed: %v", seed[i].ID, err)
		}
	}
	log.Printf("🎨 Seeded %d Arts Access schools (illustrative sample data)", len(seed))
	rebuildSchoolsGeoJSON()
	rebuildPartnersGeoJSON()
}

// rebuildSchoolsGeoJSON regenerates the tiny public FeatureCollection from the
// DB. Only summary fields go out — heavy program/impact rows stay server-side.
func rebuildSchoolsGeoJSON() {
	var schools []School
	db.Find(&schools)

	fc := FeatureCollection{Type: "FeatureCollection", Features: make([]Feature, 0, len(schools))}
	for _, s := range schools {
		var programCount int64
		db.Model(&Program{}).Where("school_id = ?", s.ID).Count(&programCount)
		fc.Features = append(fc.Features, Feature{
			Type: "Feature",
			Properties: map[string]interface{}{
				"id":           s.ID,
				"name":         s.Name,
				"region":       s.Region,
				"students":     s.Students,
				"access_level": s.AccessLevel,
				"programs":     programCount,
			},
			Geometry: map[string]interface{}{
				"type":        "Point",
				"coordinates": []float64{s.Lng, s.Lat},
			},
		})
	}

	data, err := json.Marshal(fc)
	if err != nil {
		log.Printf("⚠️ failed to build schools.geojson: %v", err)
		return
	}
	schoolsCacheMu.Lock()
	schoolsGeoJSONCache = data
	schoolsCacheMu.Unlock()
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func RegisterSchoolRoutes(r *mux.Router) {
	r.HandleFunc("/schools.geojson", handleSchoolsGeoJSON).Methods("GET")
	r.HandleFunc("/schools/summary", handleSchoolsSummary).Methods("GET") // must precede /{id}
	r.HandleFunc("/schools/{id}", handleSchoolDetail).Methods("GET")

	// Partners lens — same program rows, grouped by organization
	r.HandleFunc("/partners.geojson", handlePartnersGeoJSON).Methods("GET")
	r.HandleFunc("/partners/{id}", handlePartnerDetail).Methods("GET")
}

// handleSchoolsGeoJSON serves the light, cached, all-pins summary layer.
func handleSchoolsGeoJSON(w http.ResponseWriter, r *http.Request) {
	schoolsCacheMu.RLock()
	data := schoolsGeoJSONCache
	schoolsCacheMu.RUnlock()
	if data == nil {
		rebuildSchoolsGeoJSON()
		schoolsCacheMu.RLock()
		data = schoolsGeoJSONCache
		schoolsCacheMu.RUnlock()
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// handleSchoolDetail serves the heavy per-school detail — only on pin click.
func handleSchoolDetail(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	var school School
	if err := db.Preload("Programs").Where("id = ?", id).First(&school).Error; err != nil {
		http.Error(w, "school not found", http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(school)
}

// handleSchoolsSummary serves the county rollup for the default panel.
func handleSchoolsSummary(w http.ResponseWriter, r *http.Request) {
	var schools []School
	db.Find(&schools)

	byLevel := map[string]int{"high": 0, "medium": 0, "low": 0, "none": 0}
	byRegion := map[string]int{}
	totalStudents := 0
	for _, s := range schools {
		byLevel[s.AccessLevel]++
		byRegion[s.Region]++
		totalStudents += s.Students
	}

	var programs []Program
	db.Find(&programs)
	orgSet := map[string]bool{}
	for _, p := range programs {
		orgSet[p.Organization] = true
	}

	summary := map[string]interface{}{
		"schools":         len(schools),
		"students":        totalStudents,
		"programs":        len(programs),
		"organizations":   len(orgSet),
		"by_access_level": byLevel,
		"by_region":       byRegion,
		"gaps":            byLevel["none"] + byLevel["low"],
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

// ── Seed data ────────────────────────────────────────────────────────────────
// Illustrative sample data. Real Miami-Dade schools + real Arts Access Miami
// partner orgs, with INVENTED student/impact numbers to demonstrate the concept.
// Gap schools (no active org) are intentional — surfacing them is the point.

func seedSchools() []School {
	return []School{
		// ── Central Dade ──
		{
			ID: "miami-northwestern", Name: "Miami Northwestern Senior High",
			Address: "Liberty City, Miami", Lat: 25.849, Lng: -80.234,
			Region: "Central Dade", Students: 2200,
			Programs: []Program{
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 180, Participation: 35, Impact: 82},
				{Organization: "Miami Music Project", Discipline: "Music", Students: 120, Participation: 20, Impact: 78},
			},
		},
		{
			ID: "booker-t-washington", Name: "Booker T. Washington Senior High",
			Address: "Overtown, Miami", Lat: 25.789, Lng: -80.204,
			Region: "Central Dade", Students: 1400,
			Programs: []Program{
				{Organization: "Save The Music Foundation", Discipline: "Music", Students: 220, Participation: 40, Impact: 80},
				{Organization: "Young Musicians Unite", Discipline: "Music", Students: 150, Participation: 25, Impact: 85},
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 130, Participation: 20, Impact: 79},
			},
		},
		{
			ID: "miami-jackson", Name: "Miami Jackson Senior High",
			Address: "Allapattah, Miami", Lat: 25.799, Lng: -80.234,
			Region: "Central Dade", Students: 1600,
			Programs: []Program{
				{Organization: "Arts For Learning Miami", Discipline: "Visual Arts", Students: 90, Participation: 15, Impact: 70},
			},
		},
		{
			ID: "miami-edison", Name: "Miami Edison Senior High",
			Address: "Little Haiti, Miami", Lat: 25.834, Lng: -80.196,
			Region: "Central Dade", Students: 1300,
			Programs: []Program{
				{Organization: "Miami Music Project", Discipline: "Music", Students: 160, Participation: 28, Impact: 76},
				{Organization: "Dance NOW! Miami", Discipline: "Dance", Students: 80, Participation: 12, Impact: 72},
			},
		},
		{
			ID: "brownsville-middle", Name: "Brownsville Middle School",
			Address: "Brownsville, Miami", Lat: 25.826, Lng: -80.242,
			Region: "Central Dade", Students: 900,
			Programs: []Program{},
		},
		{
			ID: "allapattah-middle", Name: "Allapattah Middle School",
			Address: "Allapattah, Miami", Lat: 25.815, Lng: -80.226,
			Region: "Central Dade", Students: 1100,
			Programs: []Program{
				{Organization: "Young Musicians Unite", Discipline: "Music", Students: 200, Participation: 40, Impact: 88},
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 150, Participation: 25, Impact: 84},
				{Organization: "Achieve Miami", Discipline: "Visual Arts", Students: 90, Participation: 15, Impact: 74},
			},
		},
		{
			ID: "citrus-grove-middle", Name: "Citrus Grove Middle School",
			Address: "Little Havana, Miami", Lat: 25.775, Lng: -80.234,
			Region: "Central Dade", Students: 1000,
			Programs: []Program{
				{Organization: "Miami Music Project", Discipline: "Music", Students: 120, Participation: 22, Impact: 75},
			},
		},
		{
			ID: "jose-de-diego-middle", Name: "Jose de Diego Middle School",
			Address: "Wynwood, Miami", Lat: 25.803, Lng: -80.192,
			Region: "Central Dade", Students: 850,
			Programs: []Program{},
		},
		{
			ID: "miami-central", Name: "Miami Central Senior High",
			Address: "Gladeview, Miami", Lat: 25.855, Lng: -80.238,
			Region: "Central Dade", Students: 1700,
			Programs: []Program{
				{Organization: "Save The Music Foundation", Discipline: "Music", Students: 200, Participation: 32, Impact: 79},
				{Organization: "Young Musicians Unite", Discipline: "Music", Students: 140, Participation: 22, Impact: 83},
			},
		},
		{
			ID: "new-world-arts", Name: "New World School of the Arts",
			Address: "Downtown Miami", Lat: 25.780, Lng: -80.192,
			Region: "Central Dade", Students: 500,
			Programs: []Program{
				{Organization: "Young Musicians Unite", Discipline: "Music", Students: 180, Participation: 60, Impact: 92},
				{Organization: "Miami City Ballet", Discipline: "Dance", Students: 120, Participation: 40, Impact: 90},
				{Organization: "Actors' Playhouse", Discipline: "Theater", Students: 90, Participation: 30, Impact: 88},
			},
		},
		{
			ID: "dash-design-arts", Name: "Design & Architecture Senior High",
			Address: "Design District, Miami", Lat: 25.813, Lng: -80.193,
			Region: "Central Dade", Students: 500,
			Programs: []Program{
				{Organization: "Arts For Learning Miami", Discipline: "Visual Arts", Students: 200, Participation: 70, Impact: 90},
				{Organization: "Miami Music Project", Discipline: "Music", Students: 80, Participation: 25, Impact: 82},
				{Organization: "Achieve Miami", Discipline: "Visual Arts", Students: 60, Participation: 20, Impact: 80},
			},
		},
		{
			ID: "coral-gables-senior", Name: "Coral Gables Senior High",
			Address: "Coral Gables", Lat: 25.735, Lng: -80.277,
			Region: "Central Dade", Students: 3400,
			Programs: []Program{
				{Organization: "Save The Music Foundation", Discipline: "Music", Students: 220, Participation: 20, Impact: 80},
				{Organization: "Miami Children's Chorus", Discipline: "Music", Students: 150, Participation: 12, Impact: 84},
				{Organization: "Dance NOW! Miami", Discipline: "Dance", Students: 120, Participation: 10, Impact: 76},
			},
		},
		{
			ID: "miami-senior", Name: "Miami Senior High",
			Address: "Little Havana, Miami", Lat: 25.767, Lng: -80.238,
			Region: "Central Dade", Students: 2900,
			Programs: []Program{
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 180, Participation: 15, Impact: 79},
				{Organization: "Miami Music Project", Discipline: "Music", Students: 140, Participation: 12, Impact: 77},
			},
		},
		{
			ID: "g-holmes-braddock", Name: "G. Holmes Braddock Senior High",
			Address: "Westchester", Lat: 25.735, Lng: -80.375,
			Region: "Central Dade", Students: 4000,
			Programs: []Program{
				{Organization: "Save The Music Foundation", Discipline: "Music", Students: 200, Participation: 10, Impact: 78},
				{Organization: "Achieve Miami", Discipline: "Visual Arts", Students: 120, Participation: 6, Impact: 72},
			},
		},
		{
			ID: "miami-springs-senior", Name: "Miami Springs Senior High",
			Address: "Miami Springs", Lat: 25.822, Lng: -80.289,
			Region: "Central Dade", Students: 1900,
			Programs: []Program{},
		},
		{
			ID: "shenandoah-middle", Name: "Shenandoah Middle School",
			Address: "Shenandoah, Miami", Lat: 25.755, Lng: -80.234,
			Region: "Central Dade", Students: 1000,
			Programs: []Program{},
		},

		// ── North Dade ──
		{
			ID: "miami-carol-city", Name: "Miami Carol City Senior High",
			Address: "Miami Gardens", Lat: 25.938, Lng: -80.245,
			Region: "North Dade", Students: 2000,
			Programs: []Program{
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 170, Participation: 30, Impact: 80},
			},
		},
		{
			ID: "north-miami-senior", Name: "North Miami Senior High",
			Address: "North Miami", Lat: 25.892, Lng: -80.186,
			Region: "North Dade", Students: 2100,
			Programs: []Program{
				{Organization: "Miami Music Project", Discipline: "Music", Students: 180, Participation: 26, Impact: 77},
				{Organization: "Dance NOW! Miami", Discipline: "Dance", Students: 100, Participation: 15, Impact: 73},
				{Organization: "Arts For Learning Miami", Discipline: "Visual Arts", Students: 120, Participation: 18, Impact: 71},
			},
		},
		{
			ID: "miami-norland", Name: "Miami Norland Senior High",
			Address: "Miami Gardens", Lat: 25.940, Lng: -80.213,
			Region: "North Dade", Students: 1900,
			Programs: []Program{},
		},
		{
			ID: "american-senior", Name: "American Senior High",
			Address: "Hialeah / Miami Lakes", Lat: 25.905, Lng: -80.310,
			Region: "North Dade", Students: 2600,
			Programs: []Program{
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 160, Participation: 14, Impact: 78},
				{Organization: "Dance NOW! Miami", Discipline: "Dance", Students: 90, Participation: 8, Impact: 73},
			},
		},
		{
			ID: "hialeah-senior", Name: "Hialeah Senior High",
			Address: "Hialeah", Lat: 25.860, Lng: -80.293,
			Region: "North Dade", Students: 2500,
			Programs: []Program{},
		},
		{
			ID: "barbara-goleman", Name: "Barbara Goleman Senior High",
			Address: "Miami Lakes", Lat: 25.930, Lng: -80.320,
			Region: "North Dade", Students: 2700,
			Programs: []Program{
				{Organization: "Miami Music Project", Discipline: "Music", Students: 170, Participation: 12, Impact: 76},
				{Organization: "Arts For Learning Miami", Discipline: "Visual Arts", Students: 110, Participation: 8, Impact: 71},
			},
		},
		{
			ID: "nmb-senior", Name: "North Miami Beach Senior High",
			Address: "North Miami Beach", Lat: 25.930, Lng: -80.160,
			Region: "North Dade", Students: 2100,
			Programs: []Program{
				{Organization: "Save The Music Foundation", Discipline: "Music", Students: 190, Participation: 20, Impact: 80},
				{Organization: "Young Musicians Unite", Discipline: "Music", Students: 130, Participation: 14, Impact: 84},
				{Organization: "Miami Children's Chorus", Discipline: "Music", Students: 90, Participation: 10, Impact: 82},
			},
		},
		{
			ID: "krop-senior", Name: "Dr. Michael M. Krop Senior High",
			Address: "Ives Estates", Lat: 25.960, Lng: -80.150,
			Region: "North Dade", Students: 2400,
			Programs: []Program{
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 150, Participation: 12, Impact: 78},
			},
		},

		// ── South Dade ──
		{
			ID: "homestead-senior", Name: "Homestead Senior High",
			Address: "Homestead", Lat: 25.468, Lng: -80.477,
			Region: "South Dade", Students: 2300,
			Programs: []Program{
				{Organization: "Guitars Over Guns", Discipline: "Music", Students: 150, Participation: 22, Impact: 78},
			},
		},
		{
			ID: "south-dade-senior", Name: "South Dade Senior High",
			Address: "Homestead / Cutler", Lat: 25.508, Lng: -80.457,
			Region: "South Dade", Students: 2500,
			Programs: []Program{
				{Organization: "Miami Music Project", Discipline: "Music", Students: 160, Participation: 20, Impact: 75},
				{Organization: "Achieve Miami", Discipline: "Visual Arts", Students: 110, Participation: 14, Impact: 72},
			},
		},
		{
			ID: "coral-reef-senior", Name: "Coral Reef Senior High",
			Address: "Palmetto Bay", Lat: 25.626, Lng: -80.339,
			Region: "South Dade", Students: 3100,
			Programs: []Program{
				{Organization: "Save The Music Foundation", Discipline: "Music", Students: 240, Participation: 30, Impact: 81},
				{Organization: "Young Musicians Unite", Discipline: "Music", Students: 160, Participation: 20, Impact: 84},
				{Organization: "Dance NOW! Miami", Discipline: "Dance", Students: 120, Participation: 15, Impact: 74},
			},
		},
		{
			ID: "cutler-bay-middle", Name: "Cutler Bay Middle School",
			Address: "Cutler Bay", Lat: 25.575, Lng: -80.348,
			Region: "South Dade", Students: 1200,
			Programs: []Program{},
		},
		{
			ID: "miami-palmetto", Name: "Miami Palmetto Senior High",
			Address: "Pinecrest", Lat: 25.665, Lng: -80.315,
			Region: "South Dade", Students: 3300,
			Programs: []Program{
				{Organization: "Miami Music Project", Discipline: "Music", Students: 180, Participation: 10, Impact: 77},
				{Organization: "Dance NOW! Miami", Discipline: "Dance", Students: 100, Participation: 6, Impact: 74},
			},
		},
		{
			ID: "felix-varela", Name: "Felix Varela Senior High",
			Address: "The Hammocks", Lat: 25.700, Lng: -80.430,
			Region: "South Dade", Students: 3000,
			Programs: []Program{
				{Organization: "Achieve Miami", Discipline: "Visual Arts", Students: 120, Participation: 8, Impact: 72},
			},
		},
		{
			ID: "terra-environmental", Name: "TERRA Environmental Research Institute",
			Address: "Kendall", Lat: 25.660, Lng: -80.390,
			Region: "South Dade", Students: 1600,
			Programs: []Program{},
		},
		{
			ID: "robert-morgan", Name: "Robert Morgan Educational Center",
			Address: "Richmond Heights", Lat: 25.640, Lng: -80.400,
			Region: "South Dade", Students: 2200,
			Programs: []Program{
				{Organization: "Save The Music Foundation", Discipline: "Music", Students: 140, Participation: 10, Impact: 76},
			},
		},
	}
}
