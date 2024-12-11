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
        button.addEventListener("click", (e) => {
            selectedPlan = e.target.dataset.plan; // Store the selected plan
            paymentForm.classList.remove("hidden"); // Show the payment form
        });
    });

    // Handle payment form submission
    paymentForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        submitPaymentBtn.disabled = true;

        // Call backend to create a setup intent
        const intentResponse = await fetch("/api/create-setup-intent", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: selectedPlan }),
            credentials: "include",
        });

        const { clientSecret } = await intentResponse.json();

        // Confirm the card setup with Stripe
        const { setupIntent, error } = await stripe.confirmCardSetup(clientSecret, {
            payment_method: {
                card: cardElement,
            },
        });

        if (error) {
            cardErrors.textContent = error.message;
            submitPaymentBtn.disabled = false;
        } else {
            // Notify the backend that the user has confirmed their card
            await fetch("/api/confirm-trial-subscription", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ plan: selectedPlan, paymentMethod: setupIntent.payment_method }),
                credentials: "include",
            });

            alert("Free trial started successfully!");
            // window.location.href = "/dashboard"; // Redirect to dashboard
            plansSection.classList.add("hidden");
            utils.showSection('app-section');
            initChat();
            await updateTokenInfo(); // Update token information after successful login
        }
    });
});
