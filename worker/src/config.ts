/**
 * O Worker hospeda um MCP: o do GitHub.
 *
 * Estes valores são a única fonte de verdade do endpoint. O roteador, o
 * resource OAuth (audience do token) e o handler MCP leem daqui, para que os
 * três não divirjam.
 */

/** Caminho público do MCP — também é a audience do token. */
export const MCP_PATH = '/github/mcp';

/** Nome curto, usado no health e no metadata do resource. */
export const MCP_NAME = 'github';

/** Escopos que o consentimento pode conceder. */
export const SCOPES_SUPPORTED = ['github', 'offline_access'];
