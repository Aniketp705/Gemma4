import os
import json
import random
import time
import platform
import urllib.request
import urllib.error
from flask import Flask, jsonify, request, render_template

app = Flask(__name__, template_folder='templates', static_folder='static')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/stats', methods=['GET'])
def get_stats():
    # Check if llama-server is online
    llama_status = "offline"
    try:
        req = urllib.request.Request("http://127.0.0.1:8080/v1/models", method="GET")
        with urllib.request.urlopen(req, timeout=0.5) as conn:
            if conn.status == 200:
                llama_status = "online"
    except Exception:
        pass

    # Simplified platform info for header/settings only
    sys_info = {
        "os": platform.system(),
        "os_release": platform.release(),
        "architecture": platform.machine(),
        "python_version": platform.python_version(),
        "uptime": round(time.time() - start_time, 1),
        "cpu_cores": os.cpu_count() or 4,
        "llama_status": llama_status
    }

    return jsonify({
        "system": sys_info,
        "timestamp": time.time()
    })


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json() or {}
    messages = data.get('messages', [])
    if not messages:
        return jsonify({"error": "No messages provided"}), 400
    
    # Forward to llama-server OpenAI endpoint
    url = "http://127.0.0.1:8080/v1/chat/completions"
    payload = {
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 1024
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            res_data = response.read().decode('utf-8')
            return jsonify(json.loads(res_data))
    except urllib.error.URLError as e:
        return jsonify({
            "error": "Could not connect to llama-server. Please verify that llama-server is running on port 8080.",
            "details": str(e)
        }), 503
    except Exception as e:
        return jsonify({
            "error": "An error occurred during communication with llama-server.",
            "details": str(e)
        }), 500

if __name__ == '__main__':
    start_time = time.time()
    # Host 0.0.0.0 is useful for dev environments
    app.run(host='0.0.0.0', port=5000, debug=True)
else:
    start_time = time.time()

