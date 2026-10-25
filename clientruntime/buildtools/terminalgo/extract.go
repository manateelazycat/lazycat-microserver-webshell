package terminalgo

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// Only verified official archives reach this function. Extraction is confined
// to a fresh private staging directory; links and special files are rejected.
func extract(ctx context.Context, archivePath, destination string) error {
	write := func(name string, mode os.FileMode, source io.Reader) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		name = strings.TrimSuffix(name, "/")
		if !filepath.IsLocal(name) || strings.Contains(name, "\\") || (name != "go" && !strings.HasPrefix(name, "go/")) {
			return fmt.Errorf("invalid Go archive path %q", name)
		}
		path := filepath.Join(destination, filepath.FromSlash(name))
		if mode.IsDir() {
			return os.MkdirAll(path, 0755)
		}
		if !mode.IsRegular() {
			return fmt.Errorf("unsupported Go archive entry %q", name)
		}
		if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
			return err
		}
		file, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0644|mode.Perm()&0111)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(file, source)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	}
	if strings.HasSuffix(archivePath, ".zip") {
		reader, err := zip.OpenReader(archivePath)
		if err != nil {
			return err
		}
		defer reader.Close()
		for _, entry := range reader.File {
			body, err := entry.Open()
			if err != nil {
				return err
			}
			err = write(entry.Name, entry.Mode(), body)
			body.Close()
			if err != nil {
				return err
			}
		}
		return nil
	}
	file, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer file.Close()
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return err
	}
	defer gzipReader.Close()
	reader := tar.NewReader(gzipReader)
	for {
		entry, err := reader.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if err := write(entry.Name, entry.FileInfo().Mode(), reader); err != nil {
			return err
		}
	}
}
