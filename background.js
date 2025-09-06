// --- Server Configuration ---
const PROXY_HOST = 'ex.mtproxier.com';
const PROXY_PORT = 443;

// --- Default list of domains (read-only) ---
const defaultProxiedDomains = [
    "trello.com", "telegram.org", "x.com", "gemini.google.com",
    "chatgpt.com", "openai.com",
    "youtube.com", "googlevideo.com", "ytimg.com", "twimg.com", "pbs.twimg.com"
];

// --- Core Functions ---

// Creates the PAC script string from a combined list of domains
function createPacScript(domains) {
    const uniqueDomains = [...new Set(domains)].filter(Boolean);
    if (uniqueDomains.length === 0) {
        return `function FindProxyForURL(url, host) { return "DIRECT"; }`;
    }
    let conditions = uniqueDomains.map(domain => `dnsDomainIs(host, ".${domain}") || dnsDomainIs(host, "${domain}")`).join(" || ");

    return `
        function FindProxyForURL(url, host) {
            if (${conditions}) {
                return "HTTPS ${PROXY_HOST}:${PROXY_PORT}";
            }
            return "DIRECT";
        }
    `;
}

// Fetches both domain lists, combines them, and applies proxy settings
function updateProxyRules() {
    chrome.storage.local.get("customDomains", (result) => {
        const customDomains = result.customDomains || [];
        const combinedDomains = [...defaultProxiedDomains, ...customDomains];

        const pacConfig = {
            mode: "pac_script",
            pacScript: { data: createPacScript(combinedDomains) }
        };
        chrome.proxy.settings.set({ value: pacConfig, scope: 'regular' }, () => {
            console.log("Proxy rules updated with", combinedDomains.length, "total domains.");
        });
    });
}

// --- NEW Centralized Proxy Control Functions ---

// Enables the proxy and updates all related states
function enableProxy() {
    updateProxyRules();
    chrome.action.setBadgeText({ text: 'ON' });
    chrome.action.setBadgeBackgroundColor({ color: '#27ae60' }); // Green color
    console.log("Proxy enabled and badge set to ON.");
}

// Disables the proxy and updates all related states
function disableProxy() {
    chrome.proxy.settings.clear({ scope: 'regular' });
    chrome.action.setBadgeText({ text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ color: '#c0392b' }); // Red color
    console.log("Proxy disabled and badge set to OFF.");
}

// --- Event Listeners ---

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'connect') {
        enableProxy();
    } else if (message.action === 'disconnect') {
        disableProxy();
    } else if (message.action === 'updateRules') {
        chrome.storage.local.get("isConnected", (result) => {
            if (result.isConnected) {
                updateProxyRules();
            }
        });
    } else if (message.action === 'getDefaults') {
        sendResponse(defaultProxiedDomains);
    }
    return true; // Indicates that the response is sent asynchronously
});

// Set the initial state when the extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(["isConnected", "customDomains"], (result) => {
        if (result.isConnected === undefined) {
            chrome.storage.local.set({ isConnected: false });
        }
        if (result.customDomains === undefined) {
            chrome.storage.local.set({ customDomains: [] });
        }

        // Set initial badge based on stored state or default to OFF
        if (result.isConnected) {
            enableProxy();
        } else {
            disableProxy();
        }
    });
});

// Listen for any proxy errors
chrome.proxy.onProxyError.addListener((error) => {
    console.error('Proxy error:', JSON.stringify(error, null, 2));
});
