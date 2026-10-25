module lcmd-webshell/clientruntime

go 1.26.0

require (
	golang.org/x/sys v0.48.0
	lcmd-webshell v0.0.0
	lcmd-webshell/hostmetrics v0.0.0
	lcmd-webshell/sshserver v0.0.0
)

require (
	github.com/Microsoft/go-winio v0.6.2 // indirect
	github.com/charmbracelet/x/conpty v0.1.1 // indirect
	github.com/charmbracelet/x/errors v0.0.0-20240508181413-e8d8b6e2de86 // indirect
	github.com/creack/pty v1.1.24 // indirect
	github.com/ebitengine/purego v0.10.2 // indirect
	github.com/go-ole/go-ole v1.2.6 // indirect
	github.com/google/shlex v0.0.0-20191202100458-e7afc7fbc510 // indirect
	github.com/gorilla/websocket v1.5.3 // indirect
	github.com/kr/fs v0.1.0 // indirect
	github.com/lufia/plan9stats v0.0.0-20211012122336-39d0f177ccd0 // indirect
	github.com/pkg/sftp v1.13.10 // indirect
	github.com/power-devops/perfstat v0.0.0-20240221224432-82ca36839d55 // indirect
	github.com/shirou/gopsutil/v4 v4.26.8 // indirect
	github.com/tetratelabs/wazero v1.10.1 // indirect
	github.com/tklauser/go-sysconf v0.3.16 // indirect
	github.com/tklauser/numcpus v0.11.0 // indirect
	github.com/yusufpapurcu/wmi v1.2.4 // indirect
	golang.org/x/crypto v0.57.0 // indirect
	golang.org/x/image v0.36.0 // indirect
	golang.org/x/text v0.42.0 // indirect
)

replace lcmd-webshell => ..

replace lcmd-webshell/sshserver => ../sshserver

replace lcmd-webshell/hostmetrics => ../hostmetrics
