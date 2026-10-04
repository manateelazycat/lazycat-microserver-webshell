const unescapeXML = (text) => String(text || "").replaceAll("&quot;", '"')
  .replaceAll("&apos;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">")
  .replaceAll("&amp;", "&");

export async function nativeSnapshot(device) {
  await device.adb(["shell", "uiautomator", "dump", "/sdcard/webshell-test-window.xml"], { timeout: 15_000 });
  const xml = String(await device.adb(["shell", "cat", "/sdcard/webshell-test-window.xml"]));
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(([tag]) => {
    const attributes = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)]
      .map(([, key, value]) => [key, unescapeXML(value)]));
    const bounds = attributes.bounds?.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
    return { text: attributes.text || "", description: attributes["content-desc"] || "",
      package: attributes.package || "", clickable: attributes.clickable === "true",
      bounds: bounds ? { left: Number(bounds[1]), top: Number(bounds[2]),
        right: Number(bounds[3]), bottom: Number(bounds[4]) } : null };
  });
  return { nodes, package: nodes[0]?.package || "" };
}

export async function tapNativeLabel(device, label, { description = false, packageName, preferLast = false } = {}) {
  const snapshot = await nativeSnapshot(device);
  if (packageName && snapshot.package !== packageName) {
    throw new Error(`Android native UI belongs to ${snapshot.package}, expected ${packageName}`);
  }
  const candidates = snapshot.nodes.filter((node) =>
    (description ? node.description : node.text) === label && node.bounds &&
    node.bounds.right > node.bounds.left && node.bounds.bottom > node.bounds.top);
  const node = preferLast ? candidates.at(-1) : candidates.find((item) => item.clickable) || candidates[0];
  if (!node) throw new Error(`Android native UI label is unavailable: ${label}`);
  await device.tap(Math.round((node.bounds.left + node.bounds.right) / 2),
    Math.round((node.bounds.top + node.bounds.bottom) / 2));
  return node;
}
