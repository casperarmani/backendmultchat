// Token and subscription handler
async function fetchTokenInfo() {
    try {
        const response = await fetch('/user/tokens');
        if (!response.ok) {
            throw new Error('Failed to fetch token information');
        }
        const data = await response.json();
        
        // Update token balance display
        const tokenElement = document.getElementById('current-tokens');
        if (tokenElement) {
            tokenElement.textContent = `${data.token_balance} tokens`;
        }
        
        // Update subscription plan display
        const planElement = document.getElementById('current-plan');
        if (planElement && data.subscription && data.subscription.subscription_tiers) {
            const tier = data.subscription.subscription_tiers;
            planElement.textContent = `${tier.tier_name} (${tier.tokens} tokens/month)`;
        }
        
        return data;
    } catch (error) {
        console.error('Error fetching token information:', error);
        // Show error state
        const tokenElement = document.getElementById('current-tokens');
        const planElement = document.getElementById('current-plan');
        if (tokenElement) tokenElement.textContent = 'Error loading balance';
        if (planElement) planElement.textContent = 'Error loading plan';
    }
}

// Initialize token display
document.addEventListener('DOMContentLoaded', () => {
    // Initial fetch
    fetchTokenInfo();
    
    // Refresh token info every minute
    setInterval(fetchTokenInfo, 60000);
});

// Export for use in other modules
window.tokenHandler = {
    fetchTokenInfo,
    refreshTokens: fetchTokenInfo // Alias for clarity when calling from other modules
};
