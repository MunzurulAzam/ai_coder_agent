import os
import json
import uuid
import zipfile
import base64
import re
import time
from flask import Flask, request, jsonify, Response, send_from_directory
from flask_cors import CORS
from asgiref.wsgi import WsgiToAsgi
from agents import AIAgents

app = Flask(__name__)
CORS(app)
asgi_app = WsgiToAsgi(app)

TEMP_DIR = "temp_projects"
os.makedirs(TEMP_DIR, exist_ok=True)

def repair_json(json_str):
    """Attempt to repair a truncated JSON string by adding missing closing braces."""
    json_str = json_str.strip()
    # Find the start of the JSON object
    start_idx = json_str.find('{')
    if start_idx == -1:
        return None
    
    json_str = json_str[start_idx:]
    
    # Count open and closed braces
    open_braces = json_str.count('{')
    close_braces = json_str.count('}')
    
    # Add missing braces
    if open_braces > close_braces:
        json_str += '}' * (open_braces - close_braces)
    
    try:
        return json.loads(json_str)
    except:
        # Try to find the last valid comma or property and trim it
        try:
            # Very aggressive: keep trimming until it works or becomes too small
            for i in range(len(json_str), 0, -1):
                try:
                    return json.loads(json_str[:i] + '}')
                except:
                    continue
        except:
            return None
    return None

def robust_json_extract(text):
    print(f"--- Attempting JSON Extraction from text (len: {len(text)}) ---")
    # Try to find content between <PROJECT_JSON> tags
    match = re.search(r"<PROJECT_JSON>([\s\S]*?)(?:</PROJECT_JSON>|$)", text, re.DOTALL)
    if not match:
        print("No <PROJECT_JSON> tags found. Searching for last '{'...")
        # Try to find the last occurrence of {
        start_idx = text.rfind('{')
        if start_idx != -1:
            raw_json = text[start_idx:]
        else:
            print("No JSON markers found.")
            return None
    else:
        raw_json = match.group(1).strip()
        print(f"Found content within tags (len: {len(raw_json)})")
    
    # Clean markdown
    raw_json = re.sub(r"```json", "", raw_json)
    raw_json = re.sub(r"```", "", raw_json)
    
    # Attempt parsing, if fails, try to repair
    try:
        data = json.loads(raw_json)
        print("JSON parsed successfully.")
        return data
    except Exception as e:
        print(f"JSON parse failed: {str(e)}. Attempting repair...")
        repaired = repair_json(raw_json)
        if repaired:
            print("JSON repaired successfully.")
        else:
            print("JSON repair failed.")
        return repaired

@app.route("/", methods=["GET"])
def index():
    return jsonify({"status": "running", "message": "Dual-AI Agent Coder API is active"}), 200

@app.route("/collaborate", methods=["POST"])
def collaborate():
    prompt = request.form.get("prompt")
    files = request.files.getlist("files")
    
    image_data = None
    file_context = ""
    
    if files:
        for file in files:
            content = file.read()
            if file.content_type.startswith("image/"):
                image_data = base64.b64encode(content).decode("utf-8")
            else:
                try:
                    file_context += f"\n--- File: {file.filename} ---\n{content.decode('utf-8')}\n"
                except:
                    file_context += f"\n--- File: {file.filename} (Binary) ---\n"

    def generate():
        try:
            architect_plan = ""
            yield "AGENT_START: ARCHITECT\n"
            for chunk in AIAgents.get_architect_stream(prompt, file_context):
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    architect_plan += content
                    yield content
            yield "\nAGENT_END: ARCHITECT\n"
            
            time.sleep(0.5)
            
            yield "AGENT_START: DEVELOPER\n"
            for chunk in AIAgents.get_developer_stream(prompt, architect_plan, image_data):
                if chunk.choices and chunk.choices[0].delta.content:
                    content = chunk.choices[0].delta.content
                    yield content
            yield "\nAGENT_END: DEVELOPER\n"
        except Exception as e:
            print(f"Stream Error: {str(e)}")
            yield f"\nERROR: {str(e)}\n"

    return Response(generate(), mimetype="text/plain")

@app.route("/generate-zip", methods=["POST"])
def create_zip():
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No JSON data received"}), 400
            
        # The frontend now sends the files object directly
        files = data.get("files", {})
        
        if not files:
            # Fallback for old clients or if full_text was sent
            full_text = data.get("full_text", "")
            if full_text:
                project_data = robust_json_extract(full_text)
                files = project_data.get("files", {}) if project_data else {}

        if not files:
            return jsonify({"error": "No project files found. AI output might be malformed or empty."}), 400
            
        project_id = str(uuid.uuid4())
        zip_filename = f"{project_id}.zip"
        zip_path = os.path.join(TEMP_DIR, zip_filename)
        
        with zipfile.ZipFile(zip_path, 'w') as zipf:
            for filepath, content in files.items():
                if isinstance(content, str):
                    zipf.writestr(filepath, content)
        
        return jsonify({"zip_url": f"{request.host_url}download/{zip_filename}"})
    except Exception as e:
        print(f"Zip Creation Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/download/<filename>")
def download_file(filename):
    return send_from_directory(TEMP_DIR, filename, as_attachment=True, download_name="project.zip")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:asgi_app", host="0.0.0.0", port=8000, reload=True)
