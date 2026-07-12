package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"net/url"
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
// Pulls a **Schools** table and a linked **Programs** table from Airtable and
// maps them to IncomingSchool (programs attached to their school). Feeds the
// SAME validation pipeline, so all the accept/clean/flag guarantees still apply.
//
//   AIRTABLE_TOKEN            personal access token (data.records:read)
//   AIRTABLE_BASE_ID          the base id (app…)
//   AIRTABLE_SCHOOLS_TABLE    default "Schools"
//   AIRTABLE_PROGRAMS_TABLE   default "Programs"

type airtableRecord struct {
	ID     string                 `json:"id"`
	Fields map[string]interface{} `json:"fields"`
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// airtableBase returns just the base id, tolerating a pasted URL path like
// "appXXXX/tblYYYY/viwZZZZ" by keeping only the leading app… segment.
func airtableBase() string {
	b := strings.TrimSpace(os.Getenv("AIRTABLE_BASE_ID"))
	if i := strings.IndexByte(b, '/'); i >= 0 {
		b = b[:i]
	}
	return b
}

// airtableFetchAll pages through every record in a table (Airtable caps at 100/page).
func airtableFetchAll(base, table, token string) ([]airtableRecord, error) {
	var all []airtableRecord
	offset := ""
	client := &http.Client{Timeout: 20 * time.Second}
	for {
		u := fmt.Sprintf("https://api.airtable.com/v0/%s/%s?pageSize=100", base, url.PathEscape(table))
		if offset != "" {
			u += "&offset=" + url.QueryEscape(offset)
		}
		req, _ := http.NewRequest("GET", u, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		resp, err := client.Do(req)
		if err != nil {
			return nil, err
		}
		body, _ := ioutil.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode != 200 {
			return nil, fmt.Errorf("airtable table %q returned %d: %s", table, resp.StatusCode, string(body))
		}
		var page struct {
			Records []airtableRecord `json:"records"`
			Offset  string           `json:"offset"`
		}
		if err := json.Unmarshal(body, &page); err != nil {
			return nil, err
		}
		all = append(all, page.Records...)
		if page.Offset == "" {
			break
		}
		offset = page.Offset
	}
	return all, nil
}

func fetchAirtableSchools() ([]IncomingSchool, error) {
	token := os.Getenv("AIRTABLE_TOKEN")
	base := airtableBase()
	if token == "" || base == "" {
		return nil, fmt.Errorf("AIRTABLE_TOKEN and AIRTABLE_BASE_ID must be set")
	}
	schoolsTable := envOr("AIRTABLE_SCHOOLS_TABLE", "Schools")
	programsTable := envOr("AIRTABLE_PROGRAMS_TABLE", "Programs")

	str := func(v interface{}) string { s, _ := v.(string); return s }
	field := func(f map[string]interface{}, keys ...string) interface{} {
		for _, k := range keys {
			if v, ok := f[k]; ok {
				return v
			}
		}
		return nil
	}

	// 1) Schools — keyed by Airtable record id so programs can link back
	schoolRecs, err := airtableFetchAll(base, schoolsTable, token)
	if err != nil {
		return nil, err
	}
	byRec := make(map[string]*IncomingSchool, len(schoolRecs))
	order := make([]string, 0, len(schoolRecs))
	for _, rec := range schoolRecs {
		f := rec.Fields
		byRec[rec.ID] = &IncomingSchool{
			Name:     str(field(f, "Name", "School", "name")),
			Address:  str(field(f, "Address", "address")),
			Lat:      field(f, "Lat", "Latitude", "lat"),
			Lng:      field(f, "Lng", "Longitude", "lng", "Long"),
			Region:   str(field(f, "Region", "region")),
			Students: field(f, "Students", "Enrollment", "students"),
			ImageURL: str(field(f, "Image", "ImageURL", "Photo")),
		}
		order = append(order, rec.ID)
	}

	// 2) Programs — attach each to its linked school (Programs table is optional)
	if programRecs, perr := airtableFetchAll(base, programsTable, token); perr == nil {
		for _, rec := range programRecs {
			f := rec.Fields
			var schoolRecID string
			if arr, ok := field(f, "School", "Schools", "school").([]interface{}); ok && len(arr) > 0 {
				schoolRecID, _ = arr[0].(string)
			}
			s := byRec[schoolRecID]
			if s == nil {
				continue
			}
			s.Programs = append(s.Programs, IncomingProgram{
				Organization:  str(field(f, "Organization", "Org", "Partner")),
				Discipline:    str(field(f, "Discipline", "discipline")),
				Students:      field(f, "Students", "students"),
				Participation: field(f, "Participation", "participation"),
				Impact:        field(f, "Impact", "impact"),
			})
		}
	}

	out := make([]IncomingSchool, 0, len(order))
	for _, id := range order {
		out = append(out, *byRec[id])
	}
	return out, nil
}

// ── Handlers ─────────────────────────────────────────────────────────────────

func RegisterSyncRoutes(r *mux.Router) {
	r.HandleFunc("/sync/validate", handleSyncValidate).Methods("POST")
	r.HandleFunc("/sync/commit", handleSyncCommit).Methods("POST")
	r.HandleFunc("/sync/report", handleSyncReport).Methods("GET")
	r.HandleFunc("/sync/airtable/schema", handleAirtableSchema).Methods("GET")
}

// handleAirtableSchema introspects the configured base via Airtable's Metadata
// API (token needs schema.bases:read) — lists every table and its fields/types
// so we can map your real base to the Schools/Programs model.
func handleAirtableSchema(w http.ResponseWriter, r *http.Request) {
	token := os.Getenv("AIRTABLE_TOKEN")
	base := airtableBase()
	if token == "" || base == "" {
		http.Error(w, "set AIRTABLE_TOKEN and AIRTABLE_BASE_ID", http.StatusBadRequest)
		return
	}
	u := fmt.Sprintf("https://api.airtable.com/v0/meta/bases/%s/tables", url.PathEscape(base))
	req, _ := http.NewRequest("GET", u, nil)
	req.Header.Set("Authorization", "Bearer "+token)
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	body, _ := ioutil.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		http.Error(w, fmt.Sprintf("airtable meta returned %d: %s", resp.StatusCode, string(body)), http.StatusBadGateway)
		return
	}

	var meta struct {
		Tables []struct {
			Name   string `json:"name"`
			Fields []struct {
				Name string `json:"name"`
				Type string `json:"type"`
			} `json:"fields"`
		} `json:"tables"`
	}
	json.Unmarshal(body, &meta)

	type field struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	type table struct {
		Name   string  `json:"name"`
		Fields []field `json:"fields"`
	}
	out := struct {
		Tables []table `json:"tables"`
	}{}
	for _, t := range meta.Tables {
		ti := table{Name: t.Name}
		for _, f := range t.Fields {
			ti.Fields = append(ti.Fields, field{Name: f.Name, Type: f.Type})
		}
		out.Tables = append(out.Tables, ti)
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(out)
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
