import React, { useState, useEffect, useRef } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const chatContainerRef = useRef(null);

  useEffect(() => {
    // Scroll to bottom of chat when new messages are added
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatLog]);

  const uploadPdf = async () => {
    if (!file) return alert("Select a PDF or image first");
    setLoading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await axios.post("http://localhost:4000/upload", form);
      setUploaded(true);
      setSidebarOpen(false); // Close sidebar after successful upload
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
      alert("Chat failed");
      console.error(e);
      setQuestion(q);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendQuestion();
    }
  };

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const getFormatClass = (format) => {
    // Apply the table format class for both normal and checklist tables
    if (format === "table" || format === "checklist-table") return "format-table";
    // Apply the JSON format for both normal and checklist JSON
    if (format === "json" || format === "checklist-json") return "format-json";
    return `format-${format}`;
  };

  // Custom renderer to ensure tables are rendered with proper styles
  const CustomMarkdownComponents = {
    table: ({ node, ...props }) => (
      <table className="styled-table" {...props} />
    ),
    thead: ({ node, ...props }) => (
      <thead className="styled-thead" {...props} />
    ),
    tr: ({ node, ...props }) => (
      <tr className="styled-tr" {...props} />
    ),
    th: ({ node, ...props }) => (
      <th className="styled-th" {...props} />
    ),
    td: ({ node, ...props }) => (
      <td className="styled-td" {...props} />
    )
  };

  // Format hint component to show users the available format options
  const FormatHint = () => (
    <div className="format-hint">
      <p>
        <strong>Format Tips:</strong> Try phrases like "in table format", "as JSON", 
        "with bullet points", "as a checklist" or "in plain text" with your questions.
      </p>
    </div>
  );

  return (
    <div className={`app-container ${sidebarOpen ? "sidebar-visible" : ""}`}>
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-content">
          <div className="sidebar-header">
            <h2 className="sidebar-title">Upload Document</h2>
            {/* <button className="sidebar-close" onClick={() => setSidebarOpen(false)}>✕</button> */}
          </div>
          <div className="upload-section">
            <div className="file-input-wrapper">
              <label className="file-input-label">
                <span>Choose PDF or Image</span>
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
              className="btn btn-primary upload-btn"
              onClick={uploadPdf}
              disabled={!file || loading}
            >
              {loading ? "Processing..." : "Upload & Process"}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <header className="app-header">
          <div className="header-left">
            <button className="sidebar-toggle" onClick={toggleSidebar}>
              {sidebarOpen ? "✕" : "☰"}
            </button>
            <h1 className="app-title">AI Chatbot</h1>
          </div>
          <div className="header-right">
            {uploaded && <span className="document-status">Document Ready</span>}
          </div>
        </header>

        {/* Main Area */}
        <div className="content-area">
          {!uploaded ? (
            <div className="welcome-screen">
              <div className="welcome-icon">📄</div>
              <h2>Welcome to Document AI Assistant</h2>
              <p>Upload a PDF or image using the sidebar to start chatting about its contents.</p>
              <button className="btn btn-primary" onClick={toggleSidebar}>
                Upload Document
              </button>
            </div>
          ) : (
            <div className="chat-section">
              <FormatHint />
              <div className="chat-log" ref={chatContainerRef}>
                {chatLog.length === 0 && (
                  <div className="empty-state">
                    <p>Your document is ready. What would you like to know about it?</p>
                  </div>
                )}

                {chatLog.map((entry, i) => (
                  <div key={i} className="chat-messages">
                    <div className="message user-message">
                      <div className="message-content">{entry.question}</div>
                    </div>
                    <div className="message bot-message">
                      <div className={`message-content ${getFormatClass(entry.format)}`}>
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm]}
                          components={CustomMarkdownComponents}
                        >
                          {entry.answer}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="chat-messages">
                    <div className="message bot-message">
                      <div className="message-content loading">
                        <div className="typing-indicator">
                          <span></span>
                          <span></span>
                          <span></span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="chat-input-container">
                <textarea
                  className="chat-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Ask a question about your document..."
                  disabled={loading}
                  rows="1"
                ></textarea>
                <button
                  className="chat-send-btn"
                  onClick={sendQuestion}
                  disabled={!question.trim() || loading}
                >
                  <svg viewBox="0 0 24 24" width="24" height="24" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="22" y1="2" x2="11" y2="13"></line>
                    <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;