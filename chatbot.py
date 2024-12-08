import os
import asyncio
import logging
import google.generativeai as genai
from google.generativeai import caching
import datetime
from datetime import timezone
from dotenv import load_dotenv
from moviepy.editor import VideoFileClip
from typing import List, Dict, Optional, Tuple
import json
import re
import tempfile
from redis_storage import RedisFileStorage

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Get the API keys
api_key = os.getenv("GEMINI_API_KEY")
redis_url = os.getenv("REDIS_URL")
helicone_api_key = os.getenv("HELICONE_API_KEY")

if not api_key:
    raise ValueError("No GEMINI_API_KEY found in environment variables. Please set it in your .env file.")

if not redis_url:
    raise ValueError("No REDIS_URL found in environment variables. Please set it in your .env file.")

if not helicone_api_key:
    raise ValueError("No HELICONE_API_KEY found in environment variables. Please set it in your .env file.")

# Initial genai configuration (no user_id or video_upload properties here)
genai.configure(
    api_key=api_key,
    client_options={
        'api_endpoint': 'gateway.helicone.ai',
    },
    default_metadata=[
        ('helicone-auth', f'Bearer {helicone_api_key}'),
        ('helicone-target-url', 'https://generativelanguage.googleapis.com')
    ],
    transport="rest"
)

# Initialize Redis storage
redis_storage = RedisFileStorage(redis_url)

class Chatbot:
    def __init__(self):
        self.generation_config = genai.types.GenerationConfig(
            temperature=0.9,
            top_p=1,
            top_k=1,
            max_output_tokens=2048,
        )

        # Define safety settings
        safety_settings = {
            "HARM_CATEGORY_HARASSMENT": "BLOCK_NONE",
            "HARM_CATEGORY_HATE_SPEECH": "BLOCK_NONE",
            "HARM_CATEGORY_SEXUALLY_EXPLICIT": "BLOCK_NONE",
            "HARM_CATEGORY_DANGEROUS_CONTENT": "BLOCK_NONE",
        }

        self.model = genai.GenerativeModel(
            model_name="models/gemini-1.5-pro-002",
            generation_config=self.generation_config,
            safety_settings=safety_settings
        )

        # Store sessions with user and conversation isolation
        # We'll store whether we've configured Helicone for this user_id already.
        self.sessions = {}  # {f"{user_id}:{conversation_id}": session_data}
        self.system_prompt = """You are an expert video and content analyzer. 
        Maintain context of ALL interactions including user information, previous chats, and video analyses. Always assume questions are about the most recently analyzed video unless another video is specifically referenced. Absolutely don't mention uploading any new videos if not asked. If asked to analyze or explain again, just explain again without mentioning it was done again. When referring to previous content, be specific about which video you're discussing.
        If you make a mistake, acknowledge it and correct yourself.
        Format your responses using clean markdown with single # for headers and proper indentation."""

    def _format_response(self, response: str, filename: str = '') -> str:
        """Format the response with clean markdown structure"""
        if filename:
            uuid_pattern = r'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}_'
            clean_filename = re.sub(uuid_pattern, '', filename)
            response = response.replace(filename, clean_filename)

        lines = response.split('\n')
        formatted_lines = []
        for line in lines:
            line = line.strip()
            if not line:
                continue

            # Convert multiple # to single #
            if line.startswith('#'):
                line = re.sub(r'^#+\s*', '# ', line)

            # Format bullet points
            if line.startswith('•') or line.startswith('-'):
                line = re.sub(r'^[•-]\s*', '- ', line)
                if any(term in line.lower() for term in ['duration:', 'format:', 'resolution:', 'fps:', 'size:']):
                    line = f"  {line}"

            formatted_lines.append(line)

        return '\n\n'.join(formatted_lines)

    def _get_or_create_session(self, conversation_id: str, user_id: str = None) -> dict:
        """Get or create a new chat session for a conversation with user isolation"""
        if not conversation_id:
            raise ValueError("conversation_id is required for proper session isolation")
        if not user_id:
            raise ValueError("user_id is required for proper session isolation")

        session_key = f"{user_id}:{conversation_id}"
        if session_key not in self.sessions:
            self.sessions[session_key] = {
                'chat_session': self.model.start_chat(history=[]),
                'chat_history': [],
                'video_contexts': [],
                'user_id': user_id,
                'configured': False
            }
            self._add_to_history(conversation_id, "system", self.system_prompt, user_id)

        session = self.sessions[session_key]

        # If we haven't configured Helicone user property for this user's session yet, do it now.
        if not session['configured']:
            # Configure once per user session with Helicone-User-Id
            genai.configure(
                api_key=api_key,
                client_options={
                    'api_endpoint': 'gateway.helicone.ai',
                },
                default_metadata=[
                    ('helicone-auth', f'Bearer {helicone_api_key}'),
                    ('helicone-target-url', 'https://generativelanguage.googleapis.com'),
                    ('Helicone-User-Id', user_id)
                ],
                transport="rest"
            )
            session['configured'] = True

        return session

    def _add_to_history(self, conversation_id: str, role: str, content: str, user_id: str = None):
        """Add message to chat history with timezone-aware timestamp"""
        message = {
            "role": role,
            "content": content,
            "timestamp": datetime.datetime.now(timezone.utc).isoformat()
        }

        session_key = f"{user_id}:{conversation_id}" if user_id else conversation_id
        session = self.sessions.get(session_key)
        if session:
            session['chat_history'].append(message)

    async def extract_video_metadata(self, video_content: bytes) -> Optional[Dict]:
        """Extract metadata from video content"""
        temp_file = None
        try:
            temp_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
            temp_file.write(video_content)
            temp_file.flush()

            clip = VideoFileClip(temp_file.name)
            metadata = {
                'duration': str(datetime.timedelta(seconds=int(clip.duration))),
                'format': 'mp4',
                'size': len(video_content),
                'fps': clip.fps,
                'resolution': f"{clip.size[0]}x{clip.size[1]}"
            }
            clip.close()

            return metadata
        except Exception as e:
            logger.error(f"Error extracting video metadata: {str(e)}")
            return None
        finally:
            if temp_file:
                try:
                    temp_file.close()
                    os.unlink(temp_file.name)
                except Exception as e:
                    logger.error(f"Error cleaning up temporary file: {str(e)}")

    async def analyze_video(self, file_id: str, filename: str, conversation_id: str, user_id: str, prompt: str = '') -> tuple[str, Optional[Dict]]:
        """Analyze video content from Redis storage"""
        try:
            logger.info(f"Retrieving video content for file ID: {file_id}")
            video_content = await redis_storage.retrieve_file(file_id)
            if video_content is None:
                raise ValueError(f"Failed to retrieve video content for file ID: {file_id}")

            metadata = await self.extract_video_metadata(video_content)

            temp_file = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False)
            try:
                temp_file.write(video_content)
                temp_file.flush()
                logger.info(f"Uploading video file: {temp_file.name}")

                video_file = genai.upload_file(
                    path=temp_file.name,
                    mime_type="video/mp4"
                )

                logger.info("Waiting for video processing...")
                # Reduced sleep from 2s to 1s to check more frequently for readiness
                while video_file.state.name == "PROCESSING":
                    await asyncio.sleep(1)
                    video_file = genai.get_file(video_file.name)

                if video_file.state.name == "FAILED":
                    raise ValueError(f"Video processing failed: {video_file.state.name}")

                context_prompt = self._create_analysis_prompt(filename, metadata)
                if prompt:
                    context_prompt += f"\n\nAdditional instructions: {prompt}"

                session = self._get_or_create_session(conversation_id, user_id)

                # Reconfigure once here for video analysis requests with video_upload property
                genai.configure(
                    api_key=api_key,
                    client_options={
                        'api_endpoint': 'gateway.helicone.ai',
                    },
                    default_metadata=[
                        ('helicone-auth', f'Bearer {helicone_api_key}'),
                        ('helicone-target-url', 'https://generativelanguage.googleapis.com'),
                        ('Helicone-User-Id', user_id),
                        ('Helicone-Property-video_upload', 'video_upload')
                    ],
                    transport="rest"
                )

                response = await asyncio.to_thread(session['chat_session'].send_message, [video_file, context_prompt])
                response_text = self._format_response(response.text, filename)

                self._add_to_history(conversation_id, "system", f"Video Analysis ({filename}): {response_text}", user_id)
                session['video_contexts'].append({
                    'file_id': file_id,
                    'filename': filename,
                    'analysis': response_text,
                    'metadata': metadata
                })

                # After this video analysis completes, we might want to restore the configuration without video_upload
                # to avoid reconfiguration on next user message. However, if messages are frequent, consider caching.
                # We'll restore default user config:
                genai.configure(
                    api_key=api_key,
                    client_options={
                        'api_endpoint': 'gateway.helicone.ai',
                    },
                    default_metadata=[
                        ('helicone-auth', f'Bearer {helicone_api_key}'),
                        ('helicone-target-url', 'https://generativelanguage.googleapis.com'),
                        ('Helicone-User-Id', user_id)
                    ],
                    transport="rest"
                )

                return response_text, metadata

            finally:
                try:
                    temp_file.close()
                    os.unlink(temp_file.name)
                except Exception as e:
                    logger.error(f"Error cleaning up temporary file: {str(e)}")

        except Exception as e:
            logger.error(f"Error analyzing video: {str(e)}")
            return f"An error occurred during video analysis: {str(e)}", None

    async def send_message(self, message: str, conversation_id: str, user_id: str) -> str:
        """Send a message while maintaining context for a specific conversation"""
        try:
            session = self._get_or_create_session(conversation_id, user_id)
            self._add_to_history(conversation_id, "user", message, user_id)

            # Get recent history excluding system prompts
            recent_messages = []
            history_count = 0
            for msg in reversed(session['chat_history']):
                if msg['content'] != self.system_prompt:
                    recent_messages.append(msg)
                    history_count += 1
                    if history_count >= 5:
                        break
            recent_messages.reverse()

            # Format message history for context
            formatted_history = []
            for msg in recent_messages:
                role = "User" if msg['role'] == "user" else "Assistant"
                formatted_history.append(f"{role}: {msg['content']}")
            
            context_prompt = message
            if formatted_history:
                context_prompt = (
                    f"Previous conversation context:\n"
                    f"{chr(10).join(formatted_history)}\n\n"
                    f"Videos analyzed in this conversation: {len(session['video_contexts'])}\n\n"
                    f"User's message: {message}"
                )

            # Send message with context
            response = await asyncio.to_thread(session['chat_session'].send_message, context_prompt)
            response_text = self._format_response(response.text)

            self._add_to_history(conversation_id, "bot", response_text, user_id)

            return response_text
        except Exception as e:
            logger.error(f"Error sending message: {str(e)}")
            if "429" in str(e) or "quota" in str(e).lower():
                return "I apologize, but the API quota has been exceeded. Please try again in a few minutes."
            return "I apologize, but there was an unexpected error. Please try again."

    def _create_analysis_prompt(self, filename: str, metadata: Optional[Dict]) -> str:
        """Create the analysis prompt with proper context"""
        context_prompt = (
            f"Analyze this video in detail with the following structure:\n"
            f"# Video Information\n"
            f"- Filename: {filename}\n"
            f"- Technical Details:\n"
        )

        if metadata:
            context_prompt += (
                f"  Duration: {metadata.get('duration', 'Unknown')}\n"
                f"  Format: {metadata.get('format', 'Unknown')}\n"
                f"  Resolution: {metadata.get('resolution', 'Unknown')}\n\n"
            )
        else:
            context_prompt += "  (Technical details unavailable)\n\n"

        context_prompt += (
            f"# Content Overview\n"
            f"(Describe the main content and key scenes)\n\n"
            f"# Technical Quality\n"
            f"(Evaluate video and audio quality)\n\n"
            f"# Key Points\n"
            f"(List main takeaways)\n\n"
            f"# Areas for Improvement\n"
            f"(Suggest potential enhancements)\n\n"
        )

        return context_prompt
