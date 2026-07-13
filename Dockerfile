# Fidacy MCP — payment firewall for AI agents (stdio MCP server).
# Used by registries (e.g. Glama) to start the server and run introspection.
FROM node:22-alpine
RUN npm install -g @fidacy/mcp@latest
# Local-first: boots with no key and no network on the decision path.
# Registries only need it to start and answer MCP introspection over stdio.
CMD ["fidacy-mcp"]
