import os
import google.generativeai as genai
from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import speech_recognition as sr
from pydub import AudioSegment
import io

# Load environment variables
load_dotenv()

# Configure the Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
model = genai.GenerativeModel('gemini-pro')

app = Flask(__name__)
CORS(app)  # Enable Cross-Origin Resource Sharing

# In-memory store for violation counts (for simplicity)
violation_counts = {}

@app.route('/start-interview', methods=['POST'])
def start_interview():
    """
    Starts the interview by generating questions based on the domain.
    """
    data = request.get_json()
    domain = data.get('domain')
    if not domain:
        return jsonify({"error": "Domain is required"}), 400

    try:
        prompt = f"Generate 5 technical interview questions for the domain: {domain}. Return them as a JSON formatted list of strings."
        response = model.generate_content(prompt)
        # Clean up the response to be valid JSON
        questions_text = response.text.strip().replace("```json", "").replace("```", "")
        return jsonify({"questions": questions_text})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/submit-answer', methods=['POST'])
def submit_answer():
    """
    Receives audio, transcribes it, and evaluates the answer.
    """
    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    question = request.form.get('question')
    
    if not question:
        return jsonify({"error": "Question is required"}), 400

    try:
        # Convert webm to wav for speech recognition
        audio_data = io.BytesIO(audio_file.read())
        audio_segment = AudioSegment.from_file(audio_data)
        wav_data = io.BytesIO()
        audio_segment.export(wav_data, format="wav")
        wav_data.seek(0)

        # Transcribe audio to text
        r = sr.Recognizer()
        with sr.AudioFile(wav_data) as source:
            audio = r.record(source)
        
        transcribed_text = r.recognize_google(audio)

        # Evaluate the answer using Gemini
        prompt = f"""
        Evaluate the following answer for the given interview question.
        Provide a score from 1 to 10 and concise feedback (less than 50 words).

        Question: "{question}"
        Answer: "{transcribed_text}"
        
        Return the response as a JSON object with keys "score" and "feedback".
        """
        response = model.generate_content(prompt)
        evaluation_text = response.text.strip().replace("```json", "").replace("```", "")

        return jsonify({
            "transcribed_text": transcribed_text,
            "evaluation": evaluation_text
        })

    except sr.UnknownValueError:
        return jsonify({"error": "Could not understand the audio"}), 400
    except sr.RequestError as e:
        return jsonify({"error": f"Speech recognition service error: {e}"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/log-violation', methods=['POST'])
def log_violation():
    """
    Logs an anti-cheating violation (e.g., user changed tabs).
    """
    # For a real app, you'd use a user ID from a session
    user_id = "demo_user" 
    if user_id not in violation_counts:
        violation_counts[user_id] = 0
    violation_counts[user_id] += 1
    
    print(f"Violation logged for {user_id}. Total violations: {violation_counts[user_id]}")
    return jsonify({"status": "violation logged", "count": violation_counts[user_id]})


if __name__ == '__main__':
    app.run(debug=True, port=5001)