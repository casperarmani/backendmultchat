// Authentication handling
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const logoutBtn = document.getElementById('logout-btn');

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
        } catch (error) {
            utils.showError('Login failed. Please check your credentials.');
        }
    });

    logoutBtn.addEventListener('click', async () => {
        try {
            await api.logout();
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
