// Initialize Stripe 
let stripe;

// Fetch publishable key from backend
async function initializeStripe() {
    const response = await fetch('/api/config');
    const { publishableKey } = await response.json();
    stripe = Stripe(publishableKey);
}

document.addEventListener('DOMContentLoaded', async () => {
    await initializeStripe();
    
    const upgradeBtn = document.getElementById('upgrade-btn');
    
    // Show plans dropdown when upgrade button is clicked
    upgradeBtn.addEventListener('click', async () => {
        const plan = confirm('Choose a plan:\nPro ($99/month)\nAgency ($299/month)');
        const tierName = plan ? 'Pro' : 'Agency';
        
        try {
            // Create checkout session
            const response = await fetch(`/api/create-checkout-session/${tierName}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                }
            });

            const session = await response.json();
            
            // Redirect to Stripe Checkout
            window.location.href = session.url;

        } catch (error) {
            console.error('Error:', error);
            alert('Failed to start checkout process. Please try again.');
        }
    });
});

// Update subscription status in the UI
async function updateSubscriptionStatus() {
    try {
        const response = await fetch('/api/subscriptions/current');
        const subscription = await response.json();
        
        const statusElement = document.getElementById('current-plan');
        if (statusElement) {
            statusElement.textContent = `${subscription.tier || 'Free'} (${subscription.status || 'active'})`;
        }
        
    } catch (error) {
        console.error('Error updating subscription status:', error);
    }
}

// Initial status update
updateSubscriptionStatus();
