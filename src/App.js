import React, { useState } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./App.css";

function App() {
  const [file, setFile] = useState(null);
  const [uploaded, setUploaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [chatLog, setChatLog] = useState([]);
  const [loading, setLoading] = useState(false);

  const uploadPdf = async () => {
    if (!file)  return alert("Select a PDF first");
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await axios.post("http://localhost:4000/upload", form);
      setUploaded(true);
    } catch (e) {
      alert("Upload failed");
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const sendQuestion = async () => {
    if (!question.trim()) return;
    setLoading(true);
    const q = question;
    setQuestion("");
    try {
      const { data } = await axios.post("http://localhost:4000/chat", {
        question: q,
      });
      setChatLog((log) => [
        ...log,
        { question: q, answer: data.answer, format: data.format },
      ]);
    } catch (e) {
      alert("Chat failed", e);
      console.error(e);
      setQuestion(q);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
      sendQuestion();
    }
  };

  // Format hint component to show users the available format options
  const FormatHint = () => (
    <div className="format-hint">
      <p>
        <strong>Format Tips:</strong> Try phrases like "in table format", "as
        JSON", "with bullet points", or "in plain text" with your questions.
      </p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <h1 className="app-title">Chatbot</h1>
        <p className="app-subtitle">
          Upload a PDF or Image and ask questions about its content
        </p>
      </header>

      {!uploaded ? (
        <div className="upload-section">
          <div className="file-input-wrapper">
            <label className="file-input-label">
              <span>Choose PDF or IMG File</span>
              <input
                type="file"
                accept="application/pdf,image/*"
                className="file-input"
                onChange={(e) => setFile(e.target.files[0])}
              />
            </label>
            {file && <div className="file-name">{file.name}</div>}
          </div>
          <button
            className="btn btn-primary"
            onClick={uploadPdf}
            disabled={!file || loading}
          >
            {loading ? "Processing..." : "Upload & Parse"}
          </button>
        </div>
      ) : (
        <div className="chat-section">
          <FormatHint />

          {/* <div className="chat-section">
          <div className="format-hint">
            <strong>Format Tips:</strong> “in table format”, “as JSON”, “with bullet points”
          </div> */}

          <div className="chat-input-container">
            <input
              className="chat-input"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask a question..."
              disabled={loading}
            />
            <button
              className="chat-send-btn"
              onClick={sendQuestion}
              disabled={!question.trim() || loading}
            >
              {loading ? "Thinking…" : "Send"}
            </button>
          </div>

          <div className="chat-log">
            {chatLog.length === 0 && (
              <div className="empty-state">
                Ask your first question about the document above.
              </div>
            )}

            {chatLog.map((entry, i) => (
              <div key={i} className="chat-message">
                <div className="message-user">
                  <span className="message-user-label">You:</span>
                  <div className="message-content">{entry.question}</div>
                </div>
                <div className="message-bot">
                  <span className="message-bot-label">Bot:</span>
                  <div className={`message-content format-${entry.format}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {entry.answer}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
