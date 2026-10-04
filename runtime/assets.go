// Package runtimeassets owns the existing on-disk runtime assets embedded by
// the Go core. Browser builds and checkpoint generation use this single file.
package runtimeassets

import _ "embed"

//go:embed static/ghostty-vt.wasm
var CheckpointWASM []byte
