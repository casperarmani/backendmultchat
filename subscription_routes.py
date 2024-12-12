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
            success_url=f"{domain_url}/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{domain_url}/cancel"
        )

        return {"url": session.url}

    except Exception as e:
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
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None)
):
    """Handle Stripe webhooks"""
    try:
        event = None
        payload = await request.body()
        sig_header = stripe_signature
        webhook_secret = os.environ.get('STRIPE_WEBHOOK_SECRET')

        try:
            event = stripe.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))

        if event['type'] == 'customer.subscription.updated':
            subscription = event['data']['object']
            # Update subscription status in database
            await database.update_subscription_status(
                subscription_id=subscription['id'],
                status=subscription['status']
            )
        elif event['type'] == 'customer.subscription.deleted':
            subscription = event['data']['object']
            # Update subscription status to canceled
            await database.update_subscription_status(
                subscription_id=subscription['id'],
                status='canceled'
            )

        return Response(status_code=200)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))