package main

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync"

	"github.com/gorilla/mux"
)

// ── Partners lens ────────────────────────────────────────────────────────────
// A "partner" is one arts organization. Partners are NOT a new table — they are
// a GROUP BY org over the same Program rows. Each partner pin sits at the
// centroid of the schools it serves, sized by school reach, colored by its
// primary discipline. This is the "who serves whom" projection of the data.

type PartnerSchool struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
	Region     string  `json:"region"`
	Discipline string  `json:"discipline"`
	Students   int     `json:"students"`
	Impact     int     `json:"impact"`
}

type Partner struct {
	ID                string          `json:"id"` // slug
	Organization      string          `json:"organization"`
	SchoolCount       int             `json:"school_count"`
	Students          int             `json:"students"`
	Disciplines       []string        `json:"disciplines"`
	PrimaryDiscipline string          `json:"primary_discipline"`
	ReachLevel        string          `json:"reach_level"` // wide / regional / focused
	Lat               float64         `json:"lat"`
	Lng               float64         `json:"lng"`
	Schools           []PartnerSchool `json:"schools,omitempty"`
}

var (
	partnersGeoJSONCache []byte
	partnersCacheMu      sync.RWMutex
)

// slugify turns "Young Musicians Unite" → "young-musicians-unite" for URL ids.
func slugify(s string) string {
	var b []rune
	prevDash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9'):
			b = append(b, r)
			prevDash = false
		case len(b) > 0 && !prevDash:
			b = append(b, '-')
			prevDash = true
		}
	}
	for len(b) > 0 && b[len(b)-1] == '-' {
		b = b[:len(b)-1]
	}
	return string(b)
}

func reachLevel(schoolCount int) string {
	switch {
	case schoolCount >= 6:
		return "wide"
	case schoolCount >= 3:
		return "regional"
	default:
		return "focused"
	}
}

// buildPartners aggregates all Program rows by organization.
func buildPartners() []Partner {
	var programs []Program
	db.Find(&programs)

	var schools []School
	db.Find(&schools)
	schoolByID := make(map[string]School, len(schools))
	for _, s := range schools {
		schoolByID[s.ID] = s
	}

	type agg struct {
		p           Partner
		schoolSet   map[string]bool
		disciplineC map[string]int
		sumLat      float64
		sumLng      float64
	}
	byOrg := map[string]*agg{}

	for _, pr := range programs {
		s, ok := schoolByID[pr.SchoolID]
		if !ok {
			continue
		}
		a := byOrg[pr.Organization]
		if a == nil {
			a = &agg{
				p:           Partner{ID: slugify(pr.Organization), Organization: pr.Organization},
				schoolSet:   map[string]bool{},
				disciplineC: map[string]int{},
			}
			byOrg[pr.Organization] = a
		}
		a.p.Students += pr.Students
		a.disciplineC[pr.Discipline]++
		if !a.schoolSet[pr.SchoolID] {
			a.schoolSet[pr.SchoolID] = true
			a.sumLat += s.Lat
			a.sumLng += s.Lng
			a.p.Schools = append(a.p.Schools, PartnerSchool{
				ID: s.ID, Name: s.Name, Lat: s.Lat, Lng: s.Lng, Region: s.Region,
				Discipline: pr.Discipline, Students: pr.Students, Impact: pr.Impact,
			})
		}
	}

	partners := make([]Partner, 0, len(byOrg))
	for _, a := range byOrg {
		n := len(a.schoolSet)
		a.p.SchoolCount = n
		if n > 0 {
			a.p.Lat = a.sumLat / float64(n)
			a.p.Lng = a.sumLng / float64(n)
		}
		primary, maxC := "", 0
		for d, c := range a.disciplineC {
			a.p.Disciplines = append(a.p.Disciplines, d)
			if c > maxC {
				maxC, primary = c, d
			}
		}
		a.p.PrimaryDiscipline = primary
		a.p.ReachLevel = reachLevel(n)
		partners = append(partners, a.p)
	}
	return partners
}

// rebuildPartnersGeoJSON caches the tiny public partner point layer.
func rebuildPartnersGeoJSON() {
	partners := buildPartners()

	fc := FeatureCollection{Type: "FeatureCollection", Features: make([]Feature, 0, len(partners))}
	for _, p := range partners {
		fc.Features = append(fc.Features, Feature{
			Type: "Feature",
			Properties: map[string]interface{}{
				"id":                 p.ID,
				"organization":       p.Organization,
				"school_count":       p.SchoolCount,
				"students":           p.Students,
				"primary_discipline": p.PrimaryDiscipline,
				"disciplines":        strings.Join(p.Disciplines, ", "),
				"reach_level":        p.ReachLevel,
			},
			Geometry: map[string]interface{}{
				"type":        "Point",
				"coordinates": []float64{p.Lng, p.Lat},
			},
		})
	}

	data, err := json.Marshal(fc)
	if err != nil {
		log.Printf("⚠️ failed to build partners.geojson: %v", err)
		return
	}
	partnersCacheMu.Lock()
	partnersGeoJSONCache = data
	partnersCacheMu.Unlock()
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func handlePartnersGeoJSON(w http.ResponseWriter, r *http.Request) {
	partnersCacheMu.RLock()
	data := partnersGeoJSONCache
	partnersCacheMu.RUnlock()
	if data == nil {
		rebuildPartnersGeoJSON()
		partnersCacheMu.RLock()
		data = partnersGeoJSONCache
		partnersCacheMu.RUnlock()
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// handlePartnerDetail returns one org with the full list of schools it serves.
func handlePartnerDetail(w http.ResponseWriter, r *http.Request) {
	id := mux.Vars(r)["id"]
	for _, p := range buildPartners() {
		if p.ID == id {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(p)
			return
		}
	}
	http.Error(w, "partner not found", http.StatusNotFound)
}
