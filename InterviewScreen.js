import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useReactMediaRecorder } from 'react-media-recorder';

const API_BASE_URL = 'http://127.0.0.1:5001';

const InterviewScreen = () => {
    const [domain, setDomain] = useState('');
    const [questions, setQuestions] = useState([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [interviewStarted, setInterviewStarted] = useState(false);
    const [violationCount, setViolationCount] = useState(0);

    // Anti-cheating visibility change listener
    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.hidden && interviewStarted) {
                alert("You have navigated away from the interview. This is a violation.");
                axios.post(`${API_BASE_URL}/log-violation`)
                    .then(response => setViolationCount(response.data.count));
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [interviewStarted]);

    const { status, startRecording, stopRecording, mediaBlobUrl } =
        useReactMediaRecorder({ audio: true, blobPropertyBag: { type: 'audio/webm' } });

    const handleStartInterview = async () => {
        if (!domain) {
            alert('Please enter a domain.');
            return;
        }
        setIsLoading(true);
        try {
            const response = await axios.post(`${API_BASE_URL}/start-interview`, { domain });
            const parsedQuestions = JSON.parse(response.data.questions);
            setQuestions(parsedQuestions);
            setInterviewStarted(true);
            setCurrentQuestionIndex(0);
            setResults([]);
        } catch (error) {
            console.error('Error starting interview:', error);
            alert('Failed to start the interview. Please check the backend server.');
        }
        setIsLoading(false);
    };

    const speakQuestion = (text) => {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text);
        synth.speak(utterance);
    };

    useEffect(() => {
        if (interviewStarted && questions.length > 0) {
            speakQuestion(questions[currentQuestionIndex]);
        }
    }, [currentQuestionIndex, questions, interviewStarted]);

    const handleStopRecording = async () => {
        stopRecording();
    };
    
    useEffect(() => {
        if (mediaBlobUrl) {
            handleSubmitAnswer();
        }
    }, [mediaBlobUrl]);


    const handleSubmitAnswer = async () => {
        setIsLoading(true);
        const audioBlob = await fetch(mediaBlobUrl).then(res => res.blob());
        const formData = new FormData();
        formData.append('audio', audioBlob, 'answer.webm');
        formData.append('question', questions[currentQuestionIndex]);

        try {
            const response = await axios.post(`${API_BASE_URL}/submit-answer`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            const evaluationData = JSON.parse(response.data.evaluation);
            const newResult = {
                question: questions[currentQuestionIndex],
                answer: response.data.transcribed_text,
                ...evaluationData,
            };
            setResults(prev => [...prev, newResult]);
            
            // Move to the next question
            if (currentQuestionIndex < questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
            } else {
                setInterviewStarted(false); // End of interview
                alert('Interview completed!');
            }
        } catch (error) {
            console.error('Error submitting answer:', error);
            alert('Failed to process your answer.');
        }
        setIsLoading(false);
    };

    const currentQuestion = questions[currentQuestionIndex];

    return (
        <div className="interview-container">
            {!interviewStarted && results.length === 0 && (
                <div className="input-group">
                    <input
                        type="text"
                        value={domain}
                        onChange={(e) => setDomain(e.target.value)}
                        placeholder="Enter your interview domain (e.g., Frontend Development)"
                    />
                    <button onClick={handleStartInterview} disabled={isLoading}>
                        {isLoading ? 'Starting...' : 'Start Interview'}
                    </button>
                </div>
            )}

            {isLoading && <div className="loader"></div>}

            {interviewStarted && !isLoading && (
                <div className="question-card">
                    <h3>Question {currentQuestionIndex + 1}/{questions.length}</h3>
                    <p>{currentQuestion}</p>
                    <div className="controls">
                        <p className="status-text">Status: {status}</p>
                        <button onClick={startRecording} disabled={status === 'recording'}>Start Recording</button>
                        <button onClick={handleStopRecording} disabled={status !== 'recording'}>Stop Recording</button>
                    </div>
                </div>
            )}
            
            {violationCount > 0 && <p className="status-text">Violations Detected: {violationCount}</p>}

            {results.length > 0 && (
                <div className="results-container">
                    <h2>Interview Results</h2>
                    {results.map((res, index) => (
                        <div key={index} className="feedback-card">
                            <h4>Question: {res.question}</h4>
                            <p><strong>Your Answer:</strong> {res.answer}</p>
                            <p><strong>Feedback:</strong> {res.feedback}</p>
                            <p><strong>Score:</strong> {res.score}/10</p>
                        </div>
                    ))}
                     {!interviewStarted && (
                        <button onClick={() => { setResults([]); setDomain(''); setQuestions([]); }}>
                            Start New Interview
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default InterviewScreen;