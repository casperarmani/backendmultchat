import os
from typing import Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import stripe
from auth import get_current_user
import uuid
import database
from starlette.requests import Request
from starlette.responses import Response

# Initialize Stripe
stripe.api_key = os.environ.get('STRIPE_SECRET_KEY')
STRIPE_PRICE_ID_PRO = os.environ.get('STRIPE_PRICE_ID_PRO')
STRIPE_PRICE_ID_AGENCY = os.environ.get('STRIPE_PRICE_ID_AGENCY')

# Subscription tiers configuration
SUBSCRIPTION_TIERS = {
    "Pro": {"tokens": 500, "price": 99, "stripe_price_id": STRIPE_PRICE_ID_PRO},
    "Agency": {"tokens": 1000, "price": 299, "stripe_price_id": STRIPE_PRICE_ID_AGENCY}
}

import logging
logger = logging.getLogger(__name__)
router = APIRouter()

@router.get("/config")
async def get_stripe_config():
    """Get Stripe publishable key"""
    return {"publishableKey": os.environ.get('STRIPE_PUBLISHABLE_KEY')}

@router.post("/create-checkout-session/{tier_name}")
async def create_checkout_session(
    tier_name: str,
    current_user: Dict = Depends(get_current_user)
):
    """Create a Stripe Checkout session for subscription"""
    try:
        if tier_name not in SUBSCRIPTION_TIERS:
            raise HTTPException(status_code=400, detail="Invalid subscription tier")

        user_id = uuid.UUID(current_user['id'])
        tier_info = SUBSCRIPTION_TIERS[tier_name]
        
        # Get or create Stripe customer
        subscription = await database.get_user_subscription(user_id)
        if not subscription or not subscription.get('stripe_customer_id'):
            # Create new Stripe customer
            customer = stripe.Customer.create(email=current_user['email'])
            customer_id = customer.id
            
            # Get tier details from database for subscription creation
            db_tier = await database.get_subscription_tier_by_name(tier_name)
            if not db_tier:
                raise HTTPException(status_code=400, detail="Subscription tier not found in database")
            
            # Save stripe customer id
            await database.create_user_subscription(
                user_id=user_id,
                tier_id=db_tier['id'],
                stripe_customer_id=customer_id
            )
        else:
            customer_id = subscription['stripe_customer_id']

        # Create checkout session
        domain_url = os.environ.get('DOMAIN_URL', 'http://localhost:8080')
        session = stripe.checkout.Session.create(
            customer=customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': tier_info['stripe_price_id'],
                'quantity': 1,
            }],
            mode='subscription',
            metadata={
                'user_id': str(user_id),
                'tier_name': tier_name
            },
            success_url=f"https://{domain_url}/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"https://{domain_url}/cancel"
        )

        return {"url": session.url}

    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        logger.error(f"Event type: {event['type'] if event else 'No event'}")
        logger.error(f"Event data: {event['data'] if event else 'No data'}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/subscriptions/current")
async def get_current_subscription(
    current_user: Dict = Depends(get_current_user)
):
    """Get current user's subscription details"""
    try:
        user_id = uuid.UUID(current_user['id'])
        subscription = await database.get_user_subscription(user_id)
        
        if not subscription:
            return {"tier": "Free", "status": "active"}

        return subscription
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        logger.error(f"Event type: {event['type'] if event else 'No event'}")
        logger.error(f"Event data: {event['data'] if event else 'No data'}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None)
):
    """Handle Stripe webhooks"""
    try:
        logger.info("Received Stripe webhook")
        event = None
        payload = await request.body()
        sig_header = stripe_signature
        webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET')

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
            logger.info(f"Webhook event type: {event.type}")
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid signature: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid signature")
        except Exception as e:
            logger.error(f"Webhook error: {str(e)}")
            raise HTTPException(status_code=400, detail=str(e))

        if event.type == 'checkout.session.completed':
            session = event.data.object
            logger.info(f"Checkout completed for customer: {session.customer}")
            
            # Update subscription status
            logger.info(f"Session data: {session}")
            if session.mode == 'subscription':
                try:
                    # Get the subscription from the session metadata
                    subscription = await database.update_subscription_status(
                        subscription_id=session.subscription,
                        status='active',
                        stripe_customer_id=session.customer
                    )
                    logger.info(f"Subscription {session.subscription} created and activated for customer {session.customer}")

                    # Update user's subscription tier and tokens based on metadata
                    if 'user_id' in session.metadata and 'tier_name' in session.metadata:
                        # Get tier details
                        tier_details = await database.get_subscription_tier_by_name(session.metadata['tier_name'])
                        if tier_details:
                            # Update tier
                            await database.update_user_subscription_tier(
                                user_id=session.metadata['user_id'],
                                tier_name=session.metadata['tier_name']
                            )
                            # Update token balance
                            await database.update_user_token_balance(
                                user_id=uuid.UUID(session.metadata['user_id']),
                                tokens=tier_details['tokens']
                            )
                            logger.info(f"Updated user {session.metadata['user_id']} to tier {session.metadata['tier_name']} with {tier_details['tokens']} tokens")
                except Exception as e:
                    logger.error(f"Failed to update subscription: {str(e)}")
                    raise
                
        elif event.type == 'customer.subscription.updated':
            subscription = event.data.object
            try:
                # Update subscription status and customer ID in database
                result = await database.update_subscription_status(
                    subscription_id=subscription.id,
                    status=subscription.status,
                    stripe_customer_id=subscription.customer
                )
                logger.info(f"Updated subscription {subscription.id} status to {subscription.status}")
                logger.info(f"Update result: {result}")
            except Exception as e:
                logger.error(f"Failed to update subscription {subscription.id}: {str(e)}")
                raise
        elif event.type == 'customer.subscription.deleted':
            subscription = event.data.object
            try:
                # Update subscription status to canceled
                result = await database.update_subscription_status(
                    subscription_id=subscription.id,
                    status='canceled'
                )
                logger.info(f"Marked subscription {subscription.id} as canceled")
                logger.info(f"Update result: {result}")
            except Exception as e:
                logger.error(f"Failed to cancel subscription {subscription.id}: {str(e)}")
                raise

        return Response(status_code=200)
    except Exception as e:
        logger.error(f"Webhook error: {str(e)}")
        logger.error(f"Event type: {event['type'] if event else 'No event'}")
        logger.error(f"Event data: {event['data'] if event else 'No data'}")
        raise HTTPException(status_code=500, detail=str(e))