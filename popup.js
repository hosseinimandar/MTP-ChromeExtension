// --- DOM Elements ---
const powerBtn = document.getElementById('powerBtn');
const addSiteBtn = document.getElementById('addSiteBtn');
const defaultDomainListDiv = document.getElementById('defaultDomainList');
const customDomainListDiv = document.getElementById('customDomainList');
const menuBtn = document.getElementById('menuBtn');
const closeBtn = document.getElementById('closeBtn');
const mainView = document.getElementById('mainView');
const menuView = document.getElementById('menuView');
const toast = document.getElementById('toast');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const versionDisplay = document.getElementById('version-display');
let toastTimer;

// --- Functions ---

// Shows a temporary message
function showToast(message, type = 'success') {
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.className = 'toast show';
    toast.classList.add(type);
    toastTimer = setTimeout(() => {
        toast.classList.remove('show');
    }, 5000);
}

// Updates the power button UI based on state
function updatePowerButtonUI(state) {
    powerBtn.classList.remove('connected', 'disconnected', 'connecting');
    switch(state) {
        case 'connected':
            powerBtn.textContent = 'Connected';
            powerBtn.classList.add('connected');
            break;
        case 'disconnected':
            powerBtn.textContent = 'Disconnected';
            powerBtn.classList.add('disconnected');
            break;
        case 'connecting':
            powerBtn.textContent = 'Connecting...';
            powerBtn.classList.add('connecting');
            break;
    }
}

// Renders a list of domains
function renderDomainList(domains, container, isCustom) {
    container.innerHTML = '';
    if (domains && domains.length > 0) {
        domains.forEach(domain => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'domain-item';
            const domainSpan = document.createElement('span');
            domainSpan.textContent = domain;
            itemDiv.appendChild(domainSpan);
            if (isCustom) {
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.textContent = 'Delete';
                deleteBtn.dataset.domain = domain;
                itemDiv.appendChild(deleteBtn);
            }
            container.appendChild(itemDiv);
        });
    } else {
        container.innerHTML = `<div class="empty-message">No domains in list</div>`;
    }
}

// Handles domain deletion
function deleteDomain(domainToDelete) {
    chrome.storage.local.get('customDomains', (result) => {
        const newDomains = (result.customDomains || []).filter(d => d !== domainToDelete);
        chrome.storage.local.set({ customDomains: newDomains }, () => {
            renderDomainList(newDomains, customDomainListDiv, true);
            chrome.runtime.sendMessage({ action: 'updateRules' });
            showToast('URL address removed', 'error');
        });
    });
}

// --- Event Listeners ---

// On popup open, load data
document.addEventListener('DOMContentLoaded', () => {
    const manifest = chrome.runtime.getManifest();
    versionDisplay.textContent = `Version: ${manifest.version}`;

    chrome.storage.local.get(['isConnected', 'customDomains'], (result) => {
        updatePowerButtonUI(result.isConnected ? 'connected' : 'disconnected');
        renderDomainList(result.customDomains || [], customDomainListDiv, true);
    });
    chrome.runtime.sendMessage({ action: 'getDefaults' }, (response) => {
        renderDomainList(response, defaultDomainListDiv, false);
    });
});

// Power button click with animation logic
powerBtn.addEventListener('click', () => {
    chrome.storage.local.get('isConnected', (result) => {
        const willConnect = !result.isConnected;
        
        if (willConnect) {
            updatePowerButtonUI('connecting');
            setTimeout(() => {
                chrome.runtime.sendMessage({ action: 'connect' });
                chrome.storage.local.set({ isConnected: true });
                updatePowerButtonUI('connected');
            }, 1500); // 1.5 second animation
        } else {
            chrome.runtime.sendMessage({ action: 'disconnect' });
            chrome.storage.local.set({ isConnected: false });
            updatePowerButtonUI('disconnected');
        }
    });
});

// "Add Current Site" button click
addSiteBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url) {
            try {
                const url = new URL(tabs[0].url);
                const domain = url.hostname.replace(/^www\./, '');

                chrome.runtime.sendMessage({ action: 'getDefaults' }, (defaultDomains) => {
                    if (defaultDomains.includes(domain)) {
                        showToast('This URL is in the default list', 'warning');
                        return;
                    }

                    chrome.storage.local.get('customDomains', (result) => {
                        const currentDomains = result.customDomains || [];
                        if (currentDomains.includes(domain)) {
                            showToast('URL is already in the list', 'warning');
                        } else {
                            const newDomains = [...currentDomains, domain];
                            chrome.storage.local.set({ customDomains: newDomains }, () => {
                                renderDomainList(newDomains, customDomainListDiv, true);
                                chrome.runtime.sendMessage({ action: 'updateRules' });
                                showToast('URL address added', 'success');
                            });
                        }
                    });
                });
            } catch (e) { console.error("Could not parse URL:", e); }
        }
    });
});

// Event delegation for delete buttons
customDomainListDiv.addEventListener('click', (event) => {
    if (event.target.classList.contains('delete-btn')) {
        deleteDomain(event.target.dataset.domain);
    }
});

// Menu and Tab controls
menuBtn.addEventListener('click', () => {
    mainView.classList.add('hidden');
    menuView.classList.remove('hidden');
});
closeBtn.addEventListener('click', () => {
    menuView.classList.add('hidden');
    mainView.classList.remove('hidden');
});
tabButtons.forEach(button => {
    button.addEventListener('click', () => {
        tabButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        tabContents.forEach(content => content.classList.remove('active'));
        document.getElementById(button.dataset.tab).classList.add('active');
    });
});
