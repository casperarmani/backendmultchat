import functools
from typing import Callable, Any, Optional
from fastapi import HTTPException, Request
import uuid
import logging
from database import get_user_token_balance, update_token_usage
from auth import get_current_user

logger = logging.getLogger(__name__)

async def check_token_balance(user_id: uuid.UUID, required_tokens: int) -> bool:
    """Check if user has sufficient tokens for an operation"""
    try:
        current_balance = await get_user_token_balance(user_id)
        return current_balance >= required_tokens
    except Exception as e:
        logger.error(f"Error checking token balance: {str(e)}")
        return False

def validate_token_usage(required_tokens: int = 0, per_minute_tokens: int = 0):
    """
    Decorator to validate token usage before executing an operation
    
    Args:
        required_tokens (int): Base token cost for the operation
        per_minute_tokens (int): Additional tokens per minute of video
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            try:
                # Extract request object from args or kwargs
                request_obj = None
                if args and isinstance(args[0], Request):
                    request_obj = args[0]
                elif 'request' in kwargs and isinstance(kwargs['request'], Request):
                    request_obj = kwargs['request']

                if not request_obj:
                    logger.error("No request object found in function arguments")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid request format"
                    )

                # Get user from session using existing get_current_user function
                user_data = await get_current_user(request_obj)
                if not user_data or 'id' not in user_data:
                    logger.error("User not found in session")
                    raise HTTPException(
                        status_code=401,
                        detail="User not authenticated"
                    )

                try:
                    # Convert user ID to UUID
                    user_id = uuid.UUID(str(user_data['id']))
                except ValueError as e:
                    logger.error(f"Invalid user ID format: {str(e)}")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid user ID format"
                    )

                # Calculate total required tokens including video duration if applicable
                total_required_tokens = required_tokens
                if per_minute_tokens > 0 and 'video_duration' in kwargs:
                    try:
                        duration_minutes = float(kwargs['video_duration'])
                        total_required_tokens += int(duration_minutes * per_minute_tokens)
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Could not calculate per-minute token cost: {str(e)}")

                # Check token balance
                if not await check_token_balance(user_id, total_required_tokens):
                    raise HTTPException(
                        status_code=402,
                        detail="Insufficient tokens for this operation"
                    )

                # Execute the function
                result = await func(*args, **kwargs)

                # Update token usage after successful execution
                await update_token_usage(user_id, total_required_tokens)

                return result

            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error in token validation: {str(e)}")
                raise HTTPException(
                    status_code=500,
                    detail="Error processing token validation"
                )

        return wrapper
    return decorator