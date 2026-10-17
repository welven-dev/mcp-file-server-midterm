# MCP File Server Midterm — Technical Report

## 1. Project Overview
This project implements an MCP server that allows an MCP-compatible client to work with files in a controlled workspace and maintain progress between sessions.

## 2. Technology Choices
- Node.js and TypeScript: server implementation.
- Model Context Protocol SDK: tool registration and MCP communication.
- Express: Streamable HTTP endpoint.
- Zod: tool input validation.
- PM2: process management.
- ngrok: public HTTPS tunnel.
- Git: version control and workspace history.

## 3. Tool Design
The server exposes 12 tools for file listing, reading, writing, text replacement, deletion, searching, Git operations, and project handoff records.

## 4. Security
- Workspace path checks restrict file operations to the designated workspace.
- Bearer-token authentication protects the HTTP endpoint.
- HTTP request bodies are limited to 1 MB.
- Rate limiting is configured for 100 requests per 60 seconds.
- File operations validate paths and inputs.
- The outside-file symbolic-link test could not be fully verified because Windows denied permission.

## 5. Testing and Deployment
The TypeScript build succeeded and eight sandbox tests passed. Public HTTPS access through ngrok was verified. MCP initialization, tool discovery, and the read_project_state tool were tested through the public endpoint. PM2 manages the local HTTP server.

## 6. Remaining Validation
The required task spanning two separate AI sessions must be demonstrated and documented. The final README and demo transcript should be checked before submission.
