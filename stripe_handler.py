import os
import stripe
from typing import Optional, Dict, Any
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Initialize Stripe with secret key
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
if not stripe.api_key:
    raise ValueError("STRIPE_SECRET_KEY is required")

# Get price IDs from environment
STRIPE_PRICE_ID_PRO = os.environ.get('STRIPE_PRICE_ID_PRO')
STRIPE_PRICE_ID_AGENCY = os.environ.get('STRIPE_PRICE_ID_AGENCY')

if not STRIPE_PRICE_ID_PRO or not STRIPE_PRICE_ID_AGENCY:
    raise ValueError("STRIPE_PRICE_ID_PRO and STRIPE_PRICE_ID_AGENCY are required")

# Subscription tiers configuration
SUBSCRIPTION_TIERS = {
    "Free": {"tokens": 100, "price": 0},
    "Pro": {"tokens": 500, "price": 99, "price_id": STRIPE_PRICE_ID_PRO},
    "Agency": {"tokens": 1000, "price": 299, "price_id": STRIPE_PRICE_ID_AGENCY}
}

class StripeHandler:
    @staticmethod
    async def create_subscription(customer_id: str, price_id: str, payment_method_id: Optional[str] = None) -> Dict[str, Any]:
        """Create a new subscription for a customer"""
        try:
            # If payment method provided, attach it to customer
            if payment_method_id:
                payment_method = stripe.PaymentMethod.attach(
                    payment_method_id,
                    customer=customer_id
                )
                # Set as default payment method
                stripe.Customer.modify(
                    customer_id,
                    invoice_settings={
                        'default_payment_method': payment_method.id
                    }
                )

            # Create the subscription
            subscription = stripe.Subscription.create(
                customer=customer_id,
                items=[{'price': price_id}],
                payment_behavior='default_incomplete',
                expand=['latest_invoice.payment_intent']
            )

            return {
                'subscription_id': subscription.id,
                'client_secret': subscription.latest_invoice.payment_intent.client_secret,
                'status': subscription.status
            }
        except stripe.error.StripeError as e:
            logger.error(f"Error creating subscription: {str(e)}")
            raise ValueError(f"Failed to create subscription: {str(e)}")

    @staticmethod
    async def create_customer(email: str) -> Dict[str, Any]:
        """Create a new Stripe customer"""
        try:
            customer = stripe.Customer.create(email=email)
            return {
                'customer_id': customer.id,
                'email': customer.email
            }
        except stripe.error.StripeError as e:
            logger.error(f"Error creating Stripe customer: {str(e)}")
            raise ValueError(f"Failed to create Stripe customer: {str(e)}")