package routing

import (
	"math"
)

type Node struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	Lat  float64 `json:"lat"`
	Lon  float64 `json:"lon"`
}

type Edge struct {
	From   string
	To     string
	Weight float64
}

type Graph struct {
	Nodes map[string]*Node
	Edges map[string][]*Edge
}

func NewGraph() *Graph {
	return &Graph{
		Nodes: make(map[string]*Node),
		Edges: make(map[string][]*Edge),
	}
}

func (g *Graph) AddNode(n *Node) {
	g.Nodes[n.ID] = n
}

func (g *Graph) AddEdge(from, to string, weight float64) {
	g.Edges[from] = append(g.Edges[from], &Edge{From: from, To: to, Weight: weight})
	// Assuming undirected for simplicity in MVP
	g.Edges[to] = append(g.Edges[to], &Edge{From: to, To: from, Weight: weight})
}

// Haversine distance for heuristic
func Distance(n1, n2 *Node) float64 {
	const R = 6371 // km
	dLat := (n2.Lat - n1.Lat) * math.Pi / 180
	dLon := (n2.Lon - n1.Lon) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(n1.Lat*math.Pi/180)*math.Cos(n2.Lat*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}
