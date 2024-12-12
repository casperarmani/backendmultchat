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
    
    // Show plans modal when upgrade button is clicked
    upgradeBtn.addEventListener('click', () => {
        const modal = document.createElement('div');
        modal.className = 'plan-selection-modal';
        modal.innerHTML = `
            <div class="plan-selection-content">
                <h2>Choose Your Plan</h2>
                <div class="plans-container">
                    <div class="plan-card">
                        <h3>Pro Plan</h3>
                        <div class="price">$99/month</div>
                        <ul>
                            <li>500 Tokens per month</li>
                            <li>Priority support</li>
                            <li>Advanced analytics</li>
                        </ul>
                        <button class="select-plan-btn" data-plan="Pro">Select Pro Plan</button>
                    </div>
                    <div class="plan-card">
                        <h3>Agency Plan</h3>
                        <div class="price">$299/month</div>
                        <ul>
                            <li>1000 Tokens per month</li>
                            <li>24/7 Premium support</li>
                            <li>Custom analytics dashboard</li>
                            <li>API access</li>
                        </ul>
                        <button class="select-plan-btn" data-plan="Agency">Select Agency Plan</button>
                    </div>
                </div>
                <button class="close-modal">Close</button>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Add click handlers for plan selection
        modal.querySelectorAll('.select-plan-btn').forEach(button => {
            button.addEventListener('click', async () => {
                const selectedPlan = button.dataset.plan;
                try {
                    // Create checkout session
                    const response = await fetch(`/api/create-checkout-session/${selectedPlan}`, {
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
        
        // Close modal handler
        modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.remove();
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    });

    // Add manage subscription button handler
    const manageSubBtn = document.getElementById('manage-subscription-btn');
    if (manageSubBtn) {
        manageSubBtn.addEventListener('click', async () => {
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
        });
    }
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
