const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const config = getDefaultConfig(__dirname);

if (process.env.FORCE_NO_METRO_WORKSPACE === "1") {
  module.exports = config;
} else {
  const workspaceRoot = path.resolve(__dirname, "../..");
  // Only shared packages (not the whole workspace root) so expo's AppEntry
  // still resolves inside apps/mobile (hoisted expo breaks ../../App otherwise).
  config.watchFolders = [
    ...new Set([
      ...(config.watchFolders || []),
      path.resolve(workspaceRoot, "packages/core"),
      path.resolve(workspaceRoot, "packages/tokens"),
    ]),
  ];
  config.resolver.nodeModulesPaths = [
    path.resolve(__dirname, "node_modules"),
    path.resolve(workspaceRoot, "node_modules"),
  ];
  config.resolver.disableHierarchicalLookup = false;
  module.exports = config;
}
