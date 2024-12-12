// Initialize Stripe with the publishable key
const stripe = Stripe(STRIPE_PUBLISHABLE_KEY);
let elements;
let selectedPlan;

document.addEventListener('DOMContentLoaded', () => {
    // Set up modal triggers
    const upgradeBtn = document.getElementById('upgrade-btn');
    const modal = document.getElementById('subscription-modal');
    const closeBtn = modal.querySelector('.close-modal-btn');
    const planButtons = document.querySelectorAll('.select-plan-btn');
    const paymentForm = document.getElementById('payment-form');

    // Initialize Stripe Elements
    elements = stripe.elements();
    const cardElement = elements.create('card');
    cardElement.mount('#card-element');

    // Show modal
    upgradeBtn.addEventListener('click', () => {
        modal.classList.remove('hidden');
        paymentForm.classList.add('hidden');
    });

    // Close modal
    closeBtn.addEventListener('click', () => {
        modal.classList.add('hidden');
        selectedPlan = null;
    });

    // Handle plan selection
    planButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            selectedPlan = e.target.dataset.plan;
            paymentForm.classList.remove('hidden');
        });
    });

    // Handle form submission
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        try {
            const { paymentMethod, error } = await stripe.createPaymentMethod({
                type: 'card',
                card: cardElement,
            });

            if (error) {
                const errorElement = document.getElementById('card-errors');
                errorElement.textContent = error.message;
                return;
            }

            // Create subscription
            const response = await fetch('/api/subscriptions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    payment_method_id: paymentMethod.id,
                    tier_name: selectedPlan
                }),
            });

            const result = await response.json();

            if (result.status === 'requires_action') {
                // Handle 3D Secure authentication
                const { error: confirmError } = await stripe.confirmCardPayment(result.client_secret);
                if (confirmError) {
                    throw new Error(confirmError.message);
                }
            }

            // Success
            modal.classList.add('hidden');
            utils.showSuccess('Subscription updated successfully!');
            updateSubscriptionStatus();

        } catch (error) {
            const errorElement = document.getElementById('card-errors');
            errorElement.textContent = error.message;
        }
    });
});

// Update subscription status in the UI
async function updateSubscriptionStatus() {
    try {
        const response = await fetch('/api/subscriptions/current');
        const subscription = await response.json();
        
        const statusElement = document.getElementById('current-plan');
        statusElement.textContent = `${subscription.tier_name || 'Free'} (${subscription.status || 'active'})`;
        
    } catch (error) {
        console.error('Error updating subscription status:', error);
    }
}

// Initial status update
updateSubscriptionStatus();
