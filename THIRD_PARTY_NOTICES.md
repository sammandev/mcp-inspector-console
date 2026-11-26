# Third-party notices

This inventory is limited to material actually consumed or copied by the combined Inspector.

## mcp-use packages and UI fork (MIT)

The project consumes `@mcp-use/inspector`, `@mcp-use/client`, and `@mcp-use/agent` as pinned published dependencies at the reference revision `8ff4b865e0e5712c66d5077e93392807daca9354`.

At the same revision, the Inspector client source (`libraries/typescript/packages/inspector/src/client`) is copied into `apps/web/vendor/mcp-use/client` and its static assets (`libraries/typescript/packages/inspector/public`) into `apps/web/public/mcp-use`. The upstream LICENSE is kept at `apps/web/vendor/mcp-use/LICENSE`. `apps/web/vendor/mcp-use/manifest.json` records a SHA-256 checksum for every copied file, lists files modified for the combined Inspector, and identifies local-only fork additions. Modified and local-only files carry a `Modified for the combined Inspector:` notice.

Copyright (c) mcp-use contributors. Package-license verification note: the verifier checks the repository pin, record classifications, and the fork checksums; distribution still requires confirming the pinned package archives' LICENSE files match this notice.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

## Official MCP Inspector

Reference revision: `eb54b447e5377a7a18acaea9602fced5cb4c5b9f`.

The combined Inspector contains **zero copied Official Inspector files**. Its Official workflows (diagnostics, OAuth, roots, tasks, completions, subscriptions and logging, app conformance, configuration, automation, and load testing) are independently reimplemented with the MCP SDK, using the Official Inspector only as a behavioral reference. Because no Official source or documentation is copied, this notice does not assert an Official Inspector file-level license classification.
