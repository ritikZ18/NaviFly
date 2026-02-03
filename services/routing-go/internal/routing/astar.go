package routing

import (
	"container/heap"
	"fmt"
)

type Item struct {
	nodeID   string
	priority float64
	index    int
}

type PriorityQueue []*Item

func (pq PriorityQueue) Len() int           { return len(pq) }
func (pq PriorityQueue) Less(i, j int) bool { return pq[i].priority < pq[j].priority }
func (pq PriorityQueue) Swap(i, j int)      { pq[i], pq[j] = pq[j], pq[i]; pq[i].index = i; pq[j].index = j }
func (pq *PriorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*Item)
	item.index = n
	*pq = append(*pq, item)
}
func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

func AStar(g *Graph, startID, goalID string) ([]string, float64) {
	startNode, ok := g.Nodes[startID]
	if !ok { return nil, 0 }
	goalNode, ok := g.Nodes[goalID]
	if !ok { return nil, 0 }

	pq := &PriorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &Item{nodeID: startID, priority: 0})

	cameFrom := make(map[string]string)
	gScore := make(map[string]float64)
	fScore := make(map[string]float64)

	for id := range g.Nodes {
		gScore[id] = 1e18 // Infinity
		fScore[id] = 1e18
	}

	gScore[startID] = 0
	fScore[startID] = Distance(startNode, goalNode)

	for pq.Len() > 0 {
		currentID := heap.Pop(pq).(*Item).nodeID

		if currentID == goalID {
			return reconstructPath(cameFrom, currentID), gScore[currentID]
		}

		for _, edge := range g.Edges[currentID] {
			tentativeGScore := gScore[currentID] + edge.Weight
			if tentativeGScore < gScore[edge.To] {
				cameFrom[edge.To] = currentID
				gScore[edge.To] = tentativeGScore
				fScore[edge.To] = tentativeGScore + Distance(g.Nodes[edge.To], goalNode)
				heap.Push(pq, &Item{nodeID: edge.To, priority: fScore[edge.To]})
			}
		}
	}

	return nil, 0
}

func reconstructPath(cameFrom map[string]string, current string) []string {
	totalPath := []string{current}
	for {
		next, ok := cameFrom[current]
		if !ok { break }
		totalPath = append([]string{next}, totalPath...)
		current = next
	}
	return totalPath
}

type Instruction struct {
	Text     string `json:"text"`
	Distance float64 `json:"distance"`
}

func GenerateInstructions(path []string, g *Graph) []Instruction {
	instructions := []Instruction{}
	if len(path) < 2 { return instructions }

	for i := 0; i < len(path)-1; i++ {
		fromNode := g.Nodes[path[i]]
		toNode := g.Nodes[path[i+1]]
		dist := Distance(fromNode, toNode)
		
		text := fmt.Sprintf("Continue for %.1f km", dist)
		if i == 0 {
			text = fmt.Sprintf("Start journey. Drive %.1f km", dist)
		} else if i == len(path)-2 {
			text = fmt.Sprintf("Turn towards destination. Drive %.1f km", dist)
		}

		instructions = append(instructions, Instruction{
			Text:     text,
			Distance: dist,
		})
	}
	return instructions
}
