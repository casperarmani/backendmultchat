// Stripe client-side handling
let stripe;
let elements;

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize Stripe
    stripe = Stripe(STRIPE_PUBLISHABLE_KEY);

    // Handle subscription form submission
    const subscriptionForm = document.getElementById('subscription-form');
    if (subscriptionForm) {
        subscriptionForm.addEventListener('submit', handleSubscription);
    }

    // Initialize subscription UI
    await updateSubscriptionStatus();
});

async function handleSubscription(e) {
    e.preventDefault();
    
    const form = e.target;
    const tierName = form.querySelector('select[name="tier"]').value;
    
    try {
        // Create payment method
        const { error: elementsError, paymentMethod } = await stripe.createPaymentMethod({
            type: 'card',
            card: elements.getElement('card'),
        });

        if (elementsError) {
            utils.showError(elementsError.message);
            return;
        }

        // Create subscription
        const response = await api.createSubscription({
            payment_method_id: paymentMethod.id,
            tier_name: tierName
        });

        const { client_secret, status } = response;

        if (status === 'requires_action') {
            // Handle 3D Secure authentication
            const { error: confirmError } = await stripe.confirmCardPayment(client_secret);
            if (confirmError) {
                utils.showError('Payment failed: ' + confirmError.message);
                return;
            }
        }

        // Update UI
        await updateSubscriptionStatus();
        utils.showSuccess('Subscription updated successfully!');
    } catch (error) {
        utils.showError(error.message || 'Failed to process subscription');
    }
}

async function updateSubscriptionStatus() {
    try {
        const subscription = await api.getCurrentSubscription();
        const statusElement = document.getElementById('current-plan');
        if (statusElement) {
            statusElement.textContent = `${subscription.tier} (${subscription.status})`;
        }
    } catch (error) {
        console.error('Error updating subscription status:', error);
    }
}

async function cancelSubscription(subscriptionId) {
    try {
        await api.cancelSubscription(subscriptionId);
        await updateSubscriptionStatus();
        utils.showSuccess('Subscription cancelled successfully');
    } catch (error) {
        utils.showError(error.message || 'Failed to cancel subscription');
    }
}

// Export functions for use in other modules
window.stripeClient = {
    handleSubscription,
    updateSubscriptionStatus,
    cancelSubscription
};
