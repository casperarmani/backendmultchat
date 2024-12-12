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
    async def create_customer(email: str, name: Optional[str] = None) -> Dict[str, Any]:
        """Create a new Stripe customer"""
        try:
            customer = stripe.Customer.create(
                email=email,
                name=name
            )
            return {
                'customer_id': customer.id,
                'email': customer.email,
                'created': datetime.fromtimestamp(customer.created).isoformat()
            }
        except stripe.error.StripeError as e:
            logger.error(f"Error creating Stripe customer: {str(e)}")
            raise ValueError(f"Failed to create Stripe customer: {str(e)}")

    @staticmethod
    async def create_subscription(
        customer_id: str,
        price_id: str,
        payment_method_id: Optional[str] = None
    ) -> Dict[str, Any]:
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
                expand=['latest_invoice.payment_intent'],
                metadata={
                    'price_id': price_id
                }
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
    async def cancel_subscription(subscription_id: str) -> Dict[str, Any]:
        """Cancel a subscription"""
        try:
            subscription = stripe.Subscription.delete(subscription_id)
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'canceled_at': datetime.fromtimestamp(subscription.canceled_at).isoformat() if subscription.canceled_at else None
            }
        except stripe.error.StripeError as e:
            logger.error(f"Error canceling subscription: {str(e)}")
            raise ValueError(f"Failed to cancel subscription: {str(e)}")

    @staticmethod
    async def get_subscription(subscription_id: str) -> Dict[str, Any]:
        """Get subscription details"""
        try:
            subscription = stripe.Subscription.retrieve(subscription_id)
            return {
                'subscription_id': subscription.id,
                'status': subscription.status,
                'current_period_end': datetime.fromtimestamp(subscription.current_period_end).isoformat(),
                'canceled_at': datetime.fromtimestamp(subscription.canceled_at).isoformat() if subscription.canceled_at else None
            }
        except stripe.error.StripeError as e:
            logger.error(f"Error retrieving subscription: {str(e)}")
            raise ValueError(f"Failed to retrieve subscription: {str(e)}")

    @staticmethod
    def get_price_id_for_tier(tier_name: str) -> Optional[str]:
        """Get Stripe price ID for a subscription tier"""
        if tier_name == "Pro":
            return STRIPE_PRICE_ID_PRO
        elif tier_name == "Agency":
            return STRIPE_PRICE_ID_AGENCY
        return None

    @staticmethod
    async def handle_webhook(payload: Dict[str, Any], sig_header: str) -> Dict[str, Any]:
        """Handle Stripe webhook events"""
        webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET')
        if not webhook_secret:
            raise ValueError("STRIPE_WEBHOOK_SECRET is required for webhook handling")

        try:
            event = stripe.Webhook.construct_event(
                payload,
                sig_header,
                webhook_secret
            )

            # Handle specific events
            if event.type == 'customer.subscription.updated':
                subscription = event.data.object
                return {
                    'event': 'subscription_updated',
                    'subscription_id': subscription.id,
                    'status': subscription.status
                }
            elif event.type == 'customer.subscription.deleted':
                subscription = event.data.object
                return {
                    'event': 'subscription_deleted',
                    'subscription_id': subscription.id
                }
            elif event.type == 'invoice.payment_succeeded':
                invoice = event.data.object
                return {
                    'event': 'payment_succeeded',
                    'subscription_id': invoice.subscription,
                    'amount_paid': invoice.amount_paid
                }
            elif event.type == 'invoice.payment_failed':
                invoice = event.data.object
                return {
                    'event': 'payment_failed',
                    'subscription_id': invoice.subscription
                }

            return {'event': event.type}
        except (ValueError, stripe.error.SignatureVerificationError) as e:
            logger.error(f"Error handling webhook: {str(e)}")
            raise ValueError(f"Webhook error: {str(e)}")
