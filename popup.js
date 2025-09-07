// --- DOM Elements ---
const loginView = document.getElementById('loginView');
const registerView = document.getElementById('registerView');
const mainView = document.getElementById('mainView');
const forgotPasswordView = document.getElementById('forgotPasswordView');

const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');
const forgotPasswordForm = document.getElementById('forgotPasswordForm');

const showRegisterLink = document.getElementById('showRegister');
const showLoginLink = document.getElementById('showLogin');
const showForgotPasswordLink = document.getElementById('showForgotPassword');
const backToLoginLink = document.getElementById('backToLogin');

const rememberMeCheckbox = document.getElementById('rememberMe');
const powerBtn = document.getElementById('powerBtn');
const logoutBtn = document.getElementById('logoutBtn');
const paymentBtn = document.getElementById('paymentBtn');
const welcomeMessage = document.getElementById('welcomeMessage');
const subStatus = document.getElementById('subStatus');
const subExpiry = document.getElementById('subExpiry');

// --- Configuration ---
const API_BASE_URL = 'http://ex.mtproxier.com:3000';

// --- State Management ---
let currentUser = null;

// --- View Navigation & Validation ---
function showView(viewToShow) {
    [loginView, registerView, mainView, forgotPasswordView].forEach(view => {
        view.classList.add('hidden');
    });
    clearErrors();
    viewToShow.classList.remove('hidden');
}

function showError(inputElement, message) {
    const errorSpan = inputElement.nextElementSibling;
    errorSpan.textContent = message;
}

function clearErrors() {
    document.querySelectorAll('.error-message').forEach(span => {
        span.textContent = '';
    });
}

// --- Helpers ---
function formatYmd(dateStr) {
    const d = new Date(dateStr);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function setPowerState(state, label) {
    // state: 'connected' | 'disconnected' | 'connecting' | 'disabled'
    powerBtn.classList.remove('connected', 'disconnected', 'connecting', 'disabled');
    powerBtn.classList.add(state);
    if (label) powerBtn.textContent = label;
    powerBtn.disabled = (state === 'disabled' || state === 'connecting');
}

// --- UI Update Functions ---
function updateMainView() {
    if (!currentUser) return;

    welcomeMessage.textContent = `Hi, ${currentUser.email}`;

    const isSubActive = currentUser.subExpires
        ? new Date(currentUser.subExpires) > new Date()
        : false;
    currentUser.subActive = isSubActive;

    if (currentUser.subActive) {
        subStatus.textContent = 'Active';
        subStatus.className = 'status-active';

        const formattedDate = formatYmd(currentUser.subExpires);
        subExpiry.textContent = `Expires on: ${formattedDate}`;
        paymentBtn.textContent = 'Renew Subscription';

        chrome.storage.local.get('isConnected', (result) => {
            const isConnected = result.isConnected || false;
            if (isConnected) {
                setPowerState('connected', 'Connected');
            } else {
                setPowerState('disconnected', 'Disconnected');
            }
        });
    } else {
        subStatus.textContent = 'Inactive';
        subStatus.className = 'status-inactive';
        subExpiry.textContent = 'Please subscribe to use the service.';
        paymentBtn.textContent = 'Buy Subscription';

        setPowerState('disabled', 'Buy Subscription');
    }
}

// --- Event Listeners ---
document.addEventListener('DOMContentLoaded', () => {
    const manifest = chrome.runtime.getManifest();
    const versionString = `Version: ${manifest.version}`;
    document.getElementById('version-display-login').textContent = versionString;
    document.getElementById('version-display-register').textContent = versionString;
    document.getElementById('version-display-main').textContent = versionString;
    document.getElementById('version-display-forgot').textContent = versionString;

    // Prefill login if saved
    chrome.storage.local.get(['savedEmail', 'savedPassword'], (result) => {
        if (result.savedEmail && result.savedPassword) {
            document.getElementById('loginEmail').value = result.savedEmail;
            document.getElementById('loginPassword').value = result.savedPassword;
            rememberMeCheckbox.checked = true;
        }
    });

    // Load user and refresh status from server
    chrome.storage.local.get('currentUser', (result) => {
        if (result.currentUser) {
            currentUser = result.currentUser;

            // Refresh subscription status from backend using apiKey
            fetch(`${API_BASE_URL}/api/status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: currentUser.apiKey })
            })
                .then(res => res.json())
                .then(data => {
                    if (data && data.email) {
                        currentUser = data;
                        chrome.storage.local.set({ currentUser: data });
                    }
                    updateMainView();
                })
                .catch(err => {
                    console.error('Failed to refresh subscription status:', err);
                    updateMainView();
                });

            showView(mainView);
        } else {
            showView(loginView);
        }
    });
});

showRegisterLink.addEventListener('click', () => showView(registerView));
showLoginLink.addEventListener('click', () => showView(loginView));
showForgotPasswordLink.addEventListener('click', () => showView(forgotPasswordView));
backToLoginLink.addEventListener('click', () => showView(loginView));

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    if (rememberMeCheckbox.checked) {
        chrome.storage.local.set({
            savedEmail: emailInput.value,
            savedPassword: passwordInput.value
        });
    } else {
        chrome.storage.local.remove(['savedEmail', 'savedPassword']);
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
        });
        const data = await response.json();

        if (!response.ok) {
            showError(passwordInput, data.error || 'Login failed.');
        } else {
            currentUser = data;
            chrome.storage.local.set({ currentUser: data });
            updateMainView();
            showView(mainView);
        }
    } catch (error) {
        showError(passwordInput, 'Cannot connect to server.');
    }
});

registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');

    try {
        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailInput.value, password: passwordInput.value })
        });
        const data = await response.json();

        if (!response.ok) {
            showError(emailInput, data.error || 'Registration failed.');
        } else {
            alert('Registration successful! Please log in.');
            showView(loginView);
        }
    } catch (error) {
        showError(passwordInput, 'Cannot connect to server.');
    }
});

forgotPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alert('Forgot password functionality is not yet connected to the backend.');
});

logoutBtn.addEventListener('click', () => {
    currentUser = null;
    chrome.storage.local.remove('currentUser');
    chrome.runtime.sendMessage({ action: 'disconnect' });
    chrome.storage.local.set({ isConnected: false });
    showView(loginView);
});

// Add smooth "connecting" state for better UX
powerBtn.addEventListener('click', () => {
    if (!currentUser || !currentUser.subActive) {
        alert('Please purchase a subscription to connect.');
        return;
    }

    chrome.storage.local.get('isConnected', (result) => {
        const newConnectionState = !result.isConnected;

        // Show connecting animation when turning ON
        if (newConnectionState) {
            setPowerState('connecting', 'Connecting...');
        } else {
            setPowerState('disconnected', 'Disconnected');
        }

        chrome.runtime.sendMessage({ action: newConnectionState ? 'connect' : 'disconnect' });
        chrome.storage.local.set({ isConnected: newConnectionState }, () => {
            // Small delay to let background apply proxy settings, then refresh UI
            setTimeout(() => {
                updateMainView();
            }, 500);
        });
    });
});

paymentBtn.addEventListener('click', async () => {
    if (!currentUser) {
        alert('Please log in first.');
        return;
    }

    paymentBtn.textContent = 'Creating invoice...';
    paymentBtn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/api/create-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ apiKey: currentUser.apiKey })
        });

        const data = await response.json();
        console.log('Backend response:', data);

        if (!response.ok) {
            console.error('Payment creation failed:', data);
            alert(`Error: ${data.error || 'Could not create payment link.'}`);
        } else if (data.invoice_url) {
            chrome.tabs.create({ url: data.invoice_url });
        } else {
            console.error('Backend response is OK but invoice_url is missing.');
            alert('An unexpected error occurred. The payment link is missing.');
        }
    } catch (error) {
        console.error('Fetch error:', error);
        alert('Could not connect to the server to create a payment link.');
    } finally {
        updateMainView();
        paymentBtn.disabled = false;
        paymentBtn.textContent = currentUser?.subActive ? 'Renew Subscription' : 'Buy Subscription';
    }
});