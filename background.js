// --- Proxy server config ---
const PROXY_HOST = 'ex.mtproxier.com';
const PROXY_PORT = 443;

// --- Default proxied domains (read-only) ---
const defaultProxiedDomains = [
    "trello.com", "telegram.org", "x.com", "gemini.google.com",
    "chatgpt.com", "openai.com",
    "youtube.com", "googlevideo.com", "ytimg.com", "twimg.com", "pbs.twimg.com"
];

// --- PAC builder ---
function createPacScript(domains) {
    const unique = [...new Set(domains)].filter(Boolean);
    if (unique.length === 0) {
        return `function FindProxyForURL(url, host){ return "DIRECT"; }`;
    }
    const cond = unique
        .map(d => `dnsDomainIs(host,".${d}") || dnsDomainIs(host,"${d}")`)
        .join(" || ");
    return `
    function FindProxyForURL(url, host) {
      if (${cond}) { return "HTTPS ${PROXY_HOST}:${PROXY_PORT}"; }
      return "DIRECT";
    }
  `;
}

// --- Apply PAC from defaults+custom ---
function updateProxyRules(done) {
    chrome.storage.local.get("customDomains", (res) => {
        const custom = res.customDomains || [];
        const combined = [...defaultProxiedDomains, ...custom];

        const pacConfig = {
            mode: "pac_script",
            pacScript: { data: createPacScript(combined) }
        };

        chrome.proxy.settings.set({ value: pacConfig, scope: "regular" }, () => {
            const err = chrome.runtime.lastError;
            if (err) {
                console.error("proxy.settings.set error:", err);
            } else {
                console.log("Proxy rules updated. Domains:", combined.length);
            }
            if (typeof done === 'function') done(err);
        });
    });
}

// --- Main controls ---
function enableProxy() {
    updateProxyRules(() => {
        chrome.storage.local.set({ isConnected: true }, () => {
            chrome.action.setBadgeText({ text: 'ON' });
            chrome.action.setBadgeBackgroundColor({ color: '#27ae60' });
            console.log("Proxy enabled.");
        });
    });
}

function disableProxy() {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
        const err = chrome.runtime.lastError;
        if (err) console.error("proxy.settings.clear error:", err);
        chrome.storage.local.set({ isConnected: false }, () => {
            chrome.action.setBadgeText({ text: 'OFF' });
            chrome.action.setBadgeBackgroundColor({ color: '#c0392b' });
            console.log("Proxy disabled.");
        });
    });
}

// --- Messages from popup ---
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === 'connect') {
        enableProxy();
    } else if (msg.action === 'disconnect') {
        disableProxy();
    } else if (msg.action === 'updateRules') {
        chrome.storage.local.get('isConnected', (r) => {
            if (r.isConnected) updateProxyRules();
        });
    } else if (msg.action === 'getDefaults') {
        sendResponse(defaultProxiedDomains);
    }
    return true; // async responses allowed
});

// --- Init on install/update ---
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['isConnected', 'customDomains'], (r) => {
        if (typeof r.isConnected !== 'boolean') chrome.storage.local.set({ isConnected: false });
        if (!Array.isArray(r.customDomains)) chrome.storage.local.set({ customDomains: [] });
        if (r.isConnected) {
            enableProxy();
        } else {
            disableProxy();
        }
    });
});

// Optional: log low-level proxy errors (بدون تغییر UI)
chrome.proxy.onProxyError.addListener((error) => {
    console.error('chrome.proxy error:', error);
});
