import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { atomDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

function App() {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [architectText, setArchitectText] = useState('');
  const [developerText, setDeveloperText] = useState('');
  const [zipUrl, setZipUrl] = useState(null);
  const [zipError, setZipError] = useState(null);
  const [error, setError] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [currentAgent, setCurrentAgent] = useState(null);
  const [projectFiles, setProjectFiles] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [prompt]);

  // Extract project files from developer text in real-time using <FILE> tags
  useEffect(() => {
    if (!developerText) return;
    
    const files = {};
    const regex = /<FILE path="([^"]+)">([\s\S]*?)(?:<\/FILE>|$)/g;
    let match;
    let foundAny = false;
    
    while ((match = regex.exec(developerText)) !== null) {
      const path = match[1];
      const content = match[2];
      files[path] = content;
      foundAny = true;
    }
    
    if (foundAny) {
      setProjectFiles(files);
      if (!selectedFile && Object.keys(files).length > 0) {
        setSelectedFile(Object.keys(files)[0]);
      }
    }
  }, [developerText]);

  const generateZip = async (files) => {
    if (!files || Object.keys(files).length === 0) {
      setZipError('No files found to generate ZIP.');
      return;
    }
    
    try {
      setZipError(null);
      const response = await fetch('http://localhost:8000/generate-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: files }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ZIP generation failed');
      }
      
      const data = await response.json();
      if (data.zip_url) setZipUrl(data.zip_url);
      else setZipError(data.error || 'ZIP generation failed');
    } catch (err) {
      console.error("ZIP Error:", err);
      setZipError(err.message || 'Server connection error during ZIP generation');
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!prompt.trim() && selectedFiles.length === 0) return;

    setLoading(true);
    setArchitectText(''); setDeveloperText(''); setZipUrl(null); 
    setError(null); setZipError(null); setProjectFiles({}); setSelectedFile(null);
    setCurrentAgent(null);

    const formData = new FormData();
    formData.append('prompt', prompt);
    selectedFiles.forEach(file => formData.append('files', file));

    try {
      const response = await fetch('http://localhost:8000/collaborate', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Backend server error');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let activeAgent = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        
        // Simple and robust marker detection
        if (chunk.includes('AGENT_START: ARCHITECT')) {
          activeAgent = 'ARCHITECT';
          setCurrentAgent('ARCHITECT');
          continue;
        }
        if (chunk.includes('AGENT_END: ARCHITECT')) {
          activeAgent = null;
          continue;
        }
        if (chunk.includes('AGENT_START: DEVELOPER')) {
          activeAgent = 'DEVELOPER';
          setCurrentAgent('DEVELOPER');
          continue;
        }
        if (chunk.includes('AGENT_END: DEVELOPER')) {
          activeAgent = null;
          continue;
        }

        if (activeAgent === 'ARCHITECT') {
          setArchitectText(prev => prev + chunk);
        } else if (activeAgent === 'DEVELOPER') {
          setDeveloperText(prev => prev + chunk);
        }
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
      setCurrentAgent(null);
    }
  };

  // Trigger ZIP generation when loading is finished and files are present
  useEffect(() => {
    if (!loading && Object.keys(projectFiles).length > 0 && !zipUrl && !zipError) {
      generateZip(projectFiles);
    }
  }, [loading, projectFiles, zipUrl, zipError]);

  const MarkdownComponent = ({ content }) => {
    if (!content) return null;
    
    // Clean up: Remove <PROJECT_JSON> and all <FILE> tags with their content from the discussion view
    let visibleContent = content.split('<PROJECT_JSON>')[0];
    visibleContent = visibleContent.replace(/<FILE path="[^"]+">[\s\S]*?(?:<\/FILE>|$)/g, '').trim();
    
    if (!visibleContent) return null;

    return (
      <div className="markdown-content">
        <ReactMarkdown
          children={visibleContent}
          components={{
            code({ node, inline, className, children, ...props }) {
              const match = /language-(\w+)/.exec(className || '');
              return !inline && match ? (
                <div className="code-block-wrapper">
                  <div className="code-header">{match[1].toUpperCase()}</div>
                  <SyntaxHighlighter
                    children={String(children).replace(/\n$/, '')}
                    style={atomDark} language={match[1]} PreTag="div" {...props}
                    customStyle={{ borderRadius: '0 0 12px 12px', margin: '0', fontSize: '0.85rem', background: '#0d1117' }}
                  />
                </div>
              ) : (
                <code className={className} {...props}>{children}</code>
              );
            }
          }}
        />
      </div>
    );
  };

  return (
    <div className="chat-container">
      <header style={{ textAlign: 'center', margin: '40px 0' }}>
        <h1 className="gradient-text" style={{ fontSize: '3rem' }}>AI Team Coder</h1>
        <p style={{ color: '#94a3b8' }}>Professional Software Architecture & Generation</p>
      </header>

      <div 
        className={`glass card ${isDragging ? 'dragging' : ''}`} 
        style={{ padding: '20px', marginBottom: '30px' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <textarea
          ref={textareaRef} value={prompt} onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); } }}
          placeholder="Describe your project here..."
          disabled={loading}
          style={{ width: '100%', background: 'transparent', border: 'none', color: 'white', fontSize: '1.2rem', outline: 'none', resize: 'none' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', alignItems: 'center' }}>
          <div className="file-upload-wrapper">
            <input 
              type="file" 
              id="file-upload" 
              multiple 
              onChange={e => setSelectedFiles(Array.from(e.target.files))} 
              className="custom-file-input"
            />
            <label htmlFor="file-upload" className="custom-file-label">
              <span>📎 Attach Files</span>
            </label>
            {selectedFiles.length > 0 && (
              <span className="file-info">
                <span className="file-tag">{selectedFiles.length}</span> files selected
              </span>
            )}
          </div>
          <button onClick={handleSubmit} className="btn-primary" disabled={loading}>
            {loading ? 'Processing Project...' : 'Generate Project'}
          </button>
        </div>
      </div>

      {error && <div className="glass" style={{ padding: '15px', color: '#f87171', border: '1px solid #ef4444', marginBottom: '20px' }}>{error}</div>}

      {(architectText || developerText) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', paddingBottom: '100px' }}>
          
          <div className="glass card" style={{ padding: '30px', textAlign: 'center', border: zipUrl ? '2px solid #10b981' : (zipError ? '1px solid #ef4444' : '1px solid rgba(255,255,255,0.1)') }}>
            {zipUrl ? (
              <a href={zipUrl} className="btn-primary" style={{ textDecoration: 'none', padding: '15px 50px', fontSize: '1.2rem', background: '#10b981' }}>📥 DOWNLOAD PROJECT ZIP</a>
            ) : zipError ? (
              <div style={{ color: '#ef4444' }}>
                <h3>ZIP Generation Issues</h3>
                <p>{zipError}</p>
                <button onClick={() => generateZip(developerText)} className="btn-primary" style={{ background: '#4b5563' }}>Retry ZIP Creation</button>
              </div>
            ) : (
              <h3 style={{ color: '#94a3b8' }}>{loading ? '⏳ AI is generating your project...' : 'Finalizing Zip...'}</h3>
            )}
          </div>

          {Object.keys(projectFiles).length > 0 && (
            <div className="file-explorer" style={{ border: '1px solid rgba(255,255,255,0.1)', height: '500px' }}>
              <div className="file-list">
                <h4 style={{ color: '#565f89', padding: '10px' }}>FILES</h4>
                {Object.keys(projectFiles).map(fileName => (
                  <button key={fileName} onClick={() => setSelectedFile(fileName)} className={`file-item ${selectedFile === fileName ? 'active' : ''}`}>{fileName}</button>
                ))}
              </div>
              <div className="code-viewer">
                <SyntaxHighlighter children={projectFiles[selectedFile] || ''} style={atomDark} language={selectedFile?.split('.').pop() || 'text'} customStyle={{ margin: 0, background: 'transparent', padding: '20px' }} />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {architectText && (
              <div className="glass card" style={{ padding: '30px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}><span className="agent-badge badge-architect">Architect</span></div>
                <MarkdownComponent content={architectText} />
              </div>
            )}
            {developerText && (
              <div className="glass card" style={{ padding: '30px' }}>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}><span className="agent-badge badge-developer">Developer</span></div>
                <MarkdownComponent content={developerText} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
