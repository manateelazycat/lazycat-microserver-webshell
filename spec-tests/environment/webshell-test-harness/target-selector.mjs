// Public test-side adapter for the instance objects returned by /webshell/api/instances.
// Keep this module independent from product source directories.
export const instanceSelector = (item) => {
  const explicitSelector = String(item?.selector || item?.target || "").trim();
  if (explicitSelector) return explicitSelector;

  const clientInstanceID = String(item?.client_instance_id || "").trim();
  if (clientInstanceID) return `client:${clientInstanceID}`;

  const name = String(item?.name || "").trim();
  const ownerDeployID = String(item?.owner_deploy_id || "").trim();
  return name && ownerDeployID ? `${name}@${ownerDeployID}` : "";
};
