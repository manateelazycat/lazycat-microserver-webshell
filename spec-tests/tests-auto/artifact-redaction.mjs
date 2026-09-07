import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";

const sensitive = /^(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|token|access_token|refresh_token|ticket|lzc-auth-token|lzc-api-auth-token)$/i;

export function redactDiagnosticText(text, secrets = []) {
  let result = text;
  for (const value of secrets.filter(Boolean)) {
    for (const encoded of new Set([value, encodeURIComponent(value), JSON.stringify(value).slice(1, -1)])) {
      result = result.split(encoded).join("[redacted]");
    }
  }
  result = result.replace(/([?&](?:access_token|refresh_token|token|ticket)=)[^&#\s"']+/gi, "$1[redacted]");
  const clean = (value) => {
    if (!value || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(clean);
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
      sensitive.test(key) || (key === "value" && sensitive.test(String(value.name || "")))
        ? "[redacted]" : key === "cookies" ? [] : clean(item),
    ]));
  };
  return result.split("\n").map((line) => {
    try { return JSON.stringify(clean(JSON.parse(line))); } catch { return line; }
  }).join("\n");
}

export async function redactBrowserArtifacts(directory, { secrets = [], yauzl, yazl }) {
  for (const name of await fs.readdir(directory)) {
    const filename = path.join(directory, name);
    if (/\.(?:json|jsonl|txt)$/.test(name)) {
      await fs.writeFile(filename, redactDiagnosticText(await fs.readFile(filename, "utf8"), secrets));
    } else if (name.endsWith(".zip")) {
      const input = await new Promise((resolve, reject) => yauzl.open(filename, { lazyEntries: true }, (error, zip) => error ? reject(error) : resolve(zip)));
      const output = new yazl.ZipFile();
      const temporary = `${filename}.redacted`;
      const written = pipeline(output.outputStream, createWriteStream(temporary));
      try {
        await new Promise((resolve, reject) => {
          input.on("error", reject);
          input.on("end", resolve);
          input.on("entry", (entry) => {
            if (entry.fileName.endsWith("/")) { input.readEntry(); return; }
            input.openReadStream(entry, async (error, stream) => {
              if (error) { reject(error); return; }
              try {
                const chunks = [];
                for await (const chunk of stream) chunks.push(chunk);
                let data = Buffer.concat(chunks);
                // Keep image/binary evidence intact; sanitize textual trace,
                // network headers and response bodies before persisting the zip.
                try {
                  const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
                  data = Buffer.from(redactDiagnosticText(text, secrets));
                } catch { /* binary resource */ }
                output.addBuffer(data, entry.fileName);
                input.readEntry();
              } catch (failure) { reject(failure); }
            });
          });
          input.readEntry();
        });
        output.end();
        await written;
        await fs.rename(temporary, filename);
      } catch (error) {
        input.close();
        output.end();
        await written.catch(() => {});
        await fs.rm(temporary, { force: true });
        throw error;
      }
    }
  }
}
