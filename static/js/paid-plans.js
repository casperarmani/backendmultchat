document.addEventListener("DOMContentLoaded", () => {
    const stripe = Stripe("pk_test_51P0hGUP9JezhoAfp9WqP8HKCkrknpZgFxDeyUi6gU9rjCuvCqIgWUw1JX4XKgbfbbMgAk1uNL7krwsWvVGdetJgR000alYvTme"); // Replace with your Stripe publishable key
    const elements = stripe.elements();
    const cardElement = elements.create("card");

    const plansSection = document.getElementById("paid-plans-section");
    const paymentForm = document.getElementById("payment-form");
    const submitPaymentBtn = document.getElementById("submit-payment-btn");
    const cardErrors = document.getElementById("card-errors");
    let selectedPlan = null; // Store the selected plan

    // Mount the card input to the DOM
    cardElement.mount("#card-element");

    // Handle card validation errors
    cardElement.on("change", (event) => {
        submitPaymentBtn.disabled = event.empty || !!event.error;
        cardErrors.textContent = event.error ? event.error.message : "";
    });

    // Handle plan selection
    document.querySelectorAll(".select-plan-btn").forEach((button) => {
        button.addEventListener("click", async (e) => {
            const selectedPlan = e.target.dataset.plan; // Store the selected plan

            try {
                // Call backend to create a Stripe Checkout session
                const response = await fetch("/api/create-checkout-session", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ plan: selectedPlan }),
                    credentials: "include",
                });

                const data = await response.json();

                if (data.sessionId) {
                    // Redirect to Stripe Checkout
                    await stripe.redirectToCheckout({ sessionId: data.sessionId });
                } else {
                    alert("Failed to create a checkout session. Please try again.");
                }
            } catch (error) {
                console.error("Error creating checkout session:", error);
                alert("An error occurred. Please try again.");
            }
        });
    });
});
