import os
import logging
from datetime import datetime, timezone
logger = logging.getLogger(__name__)
from supabase.client import create_client, Client
from typing import List, Dict, Optional
import uuid
from redis_manager import RedisManager

redis_manager = RedisManager(os.environ.get('REDIS_URL'))

# Initialize Supabase client
supabase_url = os.environ.get("SUPABASE_URL")
supabase_key = os.environ.get("SUPABASE_ANON_KEY")

if not supabase_url or not supabase_key:
    raise ValueError("SUPABASE_URL or SUPABASE_ANON_KEY is missing from environment variables")

supabase: Client = create_client(supabase_url, supabase_key)

async def create_user(email: str, password: str) -> Dict:
    try:
        # Check if user already exists
        existing_user = await get_user_by_email(email)
        if existing_user:
            raise ValueError("User with this email already exists")
            
        # Create user with auth
        auth_response = supabase.auth.sign_up({
            "email": email,
            "password": password
        })
        
        if not auth_response.user:
            raise ValueError("Failed to create user authentication")
            
        # Create user record in users table
        response = supabase.table("users").insert({
            "id": auth_response.user.id,
            "email": email
        }).execute()
        
        return response.data[0] if response.data else {}
    except Exception as e:
        raise ValueError(f"Error creating user: {str(e)}")

async def get_user_by_email(email: str) -> Dict:
    response = supabase.table("users").select("*").eq("email", email).execute()
    return response.data[0] if response.data else {}

async def check_user_exists(user_id: uuid.UUID) -> bool:
    response = supabase.table("users").select("id").eq("id", str(user_id)).execute()
    return len(response.data) > 0

async def insert_chat_message(user_id: uuid.UUID, message: str, chat_type: str = 'text', conversation_id: Optional[uuid.UUID] = None) -> Dict:
    user_exists = await check_user_exists(user_id)
    if not user_exists:
        raise ValueError(f"User with id {user_id} does not exist")
        
    # If no conversation_id is provided, create a new conversation
    if not conversation_id:
        conversation = await create_conversation(user_id)
        conversation_id = uuid.UUID(conversation['id'])
        
    response = supabase.table("user_chat_history").insert({
        "user_id": str(user_id),
        "conversation_id": str(conversation_id),
        "message": message,
        "chat_type": chat_type
    }).execute()
    return response.data[0] if response.data else {}

async def get_chat_history(user_id: uuid.UUID, limit: int = 50) -> List[Dict]:
    response = supabase.table("user_chat_history").select("*").eq("user_id", str(user_id)).order("TIMESTAMP", desc=True).limit(limit).execute()
    return response.data

async def insert_video_analysis(user_id: uuid.UUID, upload_file_name: str, analysis: str, video_duration: Optional[str] = None, video_format: Optional[str] = None) -> Dict:
    response = supabase.table("video_analysis_output").insert({
        "user_id": str(user_id),
        "upload_file_name": upload_file_name,
        "analysis": analysis,
        "video_duration": video_duration,
        "video_format": video_format
    }).execute()
    return response.data[0] if response.data else {}

async def get_video_analysis_history(user_id: uuid.UUID, limit: int = 10) -> List[Dict]:
    response = supabase.table("video_analysis_output").select("*").eq("user_id", str(user_id)).order("TIMESTAMP", desc=True).limit(limit).execute()
    return response.data


async def get_user_conversations(user_id: uuid.UUID, limit: int = 10) -> List[Dict]:
    """Get all conversations for a user"""
    try:
        response = supabase.table("conversations").select("*").eq("user_id", str(user_id)).is_("deleted_at", "null").order("created_at", desc=True).limit(limit).execute()
        return response.data
    except Exception as e:
        logger.error(f"Error getting conversations: {str(e)}")
        return []

async def create_conversation(user_id: uuid.UUID, title: str = "New Conversation") -> Dict:
    """Create a new conversation for a user"""
    try:
        response = supabase.table("conversations").insert({
            "user_id": str(user_id),
            "title": title,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        return response.data[0] if response.data else {}
    except Exception as e:
        logger.error(f"Error creating conversation: {str(e)}")
        raise ValueError(f"Failed to create conversation: {str(e)}")

async def get_conversation_messages(conversation_id: uuid.UUID, limit: int = 50) -> List[Dict]:
    """Get all messages in a conversation with caching"""
    try:
        cache_key = f"conversation:{str(conversation_id)}"
        
        # Try to get from cache first
        cached_messages = redis_manager.get_cache(cache_key)
        if cached_messages:
            return cached_messages
            
        # If not in cache, get from database
        response = supabase.table("user_chat_history").select("*").eq("conversation_id", str(conversation_id)).order("TIMESTAMP", desc=True).limit(limit).execute()
        
        if response.data:
            # Cache the results for 5 minutes
            redis_manager.set_cache(cache_key, response.data)
            return response.data
        return []
    except Exception as e:
        logger.error(f"Error getting conversation messages: {str(e)}")
        return []

async def update_conversation_title(conversation_id: uuid.UUID, title: str) -> Dict:
    """Update a conversation's title"""
    try:
        # First check if conversation exists and is not deleted
        check_response = supabase.table("conversations").select("*").eq("id", str(conversation_id)).is_("deleted_at", "null").execute()
        if not check_response.data:
            logger.error(f"Conversation {conversation_id} not found or has been deleted")
            raise ValueError(f"Conversation {conversation_id} not found or has been deleted")

        # Validate title
        if not title or len(title.strip()) == 0:
            logger.error("Title cannot be empty")
            raise ValueError("Title cannot be empty")

        # Update the conversation
        response = supabase.table("conversations").update({
            "title": title.strip(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", str(conversation_id)).execute()

        if not response.data:
            logger.error(f"Failed to update conversation {conversation_id}")
            raise ValueError(f"Failed to update conversation {conversation_id}")

        logger.info(f"Successfully updated conversation {conversation_id} with title '{title}'")
        return response.data[0]
    except ValueError as e:
        logger.error(f"Validation error updating conversation title: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error updating conversation title: {str(e)}")
        raise ValueError(f"An unexpected error occurred while updating the conversation: {str(e)}")

async def delete_conversation(conversation_id: uuid.UUID) -> bool:
    """Soft delete a conversation"""
    try:
        # First check if conversation exists and is not already deleted
        check_response = supabase.table("conversations").select("*").eq("id", str(conversation_id)).is_("deleted_at", "null").execute()
        if not check_response.data:
            logger.error(f"Conversation {conversation_id} not found or has been already deleted")
            raise ValueError(f"Conversation {conversation_id} not found or has been already deleted")

        # Perform soft delete
        response = supabase.table("conversations").update({
            "deleted_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("id", str(conversation_id)).execute()

        if not response.data:
            logger.error(f"Failed to delete conversation {conversation_id}")
            raise ValueError(f"Failed to delete conversation {conversation_id}")

        logger.info(f"Successfully deleted conversation {conversation_id}")
        return True
    except ValueError as e:
        logger.error(f"Validation error deleting conversation: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error deleting conversation: {str(e)}")
        raise ValueError(f"An unexpected error occurred while deleting the conversation: {str(e)}")

# End of file
async def get_user_token_balance(user_id: uuid.UUID) -> int:
    """Get the current token balance for a user"""
    try:
        response = supabase.table("user_tokens").select("tokens").eq("user_id", str(user_id)).execute()
        if not response.data:
            # Initialize tokens if user doesn't have any
            await initialize_user_tokens(user_id)
            return 0
        return response.data[0]["tokens"]
    except Exception as e:
        logger.error(f"Error getting user token balance: {str(e)}")
        raise ValueError(f"Failed to get token balance: {str(e)}")

async def update_token_usage(user_id: uuid.UUID, tokens_used: int) -> None:
    """Update token usage for a user"""
    try:
        # Record token usage
        supabase.table("token_usage").insert({
            "user_id": str(user_id),
            "tokens_used": tokens_used,
        }).execute()

        # Update user's token balance
        current_balance = await get_user_token_balance(user_id)
        new_balance = max(0, current_balance - tokens_used)
        
        supabase.table("user_tokens").update({
            "tokens": new_balance,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).eq("user_id", str(user_id)).execute()
    except Exception as e:
        logger.error(f"Error updating token usage: {str(e)}")
        raise ValueError(f"Failed to update token usage: {str(e)}")

async def get_user_subscription_tier(user_id: uuid.UUID) -> Dict:
    """Get the subscription tier details for a user"""
    try:
        response = supabase.table("user_tokens").select(
            "subscription_tier_id, subscription_tiers(tier_name, tokens, price)"
        ).eq("user_id", str(user_id)).execute()
        
        if not response.data:
            # Initialize with default tier if not found
            await initialize_user_tokens(user_id)
            response = supabase.table("user_tokens").select(
                "subscription_tier_id, subscription_tiers(tier_name, tokens, price)"
            ).eq("user_id", str(user_id)).execute()
            
        return response.data[0] if response.data else {}
    except Exception as e:
        logger.error(f"Error getting user subscription tier: {str(e)}")
        raise ValueError(f"Failed to get subscription tier: {str(e)}")

async def initialize_user_tokens(user_id: uuid.UUID, tier_id: int = 1) -> None:
    """Initialize tokens for a new user with default subscription tier"""
    try:
        # Get the token amount for the tier
        tier_response = supabase.table("subscription_tiers").select("tokens").eq("id", tier_id).execute()
        if not tier_response.data:
            raise ValueError(f"Subscription tier {tier_id} not found")
            
        initial_tokens = tier_response.data[0]["tokens"]
        
        # Create user_tokens entry
        supabase.table("user_tokens").insert({
            "user_id": str(user_id),
            "subscription_tier_id": tier_id,
            "tokens": initial_tokens,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }).execute()
    except Exception as e:
        logger.error(f"Error initializing user tokens: {str(e)}")
        raise ValueError(f"Failed to initialize user tokens: {str(e)}")