package unix

import (
	core "lcmd-webshell/core"
)

// Compatibility names keep the package move separate from protocol changes.
const AgentProtocolVersion = core.AgentProtocolVersion

type AgentRequest = core.AgentRequest
type AgentResponse = core.AgentResponse
type PaneActivity = core.PaneActivity
