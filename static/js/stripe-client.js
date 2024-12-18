
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
    if (upgradeBtn) {
        upgradeBtn.addEventListener('click', handleUpgradeClick);
    }

    const manageSubBtn = document.getElementById('manage-subscription-btn');
    if (manageSubBtn) {
        manageSubBtn.addEventListener('click', handleManageSubscription);
    }
});

async function handleUpgradeClick() {
    try {
        const response = await fetch('/api/create-checkout-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        const session = await response.json();
        window.location.href = session.url;
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to start checkout process. Please try again.');
    }
}

async function handleManageSubscription() {
    try {
        const response = await fetch('/api/create-portal-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
        const session = await response.json();
        window.location.href = session.url;
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to access subscription management. Please try again.');
    }
}

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
