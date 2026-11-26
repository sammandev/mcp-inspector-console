import { installInsecureContextCrypto } from "./insecure-context-crypto.js";

installInsecureContextCrypto();

const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");

if (/^\/mcp\/inspector(?:\/|$)/.test(window.location.pathname)) {
  void import("./inspector-entry.js");
} else {
  void import("./workspace-entry.js");
}