// Authentication handling
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const signupBtn = document.getElementById('signup-btn');
    const backToLoginBtn = document.getElementById('back-to-login-btn');
    const logoutBtn = document.getElementById('logout-btn');

    signupBtn.addEventListener('click', () => {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
    });

    backToLoginBtn.addEventListener('click', () => {
        signupForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;

        try {
            // Auto-initialize app after successful signup
            await api.signup(email, password);
            signupForm.reset();
            await checkAuthStatus(); // This will show the app section and initialize chat
            await updateTokenInfo(); // Update token information after successful signup
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
            await checkAuthStatus();
            await updateTokenInfo(); // Update token information after successful login
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
    checkAuthStatus();
});
