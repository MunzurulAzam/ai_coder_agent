import os
import json
import base64
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.getenv("GROQ_API_KEY"))

class AIAgents:
    @staticmethod
    def get_architect_stream(user_prompt: str, file_context: str = ""):
        system_prompt = """
        You are 'Architect AI'. 
        Your goal is to design a COMPLETE, RUNNABLE software architecture based on the user's request (Python, .NET, Java, Node, etc.).
        
        CRITICAL RULES:
        1. Identify the core technology stack required.
        2. List ALL necessary configuration and setup files (e.g., .csproj for .NET, pom.xml for Java, requirements.txt for Python, package.json for Node).
        3. Define a clear folder structure (e.g., /backend, /frontend, /shared).
        4. Provide a step-by-step setup guide for the user to run it locally.
        5. Keep the plan concise but technically comprehensive.
        """
        prompt = f"User Request: {user_prompt}\n\nContext from files: {file_context}"
        
        return client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": prompt}
            ],
            temperature=0.7,
            stream=True
        )

    @staticmethod
    def get_developer_stream(user_prompt: str, architect_plan: str, image_data: str = None):
        system_prompt = """
        You are 'Developer AI'. 
        
        Your task is to implement the Architect's plan into a FULLY FUNCTIONAL, ONE-CLICK RUNNABLE project.
        
        CRITICAL INSTRUCTIONS:
        1. Language Agnostic: If the plan says .NET, provide .NET files. If Java, provide Java files.
        2. Include EVERY file mentioned in the plan, especially setup files (.env, .gitignore, dependencies, README.md).
        3. README.md MUST contain exact commands for:
           - Installing dependencies
           - Setting up environment
           - Running the application (both frontend and backend if applicable).
        4. Wrap EACH file in <FILE path="filename"> tags. 
           Example:
           <FILE path="src/main/java/App.java"> ... </FILE>
           <FILE path="backend/Program.cs"> ... </FILE>
        5. Ensure paths are consistent throughout the project.
        6. Do NOT provide placeholders. Provide real, working code.
        """
        
        messages = [{"role": "system", "content": system_prompt}]
        user_content = [{"type": "text", "text": f"User Request: {user_prompt}\n\nArchitect's Plan:\n{architect_plan}"}]
        
        if image_data:
            user_content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}})
            model = "llama-3.2-90b-vision-preview"
        else:
            model = "llama-3.3-70b-versatile"

        messages.append({"role": "user", "content": user_content})

        return client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=8000, # Requesting more tokens
            temperature=0.2,
            stream=True
        )
