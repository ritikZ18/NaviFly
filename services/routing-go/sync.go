package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
)

// ── External data sync: staging + validation middleware ──────────────────────
// External data (e.g. Airtable) is NEVER written straight into the live tables.
// Instead it flows through a two-stage pipeline:
//
//   1. VALIDATE  → each incoming row is checked + cleaned into a `sync_records`
//                  staging table. The live DB is untouched. A report is returned.
//   2. COMMIT    → only accepted/cleaned rows are promoted to School/Program.
//                  Flagged rows stay out, with a reason ("migration failed …").
//
// Every row ends up: accepted | cleaned (auto-repaired) | flagged (unfixable).

// Miami-Dade sanity bounds for coordinates
const (
	mdLatMin, mdLatMax = 25.1, 26.05
	mdLngMin, mdLngMax = -80.95, -80.0
)

// ── Incoming (loosely typed on purpose — external data is messy) ──
type IncomingProgram struct {
	Organization  string      `json:"organization"`
	Discipline    string      `json:"discipline"`
	Students      interface{} `json:"students"`
	Participation interface{} `json:"participation"`
	Impact        interface{} `json:"impact"`
}

type IncomingSchool struct {
	ID       string            `json:"id"`
	Name     string            `json:"name"`
	Address  string            `json:"address"`
	Lat      interface{}       `json:"lat"`
	Lng      interface{}       `json:"lng"`
	Region   string            `json:"region"`
	Students interface{}       `json:"students"`
	ImageURL string            `json:"image_url"`
	Programs []IncomingProgram `json:"programs"`
}

// ── Staging table ──
type SyncRecord struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	BatchID   string    `gorm:"index" json:"batch_id"`
	SchoolID  string    `json:"school_id"`
	Status    string    `json:"status"` // accepted | cleaned | flagged
	Issues    []byte    `gorm:"type:jsonb" json:"-"`
	Cleaned   []byte    `gorm:"type:jsonb" json:"-"`
	Raw       []byte    `gorm:"type:jsonb" json:"-"`
	Promoted  bool      `json:"promoted"`
	CreatedAt time.Time `json:"created_at"`
}

type ValidationIssue struct {
	Field   string `json:"field"`
	Kind    string `json:"kind"` // "fixed" | "error"
	Message string `json:"message"`
}

type RecordReport struct {
	SchoolID string            `json:"school_id"`
	Name     string            `json:"name"`
	Status   string            `json:"status"`
	Issues   []ValidationIssue `json:"issues"`
}

type SyncReport struct {
	BatchID  string         `json:"batch_id"`
	Total    int            `json:"total"`
	Accepted int            `json:"accepted"`
	Cleaned  int            `json:"cleaned"`
	Flagged  int            `json:"flagged"`
	Records  []RecordReport `json:"records"`
}

// ── Coercion helpers ──

func toFloat(v interface{}) (float64, bool) {
	switch t := v.(type) {
	case nil:
		return 0, false
	case float64:
		return t, true
	case float32:
		return float64(t), true
	case int:
		return float64(t), true
	case json.Number:
		f, err := t.Float64()
		return f, err == nil
	case string:
		s := strings.TrimSpace(t)
		if s == "" {
			return 0, false
		}
		f, err := strconv.ParseFloat(s, 64)
		return f, err == nil
	}
	return 0, false
}

func toInt(v interface{}) (int, bool) {
	f, ok := toFloat(v)
	if !ok {
		return 0, false
	}
	return int(f), true
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func normalizeDiscipline(d string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(d)) {
	case "music":
		return "Music", true
	case "dance":
		return "Dance", true
	case "visual arts", "visual art", "visual", "art", "arts":
		return "Visual Arts", true
	case "theater", "theatre", "drama":
		return "Theater", true
	}
	return strings.TrimSpace(d), false
}

func normalizeRegion(r string, lat float64, haveLat bool) (string, bool) {
	s := strings.ToLower(strings.TrimSpace(r))
	switch {
	case strings.Contains(s, "north"):
		return "North Dade", true
	case strings.Contains(s, "central"):
		return "Central Dade", true
	case strings.Contains(s, "south"):
		return "South Dade", true
	}
	if haveLat {
		switch {
		case lat >= 25.87:
			return "North Dade", true
		case lat >= 25.60:
			return "Central Dade", true
		default:
			return "South Dade", true
		}
	}
	return "", false
}

// validateAndClean checks one incoming record against the live schema, repairing
// what it can and flagging what it can't. Returns the promotable School (valid
// only when status != "flagged"), the issue list, and the status.
func validateAndClean(in IncomingSchool) (School, []ValidationIssue, string) {
	issues := []ValidationIssue{}
	status := "accepted"
	fix := func(field, msg string) {
		issues = append(issues, ValidationIssue{Field: field, Kind: "fixed", Message: msg})
		if status == "accepted" {
			status = "cleaned"
		}
	}
	fail := func(field, msg string) {
		issues = append(issues, ValidationIssue{Field: field, Kind: "error", Message: msg})
		status = "flagged"
	}

	out := School{}

	// name
	name := strings.TrimSpace(in.Name)
	if name == "" {
		fail("name", "missing school name")
	}
	out.Name = name

	// id (slug)
	id := strings.TrimSpace(in.ID)
	if id == "" {
		if name != "" {
			id = slugify(name)
			fix("id", "generated id from name → "+id)
		} else {
			fail("id", "missing id and name — cannot identify record")
		}
	} else if s := slugify(id); s != id {
		fix("id", "normalized id to slug → "+s)
		id = s
	}
	out.ID = id

	// coordinates
	lat, latOk := toFloat(in.Lat)
	lng, lngOk := toFloat(in.Lng)
	if !latOk || !lngOk {
		fail("coordinates", "missing or non-numeric lat/lng")
	} else if lat < mdLatMin || lat > mdLatMax || lng < mdLngMin || lng > mdLngMax {
		fail("coordinates", fmt.Sprintf("(%.4f, %.4f) is outside Miami-Dade bounds", lat, lng))
	} else {
		if _, isStr := in.Lat.(string); isStr {
			fix("coordinates", "parsed lat/lng from text")
		}
		out.Lat = lat
		out.Lng = lng
	}

	// region
	region, regOk := normalizeRegion(in.Region, lat, latOk && lngOk)
	if !regOk {
		fail("region", "unrecognized region and no coordinates to derive it")
	} else {
		if !strings.EqualFold(strings.TrimSpace(in.Region), region) {
			fix("region", "set region → "+region)
		}
		out.Region = region
	}

	// enrollment
	if st, ok := toInt(in.Students); ok {
		if st < 0 {
			fix("students", "clamped negative enrollment to 0")
			st = 0
		} else if _, isStr := in.Students.(string); isStr {
			fix("students", "parsed enrollment from text")
		}
		out.Students = st
	} else {
		fix("students", "missing enrollment → defaulted to 0")
		out.Students = 0
	}

	out.Address = strings.TrimSpace(in.Address)
	out.ImageURL = strings.TrimSpace(in.ImageURL)

	// programs (drop/repair individually — a bad program never flags the school)
	for i, p := range in.Programs {
		org := strings.TrimSpace(p.Organization)
		if org == "" {
			fix(fmt.Sprintf("programs[%d]", i), "dropped a program with no organization")
			continue
		}
		disc, dOk := normalizeDiscipline(p.Discipline)
		if !dOk {
			fix(fmt.Sprintf("programs[%d].discipline", i), "unrecognized discipline '"+strings.TrimSpace(p.Discipline)+"' — kept as-is")
		} else if disc != strings.TrimSpace(p.Discipline) {
			fix(fmt.Sprintf("programs[%d].discipline", i), "normalized discipline → "+disc)
		}
		prog := Program{Organization: org, Discipline: disc}
		if v, ok := toInt(p.Students); ok {
			prog.Students = clampInt(v, 0, 1<<30)
		}
		if v, ok := toInt(p.Participation); ok {
			c := clampInt(v, 0, 100)
			if c != v {
				fix(fmt.Sprintf("programs[%d].participation", i), "clamped participation to 0–100")
			}
			prog.Participation = c
		}
		if v, ok := toInt(p.Impact); ok {
			c := clampInt(v, 0, 100)
			if c != v {
				fix(fmt.Sprintf("programs[%d].impact", i), "clamped impact to 0–100")
			}
			prog.Impact = c
		}
		out.Programs = append(out.Programs, prog)
	}

	// derived fields
	out.AccessLevel = computeAccessLevel(out.Students, out.Programs)
	if out.ImageURL == "" && out.ID != "" {
		out.ImageURL = fmt.Sprintf("https://picsum.photos/seed/%s/640/420", out.ID)
	}

	return out, issues, status
}

// runValidation stages a batch of incoming rows and returns the report.
func runValidation(records []IncomingSchool) SyncReport {
	batchID := fmt.Sprintf("batch-%d", time.Now().Unix())
	report := SyncReport{BatchID: batchID, Total: len(records)}

	for _, in := range records {
		cleaned, issues, status := validateAndClean(in)

		raw, _ := json.Marshal(in)
		issuesJSON, _ := json.Marshal(issues)
		var cleanedJSON []byte
		if status != "flagged" {
			cleanedJSON, _ = json.Marshal(cleaned)
		}
		db.Create(&SyncRecord{
			BatchID: batchID, SchoolID: cleaned.ID, Status: status,
			Issues: issuesJSON, Cleaned: cleanedJSON, Raw: raw,
		})

		report.Records = append(report.Records, RecordReport{
			SchoolID: cleaned.ID, Name: cleaned.Name, Status: status, Issues: issues,
		})
		switch status {
		case "accepted":
			report.Accepted++
		case "cleaned":
			report.Cleaned++
		case "flagged":
			report.Flagged++
		}
	}
	return report
}

type CommitReport struct {
	BatchID  string         `json:"batch_id"`
	Promoted int            `json:"promoted"`
	Failed   int            `json:"failed"`
	Failures []RecordReport `json:"failures"` // flagged rows that did NOT migrate, with reasons
}

// commitBatch promotes accepted/cleaned staged rows into the live tables.
func commitBatch(batchID string) (*CommitReport, error) {
	var recs []SyncRecord
	db.Where("batch_id = ?", batchID).Find(&recs)
	if len(recs) == 0 {
		return nil, fmt.Errorf("no staged batch %q — run /sync/validate first", batchID)
	}

	rep := &CommitReport{BatchID: batchID}
	for i := range recs {
		r := &recs[i]
		if r.Status == "flagged" || len(r.Cleaned) == 0 {
			rep.Failed++
			var issues []ValidationIssue
			json.Unmarshal(r.Issues, &issues)
			rep.Failures = append(rep.Failures, RecordReport{
				SchoolID: r.SchoolID, Status: "flagged", Issues: issues,
			})
			continue
		}
		var sch School
		if err := json.Unmarshal(r.Cleaned, &sch); err != nil {
			rep.Failed++
			continue
		}
		// upsert: replace the school and its programs atomically-ish
		db.Where("school_id = ?", sch.ID).Delete(&Program{})
		db.Where("id = ?", sch.ID).Delete(&School{})
		if err := db.Create(&sch).Error; err != nil {
			rep.Failed++
			continue
		}
		r.Promoted = true
		db.Save(r)
		rep.Promoted++
	}

	// refresh the public layers so the map reflects the new data
	rebuildSchoolsGeoJSON()
	rebuildPartnersGeoJSON()
	return rep, nil
}

func latestBatchID() string {
	var rec SyncRecord
	if err := db.Order("id desc").First(&rec).Error; err == nil {
		return rec.BatchID
	}
	return ""
}

// ── Airtable adapter (env-gated) ─────────────────────────────────────────────
// Pulls a Schools table from Airtable and maps common field names to
// IncomingSchool. Program linking is finalized once the base schema is shared.
//   AIRTABLE_TOKEN, AIRTABLE_BASE_ID, AIRTABLE_TABLE (default "Schools")

func fetchAirtableSchools() ([]IncomingSchool, error) {
	token := os.Getenv("AIRTABLE_TOKEN")
	base := os.Getenv("AIRTABLE_BASE_ID")
	table := os.Getenv("AIRTABLE_TABLE")
	if table == "" {
		table = "Schools"
	}
	if token == "" || base == "" {
		return nil, fmt.Errorf("AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set")
	}

	url := fmt.Sprintf("https://api.airtable.com/v0/%s/%s", base, table)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("airtable returned %d: %s", resp.StatusCode, string(body))
	}

	var parsed struct {
		Records []struct {
			Fields map[string]interface{} `json:"fields"`
		} `json:"records"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}

	field := func(f map[string]interface{}, keys ...string) interface{} {
		for _, k := range keys {
			if v, ok := f[k]; ok {
				return v
			}
		}
		return nil
	}
	str := func(v interface{}) string {
		if s, ok := v.(string); ok {
			return s
		}
		return ""
	}

	out := make([]IncomingSchool, 0, len(parsed.Records))
	for _, rec := range parsed.Records {
		f := rec.Fields
		out = append(out, IncomingSchool{
			ID:       str(field(f, "id", "ID", "Slug")),
			Name:     str(field(f, "Name", "School", "name")),
			Address:  str(field(f, "Address", "address")),
			Lat:      field(f, "Lat", "Latitude", "lat"),
			Lng:      field(f, "Lng", "Longitude", "lng", "Long"),
			Region:   str(field(f, "Region", "region")),
			Students: field(f, "Students", "Enrollment", "students"),
		})
	}
	return out, nil
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func RegisterSyncRoutes(r *mux.Router) {
	r.HandleFunc("/sync/validate", handleSyncValidate).Methods("POST")
	r.HandleFunc("/sync/commit", handleSyncCommit).Methods("POST")
	r.HandleFunc("/sync/report", handleSyncReport).Methods("GET")
}

// handleSyncValidate: stage + validate (dry-run — live DB untouched).
// Body: {"schools":[...]}  OR  ?source=airtable to pull from Airtable.
func handleSyncValidate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Schools []IncomingSchool `json:"schools"`
	}
	if r.Body != nil {
		json.NewDecoder(r.Body).Decode(&body)
	}
	if len(body.Schools) == 0 && r.URL.Query().Get("source") == "airtable" {
		recs, err := fetchAirtableSchools()
		if err != nil {
			http.Error(w, "airtable: "+err.Error(), http.StatusBadGateway)
			return
		}
		body.Schools = recs
	}
	if len(body.Schools) == 0 {
		http.Error(w, "no records provided (send {\"schools\":[...]} or ?source=airtable)", http.StatusBadRequest)
		return
	}
	report := runValidation(body.Schools)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

// handleSyncCommit: promote a validated batch to the live tables.
// ?batch=<id> (defaults to the most recent staged batch).
func handleSyncCommit(w http.ResponseWriter, r *http.Request) {
	batch := r.URL.Query().Get("batch")
	if batch == "" {
		batch = latestBatchID()
	}
	rep, err := commitBatch(batch)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rep)
}

// handleSyncReport: inspect a staged batch (?batch=<id>, defaults to latest).
func handleSyncReport(w http.ResponseWriter, r *http.Request) {
	batch := r.URL.Query().Get("batch")
	if batch == "" {
		batch = latestBatchID()
	}
	var recs []SyncRecord
	db.Where("batch_id = ?", batch).Find(&recs)

	report := SyncReport{BatchID: batch, Total: len(recs)}
	for _, rec := range recs {
		var issues []ValidationIssue
		json.Unmarshal(rec.Issues, &issues)
		report.Records = append(report.Records, RecordReport{
			SchoolID: rec.SchoolID, Status: rec.Status, Issues: issues,
		})
		switch rec.Status {
		case "accepted":
			report.Accepted++
		case "cleaned":
			report.Cleaned++
		case "flagged":
			report.Flagged++
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}
