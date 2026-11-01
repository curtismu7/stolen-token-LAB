// Mock | Live. This lab has no live engine: no tenant, no credentials, no outbound call. Mock is the only mode that runs, and Live is refused
// with this message wherever it is asked for (the header toggle, the API). A bare MODE environment variable is not read.
export const MODES = ['mock', 'live'];
export const LIVE_REFUSAL = 'Live mode is not available in this lab. It has no live engine: the authorization server, the gateway and every token are in-process mocks, and nothing here can reach a tenant. The page stays in Mock mode.';
export const modeOf = (v) => (MODES.includes(v) ? v : null);
export const modeInfo = () => ({ mode: 'mock', modes: MODES, liveAvailable: false, liveRefusal: LIVE_REFUSAL, simulated: true });
