package core

import (
	"errors"
	"sort"
	"strings"
)

func splitLayoutNode(node *layoutNode, targetPaneID, direction, newPaneID string) bool {
	if node == nil {
		return false
	}
	if node.Type == "leaf" && node.PaneID == targetPaneID {
		outerSize := node.Size
		node.Type = "split"
		node.Direction = direction
		node.PaneID = ""
		node.Children = []*layoutNode{
			{Type: "leaf", PaneID: targetPaneID, Size: 50},
			{Type: "leaf", PaneID: newPaneID, Size: 50},
		}
		node.Size = outerSize
		return true
	}
	for _, child := range node.Children {
		if splitLayoutNode(child, targetPaneID, direction, newPaneID) {
			return true
		}
	}
	return false
}

func removePaneFromLayoutNode(node *layoutNode, paneID string) *layoutNode {
	if node == nil {
		return nil
	}
	if node.Type == "leaf" {
		if node.PaneID == paneID {
			return nil
		}
		return cloneLayout(node)
	}
	children := make([]*layoutNode, 0, len(node.Children))
	for _, child := range node.Children {
		if next := removePaneFromLayoutNode(child, paneID); next != nil {
			children = append(children, next)
		}
	}
	if len(children) == 0 {
		return nil
	}
	if len(children) == 1 {
		if node.Size > 0 {
			children[0].Size = node.Size
		}
		return children[0]
	}
	next := cloneLayout(node)
	next.Children = children
	share := 100 / float64(len(children))
	for _, child := range next.Children {
		if child.Size <= 0 {
			child.Size = share
		}
	}
	return next
}

func validateLayoutForTab(node *layoutNode, tab *terminalTab) error {
	seen := make(map[string]int)
	if err := validateLayoutNode(node, tab, seen); err != nil {
		return err
	}
	if len(seen) != len(tab.PaneIDs) {
		return errors.New("layout does not include every pane")
	}
	for _, paneID := range tab.PaneIDs {
		if seen[paneID] != 1 {
			return errors.New("layout pane set does not match tab")
		}
	}
	return nil
}

func validateLayoutNode(node *layoutNode, tab *terminalTab, seen map[string]int) error {
	if node == nil {
		return errors.New("layout node is required")
	}
	switch node.Type {
	case "leaf":
		if !tab.hasPane(node.PaneID) {
			return errors.New("layout references unknown pane")
		}
		seen[node.PaneID]++
		if seen[node.PaneID] > 1 {
			return errors.New("layout references pane more than once")
		}
		node.Direction = ""
		node.Children = nil
	case "split":
		if node.Direction != "vertical" && node.Direction != "horizontal" {
			return errors.New("invalid layout direction")
		}
		if len(node.Children) < 2 {
			return errors.New("split layout needs at least two children")
		}
		node.PaneID = ""
		totalSized := 0.0
		for _, child := range node.Children {
			if err := validateLayoutNode(child, tab, seen); err != nil {
				return err
			}
			if child.Size < 5 {
				child.Size = 5
			}
			if child.Size > 95 {
				child.Size = 95
			}
			totalSized += child.Size
		}
		if totalSized <= 0 {
			share := 100 / float64(len(node.Children))
			for _, child := range node.Children {
				child.Size = share
			}
		}
	default:
		return errors.New("invalid layout node type")
	}
	return nil
}

func collectLayoutPaneIDs(node *layoutNode, result []string) []string {
	if node == nil {
		return result
	}
	if node.Type == "leaf" {
		return append(result, node.PaneID)
	}
	for _, child := range node.Children {
		result = collectLayoutPaneIDs(child, result)
	}
	return result
}

func adjacentPaneID(node *layoutNode, paneID string) (string, bool) {
	if node == nil {
		return "", false
	}
	if node.Type == "leaf" {
		return "", node.PaneID == paneID
	}
	for index, child := range node.Children {
		candidate, contains := adjacentPaneID(child, paneID)
		if !contains {
			continue
		}
		if candidate != "" {
			return candidate, true
		}
		if index+1 < len(node.Children) {
			return firstLayoutPaneID(node.Children[index+1]), true
		}
		if index > 0 {
			return lastLayoutPaneID(node.Children[index-1]), true
		}
		return "", true
	}
	return "", false
}

func firstLayoutPaneID(node *layoutNode) string {
	if node == nil {
		return ""
	}
	if node.Type == "leaf" {
		return node.PaneID
	}
	for _, child := range node.Children {
		if paneID := firstLayoutPaneID(child); paneID != "" {
			return paneID
		}
	}
	return ""
}

func lastLayoutPaneID(node *layoutNode) string {
	if node == nil {
		return ""
	}
	if node.Type == "leaf" {
		return node.PaneID
	}
	for index := len(node.Children) - 1; index >= 0; index-- {
		if paneID := lastLayoutPaneID(node.Children[index]); paneID != "" {
			return paneID
		}
	}
	return ""
}

func firstExistingPaneID(current string, paneIDs []string) string {
	for _, paneID := range paneIDs {
		if paneID == current {
			return current
		}
	}
	if len(paneIDs) == 0 {
		return ""
	}
	return paneIDs[0]
}

func cloneLayout(node *layoutNode) *layoutNode {
	if node == nil {
		return nil
	}
	next := &layoutNode{
		Type:      node.Type,
		Direction: node.Direction,
		PaneID:    node.PaneID,
		Size:      node.Size,
	}
	if len(node.Children) > 0 {
		next.Children = make([]*layoutNode, 0, len(node.Children))
		for _, child := range node.Children {
			next.Children = append(next.Children, cloneLayout(child))
		}
	}
	return next
}

func NormalizeCols(cols int) int {
	if cols <= 0 {
		return defaultTerminalCols
	}
	return min(cols, 500)
}

func NormalizeRows(rows int) int {
	if rows <= 0 {
		return defaultTerminalRows
	}
	return min(rows, 300)
}

func normalizeTerminalPixelDimension(value int) int {
	if value <= 0 {
		return 0
	}
	return min(value, int(^uint16(0)))
}

func normalizeTerminalHexColor(value, fallback string) string {
	value = strings.TrimSpace(value)
	if strings.HasPrefix(value, "#") {
		value = value[1:]
	}
	if len(value) != 6 {
		return fallback
	}
	for _, r := range value {
		if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
			return fallback
		}
	}
	return "#" + strings.ToLower(value)
}

func sortedPaneIDs(panes map[string]*terminalPane) []string {
	ids := make([]string, 0, len(panes))
	for id := range panes {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
