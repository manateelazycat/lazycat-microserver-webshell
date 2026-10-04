package localserver

import (
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func fileRoot() string {
	home, _ := os.UserHomeDir()
	return filepath.VolumeName(home) + string(filepath.Separator)
}
func displayPath(path string) string {
	if path == "" {
		return ""
	}
	relative, err := filepath.Rel(fileRoot(), path)
	if err != nil {
		return ""
	}
	if relative == "." {
		return "/"
	}
	return "/" + filepath.ToSlash(relative)
}
func localPath(value string) (string, error) {
	if strings.IndexByte(value, 0) >= 0 {
		return "", errors.New("invalid path")
	}
	root := fileRoot()
	value = strings.ReplaceAll(strings.TrimSpace(value), "\\", "/")
	for _, part := range strings.Split(value, "/") {
		if part == ".." {
			return "", errors.New("path escapes root directory")
		}
	}
	var path string
	if filepath.VolumeName(value) != "" {
		path = filepath.Clean(value)
	} else {
		path = filepath.Join(root, filepath.FromSlash(strings.TrimLeft(value, "/")))
	}
	real, err := filepath.EvalSymlinks(path)
	if err != nil {
		return "", err
	}
	relative, err := filepath.Rel(root, real)
	if err != nil || filepath.IsAbs(relative) || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", errors.New("path escapes root directory")
	}
	return real, nil
}

type fileEntry struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	Type     string `json:"type"`
	Size     int64  `json:"size"`
	Modified int64  `json:"modified"`
}

func entry(path string) (fileEntry, error) {
	real, err := localPath(path)
	if err != nil {
		return fileEntry{}, err
	}
	st, err := os.Stat(real)
	if err != nil {
		return fileEntry{}, err
	}
	kind := "file"
	if st.IsDir() {
		kind = "dir"
	}
	size := st.Size()
	if st.IsDir() {
		size = 0
	}
	return fileEntry{Name: filepath.Base(path), Path: displayPath(path), Type: kind, Size: size, Modified: st.ModTime().Unix()}, nil
}

func (s *Server) files(w http.ResponseWriter, r *http.Request) {
	var err error
	switch {
	case r.Method == http.MethodGet && r.URL.Path == "/attachments/files":
		var path string
		path, err = localPath(r.URL.Query().Get("path"))
		if err != nil {
			break
		}
		var files []os.DirEntry
		files, err = os.ReadDir(path)
		if err != nil {
			break
		}
		items := make([]fileEntry, 0, len(files))
		for _, f := range files {
			if e, eErr := entry(filepath.Join(path, f.Name())); eErr == nil {
				items = append(items, e)
			}
		}
		sort.SliceStable(items, func(i, j int) bool {
			if items[i].Type != items[j].Type {
				return items[i].Type == "dir"
			}
			return items[i].Name < items[j].Name
		})
		parent := filepath.Dir(path)
		if parent == path {
			parent = ""
		}
		reply(w, 200, map[string]any{"path": displayPath(path), "parent": displayPath(parent), "entries": items})
		return
	case r.Method == http.MethodGet && r.URL.Path == "/attachments/stat":
		paths := r.URL.Query()["path"]
		if len(paths) == 0 || len(paths) > 64 {
			err = errors.New("invalid path count")
			break
		}
		items := make([]fileEntry, 0, len(paths))
		for _, p := range paths {
			var resolved string
			resolved, err = localPath(p)
			if err != nil {
				break
			}
			var item fileEntry
			item, err = entry(resolved)
			if err != nil {
				break
			}
			items = append(items, item)
		}
		if err == nil {
			reply(w, 200, items)
			return
		}
	case r.Method == http.MethodGet && r.URL.Path == "/attachments/open":
		var path string
		path, err = localPath(r.URL.Query().Get("path"))
		if err != nil {
			break
		}
		var file *os.File
		file, err = os.Open(path)
		if err != nil {
			break
		}
		defer file.Close()
		info, statErr := file.Stat()
		if statErr != nil {
			err = statErr
			break
		}
		if !info.Mode().IsRegular() {
			err = errors.New("selected path is not a regular file")
			break
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		http.ServeContent(w, r, info.Name(), info.ModTime(), file)
		return
	case r.Method == http.MethodPost && r.URL.Path == "/attachments":
		err = s.upload(w, r)
		if err == nil {
			return
		}
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	reply(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
}

func (s *Server) upload(w http.ResponseWriter, r *http.Request) error {
	r.Body = http.MaxBytesReader(w, r.Body, 32*(2<<30)+1<<20)
	reader, err := r.MultipartReader()
	if err != nil {
		return err
	}
	base := os.TempDir()
	if relative, err := filepath.Rel(fileRoot(), base); err != nil || filepath.IsAbs(relative) || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		base, err = os.UserHomeDir()
		if err != nil {
			return err
		}
	}
	dir, err := os.MkdirTemp(base, "lightos-upload-")
	if err != nil {
		return err
	}
	var created []string
	success := false
	defer func() {
		if !success {
			for _, path := range created {
				_ = os.Remove(path)
			}
			_ = os.Remove(dir)
		}
	}()
	files := make([]fileEntry, 0)
	for {
		part, err := reader.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
		if part.FormName() != "file" || part.FileName() == "" {
			part.Close()
			continue
		}
		if len(files) >= 32 {
			return errors.New("too many files")
		}
		name := filepath.Base(strings.ReplaceAll(part.FileName(), "\\", "/"))
		if name == "." || name == ".." || name == "" {
			return errors.New("invalid filename")
		}
		file, err := os.OpenFile(filepath.Join(dir, name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return err
		}
		created = append(created, file.Name())
		size, copyErr := io.Copy(file, io.LimitReader(part, (2<<30)+1))
		closeErr := file.Close()
		_ = part.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if size > 2<<30 {
			return errors.New("file exceeds 2 GiB")
		}
		files = append(files, fileEntry{Name: filepath.Base(file.Name()), Path: displayPath(file.Name()), Type: "file", Size: size})
	}
	if len(files) == 0 {
		return errors.New("file is required")
	}
	success = true
	reply(w, http.StatusCreated, map[string]any{"files": files})
	return nil
}
