// Authentication handling
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const signupBtn = document.getElementById('signup-btn');
    const backToLoginBtn = document.getElementById('back-to-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const paidPlansSection = document.getElementById("paid-plans-section");
    const appSection = document.getElementById("app-section");
    const loginSection = document.getElementById("login-section");


    signupBtn.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    });

    backToLoginBtn.addEventListener('click', () => {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    // Function to check if user is a Stripe customer
    async function checkStripeCustomer() {
        const response = await fetch("/api/check-stripe-customer", { method: "GET", credentials: "include" });
        const data = await response.json();

        if (!data.is_stripe_customer) {
            // Redirect user to the paid plans page
            appSection.classList.add("hidden");
            loginSection.classList.add("hidden");
            paidPlansSection.classList.remove("hidden");
        } else {
            // Allow access to the dashboard
            appSection.classList.remove("hidden");
            await checkAuthStatus();
            await updateTokenInfo(); // Update token information after successful login
        }
    }

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        try {
            // Auto-initialize app after successful signup
            await api.signup(email, password);
            signupForm.reset();
            // await checkAuthStatus(); // This will show the app section and initialize chat
            // await updateTokenInfo(); // Update token information after successful signup
        } catch (error) {
            utils.showError(error.message || 'Signup failed');
        }
    });

    async function checkAuthStatus() {
        const isAuthenticated = await api.checkAuth();
        if (isAuthenticated) {
            utils.showSection('app-section');
            initChat();
        } else {
            utils.showSection('login-section');
        }
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            await api.login(email, password);
            await checkStripeCustomer();

        } catch (error) {
            utils.showError('Login failed. Please check your credentials.');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            await api.logout();
            // Clean up chat state
            window.chatHistory = [];
            window.analysisHistory = [];
            window.conversations = [];
            window.currentConversationId = null;
            if (window.chatHistoryContainer) {
                window.chatHistoryContainer.innerHTML = '';
            }
            if (window.currentPollInterval) {
                clearInterval(window.currentPollInterval);
                window.currentPollInterval = null;
            }
            utils.showSection('login-section');
        } catch (error) {
            utils.showError('Logout failed.');
        }
    });

    // Check health status periodically
    setInterval(async () => {
        const isHealthy = await api.checkHealth();
        utils.updateConnectionStatus(isHealthy);
    }, 30000);

    // Initial auth check
    // checkAuthStatus();
});
