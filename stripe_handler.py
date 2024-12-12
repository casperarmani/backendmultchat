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
    async def create_checkout_session(customer_id: str, price_id: str, success_url: str, cancel_url: str) -> Dict[str, Any]:
        """Create a Stripe Checkout session for subscription"""
        try:
            checkout_session = stripe.checkout.Session.create(
                customer=customer_id,
                payment_method_types=['card'],
                line_items=[{
                    'price': price_id,
                    'quantity': 1,
                }],
                mode='subscription',
                success_url=success_url,
                cancel_url=cancel_url,
            )

            return {
                'session_id': checkout_session.id,
                'url': checkout_session.url
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