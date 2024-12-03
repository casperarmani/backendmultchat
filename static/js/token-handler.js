// Token and subscription handler
class TokenHandler {
    constructor() {
        this.isAuthenticated = false;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.updateInterval = null;
        this.isLoginTransition = false;
        this.initialFetchDelay = 2000; // 2 seconds delay for initial fetch
    }

    async fetchTokenInfo(forceRefresh = false) {
        // During login transition, show loading state
        if (this.isLoginTransition) {
            this.updateDisplays('Loading...', 'Loading...');
            return null;
        }

        // Don't fetch if not authenticated unless forced
        if (!this.isAuthenticated && !forceRefresh) {
            this.updateDisplays('Not logged in', 'Not logged in');
            return null;
        }

        try {
            const response = await fetch('/user/tokens');
            if (response.status === 401) {
                // Only update display if not in login transition
                if (!this.isLoginTransition) {
                    this.isAuthenticated = false;
                    this.updateDisplays('Not logged in', 'Not logged in');
                    this.stopTokenUpdates();
                }
                return null;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch token information: ${response.status}`);
            }

            const data = await response.json();
            this.updateDisplays(
                `${data.token_balance} tokens`,
                data.subscription && data.subscription.subscription_tiers
                    ? `${data.subscription.subscription_tiers.tier_name} (${data.subscription.subscription_tiers.tokens} tokens/month)`
                    : 'No subscription'
            );
            
            this.retryCount = 0; // Reset retry count on success
            return data;
        } catch (error) {
            // Don't show errors during login transition
            if (!this.isLoginTransition) {
                console.error('Error fetching token information:', error);
                
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                    return this.fetchTokenInfo(forceRefresh);
                }
                
                this.updateDisplays('Error loading balance', 'Error loading plan');
            }
            return null;
        }
    }

    updateDisplays(tokenText, planText) {
        const tokenElement = document.getElementById('current-tokens');
        const planElement = document.getElementById('current-plan');
        
        if (tokenElement) tokenElement.textContent = tokenText;
        if (planElement) planElement.textContent = planText;
    }

    async startTokenUpdates() {
        this.isLoginTransition = true;
        this.isAuthenticated = true;
        this.updateDisplays('Loading...', 'Loading...');
        
        // Add delay before initial fetch
        await new Promise(resolve => setTimeout(resolve, this.initialFetchDelay));
        
        // Clear existing interval if any
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }
        
        this.isLoginTransition = false;
        await this.fetchTokenInfo(true); // Initial fetch after delay
        
        // Set new interval
        this.updateInterval = setInterval(() => this.fetchTokenInfo(), 60000);
    }

    stopTokenUpdates() {
        this.isAuthenticated = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.updateDisplays('Not logged in', 'Not logged in');
    }
}

// Initialize token handler
const tokenHandler = new TokenHandler();

// Export for use in other modules
window.tokenHandler = tokenHandler;

// Initialize token display
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication status and start updates if authenticated
    fetch('/auth_status')
        .then(response => response.json())
        .then(data => {
            if (data.authenticated) {
                tokenHandler.startTokenUpdates();
            }
        })
        .catch(error => console.error('Error checking auth status:', error));
});
