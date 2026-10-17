# MCP File Server Midterm

A TypeScript MCP server that provides controlled workspace file operations, Git tools, and handoff tools for continuing work across sessions.

## Features

- 12 MCP tools for file operations, search, Git, and project handoff.
- Workspace path validation.
- Bearer-token authentication for HTTP requests.
- Streamable HTTP transport.
- Request body limit and rate limiting.
- PM2 process management.
- Git-tracked project state, plan log, decisions, and checkpoints.

## Requirements

- Node.js
- npm
- Git

## Setup

1. Install dependencies:

   ```powershell
   npm.cmd install
   ```

2. Build the project:

   ```powershell
   npm.cmd run build
   ```

3. Run the tests:

   ```powershell
   npm.cmd test
   ```

## Running the server

Start the HTTP server:

```powershell
npm.cmd run build
npm.cmd start
```

The default local endpoint is `http://127.0.0.1:3000/mcp`.

The HTTP server requires a valid bearer token configured in `.env`. Never commit `.env` or share the token publicly.

## Available tools

The server provides 12 tools:

- `list_files`
- `read_file`
- `write_file`
- `str_replace`
- `delete_file`
- `search_files`
- `git_status`
- `git_commit`
- `git_log`
- `read_project_state`
- `append_plan_log`
- `write_checkpoint`

## Project handoff

The `workspace` directory contains handoff materials:

- `PROJECT_STATE.md` — current project status.
- `PLAN_LOG.md` — work log and findings.
- `DECISIONS.md` — project decisions.
- `CHECKPOINTS/` — saved checkpoints.
- `task.json` — task status and handoff information.

## Security

- HTTP requests require bearer-token authentication.
- The server applies request-size limits and rate limiting.
- File operations are restricted by workspace path validation.
- Production dependencies were checked with `npm.cmd audit --omit=dev`.

## Verification

The project build completed successfully, and the test run reported eight passing tests. A Windows symlink-related test limitation was encountered during testing.

The public HTTPS endpoint was tested through ngrok, including authentication, MCP initialization, tool listing, and a tool call.

## Remaining validation

A genuine two-AI-session handoff still needs to be demonstrated separately. Do not treat a manually updated task record alone as proof of an independent AI-session handoff.
