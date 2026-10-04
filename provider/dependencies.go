package provider

import (
	core "lcmd-webshell/core"
	serverlog "lcmd-webshell/internal/serverlog"
	unixplatform "lcmd-webshell/unix"
)

// Compatibility names keep the package move separate from protocol changes.
const AgentProtocolVersion = core.AgentProtocolVersion
const AgentFrameText = core.AgentFrameText
const AgentFrameInput = core.AgentFrameInput
const AgentFrameGeneratedInput = core.AgentFrameGeneratedInput
const AgentFrameResize = core.AgentFrameResize
const AgentFrameDetach = core.AgentFrameDetach
const AgentReconcileMarker = core.AgentReconcileMarker

type AgentRequest = core.AgentRequest
type AgentResponse = core.AgentResponse

var WriteAgentFrame = core.WriteAgentFrame
var ReadAgentFrame = core.ReadAgentFrame

type AgentScope = core.AgentScope

var NormalizeAgentScope = core.NormalizeAgentScope
var AgentConnectionErrorPayload = core.AgentConnectionErrorPayload
var IsPaneNotFoundAttachError = core.IsPaneNotFoundAttachError
var ParsePositiveInt = core.ParsePositiveInt

const TerminalMemoryCheckpointProtocol = core.TerminalMemoryCheckpointProtocol
const TerminalQueueProtocolVersion = core.TerminalQueueProtocolVersion

type TerminalQueueClientMessage = core.TerminalQueueClientMessage
type TerminalQueueServerMessage = core.TerminalQueueServerMessage

var NewTerminalQueueBroker = core.NewTerminalQueueBroker

const WebsocketReadLimit = core.WebsocketReadLimit

type WorkspaceManager = core.WorkspaceManager

var NewWorkspaceManager = core.NewWorkspaceManager
var NewHistoryGeneration = core.NewHistoryGeneration

type HistorySyncRequest = core.HistorySyncRequest
type WorkspaceState = core.WorkspaceState
type WorkspaceActionRequest = core.WorkspaceActionRequest
type WorkspaceActivityState = core.WorkspaceActivityState
type TerminalControlMessage = core.TerminalControlMessage
type PaneActivity = core.PaneActivity

var NormalizeCols = core.NormalizeCols
var NormalizeRows = core.NormalizeRows

const WorkspaceRecoveryMaxBytes = core.WorkspaceRecoveryMaxBytes

type WorkspaceRecoveryDocument = core.WorkspaceRecoveryDocument
type WorkspaceRecoveryPane = core.WorkspaceRecoveryPane

var WorkspaceRecoveryDocumentFromState = core.WorkspaceRecoveryDocumentFromState
var NormalizeRecoveryCWD = core.NormalizeRecoveryCWD
var ValidateWorkspaceRecoveryDocument = core.ValidateWorkspaceRecoveryDocument
var KillCommand = unixplatform.KillCommand
var BuildUserIdentityExecScript = unixplatform.BuildUserIdentityExecScript
var InstanceCommandNeedsUserSwitch = unixplatform.InstanceCommandNeedsUserSwitch
var BuildUserShellBootstrapScript = unixplatform.BuildUserShellBootstrapScript
var ShellScriptQuote = unixplatform.ShellScriptQuote

const ProcScanScript = unixplatform.ProcScanScript

var NormalizeActivityTTYs = unixplatform.NormalizeActivityTTYs
var ParseProcScanOutput = unixplatform.ParseProcScanOutput
var ResolveTTYActivity = unixplatform.ResolveTTYActivity
var Enabled = serverlog.Enabled
var StartForwarder = serverlog.StartForwarder
var ParseSince = serverlog.ParseSince
var ParseAfter = serverlog.ParseAfter
