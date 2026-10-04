package provider

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type adminInfo struct {
	DeployID string `json:"deploy_id"`
	Domain   string `json:"domain"`
	BaseURL  string `json:"base_url"`
	HomeURL  string `json:"home_url,omitempty"`
}

func (s *pluginServer) handleLightOSAdminInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	info, err := s.resolveLightOSAdminInfo(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	info.HomeURL, err = buildLightOSHomeURL(info)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	if err := json.NewEncoder(w).Encode(info); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func currentDeployUIDFromEnv() string {
	for _, name := range []string{
		lazyCatAppDeployUIDEnv,
		lazyCatDeployUIDEnv,
		lazyCatUserIDEnv,
		lazyCatUserUIDEnv,
		lazyCatAppDeployIDEnv,
		lazyCatDeployIDEnv,
		lazyCatAppIDEnv,
	} {
		if uid := strings.TrimSpace(os.Getenv(name)); uid != "" {
			return uid
		}
	}
	return ""
}

func lightOSConfigValue(name string) string {
	if value, ok := os.LookupEnv(name); ok {
		return strings.TrimSpace(value)
	}
	for _, filename := range lightOSConfigEnvFiles() {
		if value, ok := readLightOSConfigFileValue(filename, name); ok {
			return value
		}
	}
	return ""
}

func lightOSConfigEnvFiles() []string {
	files := []string{"/lzcapp/pkg/content/.env", "/lzcapp/run/.env"}
	if exe, err := os.Executable(); err == nil {
		files = append(files, filepath.Join(filepath.Dir(exe), ".env"))
	}
	if cwd, err := os.Getwd(); err == nil {
		files = append(files, filepath.Join(cwd, ".env"))
	}
	return files
}

func readLightOSConfigFileValue(filename, name string) (string, bool) {
	data, err := os.ReadFile(filename)
	if err != nil {
		return "", false
	}
	prefix := name + "="
	exportPrefix := "export " + prefix
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		switch {
		case strings.HasPrefix(line, prefix):
			return unquoteLightOSConfigValue(strings.TrimSpace(strings.TrimPrefix(line, prefix))), true
		case strings.HasPrefix(line, exportPrefix):
			return unquoteLightOSConfigValue(strings.TrimSpace(strings.TrimPrefix(line, exportPrefix))), true
		}
	}
	return "", false
}

func unquoteLightOSConfigValue(value string) string {
	value = strings.TrimSpace(value)
	if len(value) >= 2 {
		quote := value[0]
		if (quote == '"' || quote == '\'') && value[len(value)-1] == quote {
			return strings.TrimSpace(value[1 : len(value)-1])
		}
	}
	return value
}

func resolveLightOSAdminInfo(ctx context.Context) (adminInfo, error) {
	output, err := exec.CommandContext(ctx, lightosctlPath, "system", "admin-info", "--json").CombinedOutput()
	if err != nil {
		text := strings.TrimSpace(string(output))
		if text == "" {
			return adminInfo{}, err
		}
		return adminInfo{}, fmt.Errorf("%w: %s", err, text)
	}
	var info adminInfo
	if err := json.Unmarshal(output, &info); err != nil {
		return adminInfo{}, err
	}
	info.DeployID = strings.TrimSpace(info.DeployID)
	info.Domain = strings.TrimSpace(info.Domain)
	info.BaseURL = strings.TrimSpace(info.BaseURL)
	if info.BaseURL == "" {
		return adminInfo{}, errors.New("lightos-admin base_url is unavailable")
	}
	if _, err := parseLightOSAdminBaseURL(info.BaseURL); err != nil {
		return adminInfo{}, err
	}
	return info, nil
}

func (s *pluginServer) resolveLightOSAdminInfo(ctx context.Context) (adminInfo, error) {
	if s != nil && s.adminInfoResolver != nil {
		return s.adminInfoResolver(ctx)
	}
	return resolveLightOSAdminInfo(ctx)
}

func parseLightOSAdminBaseURL(value string) (*url.URL, error) {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil {
		return nil, err
	}
	if parsed == nil || parsed.Scheme == "" || parsed.Host == "" {
		return nil, errors.New("invalid lightos-admin base_url")
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return nil, errors.New("invalid lightos-admin base_url scheme")
	}
	return parsed, nil
}

func buildLightOSAdminURL(baseURL string, requestURL *url.URL) (string, error) {
	base, err := parseLightOSAdminBaseURL(baseURL)
	if err != nil {
		return "", err
	}
	target := *base
	target.Path = joinURLPath(base.Path, requestURL.Path)
	target.RawQuery = requestURL.RawQuery
	target.Fragment = ""
	return target.String(), nil
}

func buildLightOSHomeURL(info adminInfo) (string, error) {
	if strings.TrimSpace(lightOSConfigValue(lazyCatAppIDEnv)) == lightOSAdminAppID {
		return "/?view=home", nil
	}
	target, err := parseLightOSAdminBaseURL(info.BaseURL)
	if err != nil {
		return "", err
	}
	query := target.Query()
	query.Set("view", "home")
	target.RawQuery = query.Encode()
	target.Fragment = ""
	return target.String(), nil
}
