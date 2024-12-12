from fastapi import APIRouter, Depends, HTTPException, Header, Request, Response
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from stripe_handler import StripeHandler, SUBSCRIPTION_TIERS
import database
import uuid
from auth import get_current_user

router = APIRouter()

class SubscriptionCreate(BaseModel):
    payment_method_id: str
    tier_name: str = Field(..., regex="^(Pro|Agency)$")

class SubscriptionResponse(BaseModel):
    subscription_id: str
    client_secret: Optional[str]
    status: str

@router.post("/subscriptions", response_model=SubscriptionResponse)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: Dict = Depends(get_current_user)
):
    """Create a new subscription for the current user"""
    try:
        user_id = uuid.UUID(current_user['id'])
        
        # Get tier details
        tier_info = SUBSCRIPTION_TIERS.get(data.tier_name)
        if not tier_info or not tier_info.get('price_id'):
            raise HTTPException(status_code=400, detail="Invalid subscription tier")

        # Get tier ID from database
        tier_response = await database.get_subscription_tier_by_name(data.tier_name)
        if not tier_response:
            raise HTTPException(status_code=400, detail="Subscription tier not found in database")
        tier_id = tier_response['id']

        # Get or create Stripe customer
        subscription = await database.get_user_subscription(user_id)
        if not subscription or not subscription.get('stripe_customer_id'):
            # Create new Stripe customer
            customer = await StripeHandler.create_customer(current_user['email'])
            customer_id = customer['customer_id']
            # Save stripe customer id in user_subscriptions
            await database.create_user_subscription(
                user_id=user_id,
                tier_id=tier_id,
                stripe_customer_id=customer_id
            )
        else:
            customer_id = subscription['stripe_customer_id']

        # Create Stripe subscription
        result = await StripeHandler.create_subscription(
            customer_id=customer_id,
            price_id=tier_info['price_id'],
            payment_method_id=data.payment_method_id
        )

        # Update subscription with Stripe subscription ID
        await database.update_subscription_status(
            subscription_id=result['subscription_id'],
            status=result['status']
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/subscriptions/{subscription_id}")
async def cancel_subscription(
    subscription_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """Cancel a subscription"""
    try:
        user_id = uuid.UUID(current_user['id'])
        
        # Verify subscription belongs to user
        subscription = await database.get_user_subscription(user_id)
        if not subscription or subscription['stripe_subscription_id'] != subscription_id:
            raise HTTPException(status_code=404, detail="Subscription not found")

        # Cancel in Stripe
        result = await StripeHandler.cancel_subscription(subscription_id)
        
        # Update database
        await database.update_subscription_status(
            subscription_id=subscription_id,
            status='canceled'
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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

        if subscription.get('stripe_subscription_id'):
            stripe_sub = await StripeHandler.get_subscription(
                subscription['stripe_subscription_id']
            )
            subscription.update(stripe_sub)

        return subscription
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None)
):
    """Handle Stripe webhooks"""
    try:
        payload = await request.body()
        event_data = await StripeHandler.handle_webhook(payload, stripe_signature)
        
        # Handle subscription status updates
        if event_data['event'] in ['subscription_updated', 'subscription_deleted']:
            await database.update_subscription_status(
                subscription_id=event_data['subscription_id'],
                status=event_data.get('status', 'canceled')
            )

        return Response(status_code=200)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/subscriptions/{subscription_id}")
async def cancel_subscription(
    subscription_id: str,
    current_user: Dict = Depends(get_current_user)
):
    """Cancel a subscription"""
    try:
        user_id = uuid.UUID(current_user['id'])
        
        # Verify subscription belongs to user
        subscription = await database.get_user_subscription(user_id)
        if not subscription or subscription['stripe_subscription_id'] != subscription_id:
            raise HTTPException(status_code=404, detail="Subscription not found")

        # Cancel in Stripe
        result = await StripeHandler.cancel_subscription(subscription_id)
        
        # Update database
        await database.update_subscription_status(
            user_id=user_id,
            status='canceled'
        )

        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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

        if subscription.get('stripe_subscription_id'):
            stripe_sub = await StripeHandler.get_subscription(
                subscription['stripe_subscription_id']
            )
            subscription.update(stripe_sub)

        return subscription
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None)
):
    """Handle Stripe webhooks"""
    try:
        payload = await request.body()
        event_data = await StripeHandler.handle_webhook(payload, stripe_signature)
        
        # Handle subscription status updates
        if event_data['event'] in ['subscription_updated', 'subscription_deleted']:
            subscription = await database.get_subscription_by_stripe_id(
                event_data['subscription_id']
            )
            if subscription:
                await database.update_subscription_status(
                    user_id=subscription['user_id'],
                    status=event_data.get('status', 'canceled')
                )

        return Response(status_code=200)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
