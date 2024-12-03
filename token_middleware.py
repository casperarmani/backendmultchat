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

def validate_token_usage(video_duration: float = None):
    """
    Decorator to validate token usage before executing an operation
    
    Args:
        video_duration (float): Duration of video in seconds, if None then no tokens are charged
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
                    # Extract and validate user ID
                    user_id_str = str(user_data.get('id', ''))
                    if not user_id_str:
                        logger.error("User ID is missing from session data")
                        raise ValueError("User ID is missing")
                        
                    try:
                        user_id = uuid.UUID(user_id_str)
                    except ValueError as e:
                        logger.error(f"Invalid user ID format: {user_id_str}")
                        raise ValueError(f"Invalid user ID format: {str(e)}")
                        
                    # Verify user exists in database
                    if not await check_user_exists(user_id):
                        logger.error(f"User {user_id} not found in database")
                        raise ValueError("User not found in database")
                        
                except ValueError as e:
                    logger.error(f"User validation failed: {str(e)}")
                    raise HTTPException(
                        status_code=400,
                        detail=str(e)
                    )

                # Calculate required tokens based on video duration (1 token per second)
                total_required_tokens = 0
                if video_duration is not None:
                    try:
                        if isinstance(video_duration, str):
                            # If duration is in HH:MM:SS format, convert to seconds
                            parts = video_duration.split(':')
                            if len(parts) == 3:
                                hours, minutes, seconds = map(float, parts)
                                total_required_tokens = int(hours * 3600 + minutes * 60 + seconds)
                            elif len(parts) == 2:
                                minutes, seconds = map(float, parts)
                                total_required_tokens = int(minutes * 60 + seconds)
                            else:
                                total_required_tokens = int(float(video_duration))
                        else:
                            total_required_tokens = int(float(video_duration))
                            
                        logger.info(f"Calculated token requirement: {total_required_tokens} tokens for duration: {video_duration}")
                    except (ValueError, TypeError) as e:
                        logger.warning(f"Could not calculate token cost from video duration: {str(e)}")
                        raise HTTPException(
                            status_code=400,
                            detail=f"Invalid video duration format: {video_duration}"
                        )

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