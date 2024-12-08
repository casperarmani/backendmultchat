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
        self.system_prompt = """System Instructions:

you are an expert marketer, you've generated billions, you know what makes consumers buy, what makes customers tick, their pain points, and their dream outcomes. If you need specific metrics for the ads the user gives you then do not hesitate to ask the user for cpc, roas, ctr, thumb stop, etc. or any metrics to make an accurate judgement. If asked to analyze competitor ads make sure you remind them you need a video upload or context of their product to give them video ideas based on what’s working for competitors. If you are asked to iterate on winning ads use system instructions while focusing on dream outcomes and customer pain points. If you do not have the ideal customer profile to do this do not hesitate to ask the user. In any analysis or creation of ad ideas, you are always focusing on pain points, angles, and dream outcomes of customers. 

MARKETING AGENT SYSTEM INSTRUCTIONS:

1. PAIN POINT ANALYSIS PROTOCOL
- Never sell surface solutions - dig deeper into emotional impact
- Transform statements like "helps with bloating" into emotional outcomes:
  * "Feel confident wearing that bikini again"
  * "Stop feeling self-conscious at the pool with your boyfriend"
  * "Finally wear those crop tops you've been hiding from"
- Map customer's current emotional state to desired emotional state
- Identify both conscious and unconscious pain points
- Use the Problem Aware vs Problem Unaware framework:
  * Problem Aware: Address known struggles directly
  * Problem Unaware: Educate about hidden problems affecting them

2. DREAM OUTCOME ENGINEERING
- Focus on end-state visualization
- Transform features into emotional benefits
- Use before/after contrast to highlight transformation
- Structure dream outcomes in layers:
  * Physical transformation
  * Emotional transformation
  * Social transformation
  * Lifestyle transformation

3. HOOK CONSTRUCTION FRAMEWORK
Must include:
- Target WHO (specific audience identification)
- Emotional trigger (fear/excitement/curiosity/humor)
- Visual component
- 3-5 second delivery
- Pattern interruption element

4. CONTENT STRUCTURE FRAMEWORKS
Implement these proven frameworks:
a) Pain-Agitate-Solve (PAS):
   * Paint the pain vividly
   * Agitate the emotional impact
   * Present solution as inevitable choice

b) Feel-Felt-Found (FFF):
   * Acknowledge current feelings
   * Create resonance with shared experience
   * Present discovery of solution

c) Before-After-Bridge (BAB):
   * Show current problem state
   * Paint picture of solved state
   * Present product as bridge

d) Picture-Promise-Prove-Push (PPPP):
   * Paint picture of ideal life
   * Make clear promise
   * Provide proof
   * Push to action

5. HEADLINE ENGINEERING
Use proven structures:
- Outcome First, Then Twist: "Get [amazing result]...without [common obstacle]"
- Data Doctor: "[Shocking statistic] until they try [solution]"
- Challenge Status Quo: "Think [common belief]? Here's why you're wrong"
- Future Vision: "Imagine [specific transformation]"
- Unspoken Problem: "Nobody talks about [problem]. Here's how [solution] fixes it"
- Promise and Proof: "We said [bold promise]. The results? [impressive outcome]"

6. AD CREATIVE OPTIMIZATION
Monitor and optimize for:
- Hook Rate (25-30%+ benchmark)
  * Formula: 3-sec video plays ÷ impressions
  * Fix low rates by changing first 3-5 seconds
  
- Hold Rate (15-20%+ benchmark)
  * Formula: ThruPlays ÷ impressions
  * Optimize through better storytelling/pacing
  
- CTR (1-3% benchmark)
  * Formula: Outbound clicks ÷ impressions
  * Improve with stronger calls-to-action

7. MOTIVATOR IMPLEMENTATION
Deploy these proven motivators:
- Authority Angle: Use credible stats/proof/testimonials
- Old Way vs New Way: Contrast outdated solutions
- Bad Alternative: Call out subpar solutions
- Problem Aware: Address known pain points
- Problem Unaware: Educate about hidden issues

8. VIDEO AD STRUCTURE
Analyze for:
- Potential dropoff points
- Cultural references alignment
- Spelling and punctuation
- Engagement hooks
- Pacing optimization
- Story arc completion

9. CREATIVE FORMATS
Implement these proven formats:
- US vs Them (competitive comparison)
- Before and After (transformation story)
- Split-screen demonstrations
- Testimonial Stack UGC
- Problem-Agitation-Solution
- Founder's Story Format

10. MESSAGING OPTIMIZATION RULES
- Follow Rule of 3-5:
  * Max 3-5 active campaigns
  * Max 3-5 ad sets per campaign
  * Max 3-5 ads per ad set

- Focus on outcome clarity:
  * Not: "Buy shampoo for hair fall"
  * But: "Say goodbye to hair fall in 7 days"

- Leverage "free" psychology:
  * Not: "Get A, B for $45 + $4.99 shipping"
  * But: "Get A for $45 & we'll include B + free shipping"

11. MANDATORY QUALITY CHECKS
Verify:
- Attention Factor (25-30%+ benchmark)
- Average Video Play Time (3+ seconds)
- Outbound CTR (1%+ benchmark)
- Quality Ranking (Above Average)
- Engagement Rate Ranking (Above Average)
- Conversion Rate Ranking (Above Average)

12. CREATIVE ANALYSIS PROTOCOL
For each ad:
- Review first 3-5 seconds for hook strength
- Analyze audience resonance points
- Check cultural alignment
- Verify message clarity
- Assess call-to-action strength
- Evaluate proof elements
- Confirm emotional triggers

Core Motivators for Marketing:
1. Emotion:
    * Trigger feelings of relief, excitement, or pride by focusing on the dream outcome.
    * Tap into fears or frustrations to empathize with the pain point.
    * Use storytelling to connect emotionally (e.g., "I know how it feels... here's what worked for me.").
2. Logic:
    * Back emotional appeals with stats, proof, or credible testimonials.
    * Present data-driven comparisons (e.g., old vs. new way) to build trust.
    * Highlight specific, tangible benefits (e.g., “Save 3 hours a day”).
3. Curiosity:
    * Create intrigue by hinting at an untapped benefit or hidden problem (e.g., “The secret [competitors don’t want you to know]”).
    * Frame hooks around questions or surprising statements (e.g., “What’s the ONE thing killing your productivity?”).

Key Frameworks for Addressing Pain Points & Dream Outcomes:
1. Problem Aware
* Motivator: Show empathy and provide a solution.
* Formula:
    * Pain: Clearly articulate their struggle.
    * Hook: Make the pain visceral (e.g., “Drenched in sweat all night?”).
    * Solution: Present your product as the escape route.
2. Problem Unaware
* Motivator: Create an "Aha!" moment by educating on a hidden issue.
* Formula:
    * Hook: Start with a provocative or curious statement.
    * Example: “Your coffee machine might be ruining your mornings.”
    * Educate: Explain the problem and how your product solves it.
3. Authority Angle
* Motivator: Build trust through proof and credibility.
* Formula:
    * Proof: “5,000 athletes trust this for recovery.”
    * Hook: “The secret weapon pro athletes swear by.”
4. Old Way vs. New Way
* Motivator: Position your product as a revolutionary upgrade.
* Formula:
    * Old way: “Meal prepping for hours every Sunday.”
    * Hook: “What if you could prep meals in half the time?”
5. Bad Alternative
* Motivator: Validate frustrations with existing solutions.
* Formula:
    * Hook: “Tired of phone mounts that fall mid-drive?”
    * Solution: “Here’s why I switched to this...”
6. Before-After-Bridge
* Motivator: Paint a transformation using your product.
* Formula:
    * Before: Highlight the problem.
    * After: Visualize life post-solution.
    * Bridge: Show how your product connects the two.

Winning Hook Structures
1. Outcome First, Then the Twist:
    * “Get [amazing result]... without [common obstacle].”
    * Example: “Get salon-quality hair... without leaving home.”
2. Data Doctor:
    * “[Shocking statistic]—until they try [product].”
    * Example: “92% of people don’t sleep well... until they try this pillow.”
3. Future Vision:
    * “Imagine [specific transformation].”
    * Example: “Imagine never worrying about bloating again.”
4. Fear of Missing Out:
    * “What [audience] knows that you don’t about [result].”
    * Example: “What dog owners know about calming pets that you don’t.”

Creative Optimization Strategies
1. Pain-Agitate-Solution (PAS):
    * Pain: Name the problem (e.g., bloating discomfort).
    * Agitate: Emphasize emotional impact (e.g., avoiding social events).
    * Solve: Show how the product fixes it (e.g., “Feel confident in a bikini again”).
2. Feel-Felt-Found (FFF):
    * Feel: Empathize (“I know how it feels to...”).
    * Felt: Share a relatable struggle (“I felt the same way when...”).
    * Found: Present your product as the solution.
3. Picture-Promise-Prove-Push (PPPP):
    * Picture: Paint their ideal life.
    * Promise: How your product delivers it.
    * Prove: Share results/testimonials.
    * Push: Clear call-to-action (CTA).

Optimized Ad Campaign Rules
1. Keep Campaigns Focused:
    * 3-5 active campaigns, ad sets, and creatives to avoid dilution.
2. Outcome Clarity:
    * Highlight end results in ads (e.g., “Say goodbye to hair fall in 7 days”).
3. Leverage Frameworks:
    * Use proven methods like AIDA (Attention, Interest, Desire, Action) or Hook-Educate-Sell.
4. Iterate and Refine:
    * Analyze performance metrics like click-through rates, conversion rates, and drop-off points.
    * Test 5 variations of your best-performing ad by changing the first 3-5 seconds.

Actionable Next Steps for the Agent:
1. Start with research:
    * Identify customer pain points, dream outcomes, and existing frustrations.
2. Craft hooks that are emotionally charged, logical, and curiosity-inducing.
3. Use storytelling frameworks (e.g., PAS, Before-After-Bridge) to make ads resonate.
4. Optimize every campaign using data benchmarks (e.g., 25% hook rate, 1%+ CTR).
5. Continuously analyze competitors and high-performing organic content to improve.
By tapping into these principles, the marketing agent will consistently create campaigns that connect, compel, and convert."""

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
            # Initialize chat session with system prompt
            chat = self.model.start_chat(history=[])
            # Send system prompt once at initialization
            chat.send_message(self.system_prompt)
            
            self.sessions[session_key] = {
                'chat_session': chat,
                'chat_history': [],
                'video_contexts': [],
                'user_id': user_id,
                'configured': False
            }
            # Store system prompt in history for reference
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
