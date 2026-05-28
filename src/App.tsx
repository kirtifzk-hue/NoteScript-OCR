/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import * as pdfjs from 'pdfjs-dist';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { 
  FileText, 
  Upload, 
  Home, 
  Moon, 
  Sun, 
  CheckCircle2, 
  Copy,
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { performOCR } from './services/ocrService';
import { exportToWord, exportToPDF } from './services/exportService';
import { cn } from './lib/utils';

// PDF worker setup
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

type PageInfo = {
  index: number;
  thumbnail: string;
  selected: boolean;
};

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); // Default to dark for this theme
  const [view, setView] = useState<'home' | 'pdf-selection' | 'editor'>('home');
  const [files, setFiles] = useState<File[]>([]);
  const [pdfPages, setPdfPages] = useState<PageInfo[]>([]);
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [isCopied, setIsCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    if (selectedFiles.length === 0) return;

    setFiles(selectedFiles);
    
    if (selectedFiles[0].type === 'application/pdf') {
      await loadPdfPages(selectedFiles[0]);
      setView('pdf-selection');
    } else {
      processImages(selectedFiles);
    }
  };

  const loadPdfPages = async (file: File) => {
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      const pagePromises = Array.from({ length: pdf.numPages }, (_, i) => i + 1).map(async (i) => {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.2 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context!, viewport } as any).promise;
        return {
          index: i,
          thumbnail: canvas.toDataURL(),
          selected: true
        };
      });

      const pages = await Promise.all(pagePromises);
      setPdfPages(pages);
      setSelectedPages(pages.map(p => p.index));
    } catch (error) {
      console.error("PDF Load Error:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const processImages = async (imageFiles: File[]) => {
    setIsProcessing(true);
    setView('editor');
    setProcessProgress(0);

    try {
      const ocrPromises = imageFiles.map(async (file, index) => {
        const base64 = await fileToBase64(file);
        const result = await performOCR(base64, file.type, autoCorrect);
        setProcessProgress(prev => prev + (100 / imageFiles.length));
        return { index, result };
      });

      const results = await Promise.all(ocrPromises);
      const combinedText = results.sort((a, b) => a.index - b.index).map(r => r.result).join("\n\n");
      setTranscribedText(combinedText);
    } catch (error) {
      alert("Error processing images: " + error);
    } finally {
      setIsProcessing(false);
      setProcessProgress(100);
    }
  };

  const processSelectedPdfPages = async () => {
    setIsProcessing(true);
    setView('editor');
    setProcessProgress(0);

    try {
      const arrayBuffer = await files[0].arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
      
      const ocrPromises = selectedPages.map(async (pageNum, index) => {
        try {
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2.0 }); 
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          await page.render({ canvasContext: context!, viewport } as any).promise;
          const base64 = canvas.toDataURL('image/jpeg', 0.9);
          const result = await performOCR(base64, 'image/jpeg', autoCorrect);
          setProcessProgress(prev => prev + (100 / selectedPages.length));
          return { index, result };
        } catch (err) {
          console.error(`Error processing page ${pageNum}:`, err);
          return { index, result: `[Error processing page ${pageNum}]` };
        }
      });

      const results = await Promise.all(ocrPromises);
      const combinedText = results.sort((a, b) => a.index - b.index).map(r => r.result).join("\n\n");
      setTranscribedText(combinedText);
    } catch (error) {
      alert("Error processing PDF: " + error);
    } finally {
      setIsProcessing(false);
      setProcessProgress(100);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const togglePageSelection = (index: number) => {
    setSelectedPages(prev => 
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    );
  };

  const handleCopy = async () => {
    if (!transcribedText) return;
    try {
      // Create a polished plain text version for copying by removing markdown/latex symbols
      const polishedText = transcribedText
        .replace(/\$\$(.*?)\$\$/g, "$1")
        .replace(/\$(.*?)\$/g, "$1")
        .replace(/\\text\{(.*?)\}/g, "$1")
        .replace(/\*\*\*(.*?)\*\*\*/g, "$1")
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/^#+ /gm, "")
        .replace(/^[*-] /gm, "• ") // stylize list bullets
        .replace(/\|/g, " ") // remove table pipes
        .replace(/-{3,}/g, "") // remove table separator lines
        .replace(/\n{3,}/g, "\n\n") // normalize whitespace
        .trim();

      await navigator.clipboard.writeText(polishedText);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-sophis-bg text-sophis-text font-sans">
      {/* Header */}
      <header className="h-16 border-b border-sophis-border flex items-center justify-between px-8 bg-sophis-panel flex-shrink-0">
        <div className="flex items-center gap-6">
          <div className="bg-sophis-blue p-2 rounded-lg cursor-pointer" onClick={() => setView('home')}>
            <FileText className="w-5 h-5 text-white" />
          </div>
          <span className="font-serif text-xl italic tracking-tight cursor-pointer" onClick={() => setView('home')}>
            Scripto<span className="text-sophis-blue">OCR</span>
          </span>
          <nav className="hidden md:flex gap-8 ml-8 text-sm uppercase tracking-widest text-sophis-text-muted">
            <button 
              onClick={() => setView('editor')}
              className={cn("hover:text-white transition-colors pb-1", view === 'editor' && "text-white border-b border-white")}
            >
              Editor
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-sophis-bg p-1 rounded-full border border-sophis-border-light">
            <button 
              onClick={() => setTheme('dark')}
              className={cn("px-4 py-1 rounded-full text-xs font-semibold transition-all", theme === 'dark' ? "bg-sophis-border-light text-white" : "text-sophis-text-muted")}
            >
              Dark
            </button>
            <button 
              onClick={() => setTheme('light')}
              className={cn("px-4 py-1 rounded-full text-xs font-semibold transition-all", theme === 'light' ? "bg-white text-black" : "text-sophis-text-muted")}
            >
              Light
            </button>
          </div>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Rail */}
        <aside className="w-16 border-r border-sophis-border flex flex-col items-center py-6 gap-8 bg-sophis-panel flex-shrink-0">
          <button 
            onClick={() => setView('home')}
            className={cn("p-3 rounded-xl transition-all", view === 'home' ? "text-sophis-blue bg-sophis-blue/10" : "text-sophis-text-muted hover:text-white")} 
            title="Home"
          >
            <Home className="w-6 h-6" />
          </button>
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="text-sophis-text-muted hover:text-white transition-colors" 
            title="Upload"
          >
            <Upload className="w-6 h-6" />
          </button>
        </aside>

        {/* Content Area */}
        <main className="flex-1 flex flex-col relative overflow-hidden bg-sophis-bg">
          <AnimatePresence mode="wait">
            {view === 'home' && (
              <motion.section 
                key="home"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.02 }}
                className="flex-1 overflow-y-auto custom-scrollbar p-6 lg:p-12"
              >
                <div className="max-w-6xl mx-auto space-y-12 lg:space-y-20">
                  <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[500px]">
                    <div className="space-y-8">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sophis-blue/10 border border-sophis-blue/20 text-sophis-blue text-[10px] font-bold tracking-[0.2em] uppercase">
                        <CheckCircle2 className="w-3 h-3" />
                        Next-Gen Handwriting Analysis
                      </div>
                      <div className="space-y-6">
                        <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl italic leading-[1.1]">
                          Transcribe <span className="text-sophis-blue underline decoration-sophis-blue/30 underline-offset-8">Notes</span> with Precision
                        </h1>
                        <p className="text-lg text-sophis-text-muted font-medium max-w-lg leading-relaxed">
                          The professional choice for researchers and students. Industrial grade OCR for handwritten notes, equations, and archives.
                        </p>
                      </div>
                    </div>

                    <div className="w-full max-w-xl group relative lg:ml-auto"
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const droppedFiles = Array.from(e.dataTransfer.files) as File[];
                        setFiles(droppedFiles);
                        if (droppedFiles[0]?.type === 'application/pdf') {
                          loadPdfPages(droppedFiles[0]);
                          setView('pdf-selection');
                        } else {
                          processImages(droppedFiles);
                        }
                      }}
                    >
                      <div className="absolute -top-10 left-0 right-0 flex justify-center items-center gap-3">
                        <span className={cn("text-[10px] font-bold tracking-widest transition-colors", !autoCorrect ? "text-white" : "text-sophis-text-muted")}>VERBATIM</span>
                        <button 
                          onClick={() => setAutoCorrect(!autoCorrect)}
                          className="w-10 h-5 bg-sophis-surface border border-sophis-border-light rounded-full p-0.5 transition-all relative"
                        >
                          <div className={cn("w-3.5 h-3.5 rounded-full transition-all bg-sophis-blue shadow-lg shadow-blue-500/50", autoCorrect ? "translate-x-5" : "translate-x-0")} />
                        </button>
                        <span className={cn("text-[10px] font-bold tracking-widest transition-colors", autoCorrect ? "text-sophis-blue" : "text-sophis-text-muted")}>TEACHER CORRECTION</span>
                      </div>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        multiple 
                        accept="image/*,application/pdf"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <div 
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer bg-sophis-surface border-2 border-dashed border-sophis-border-light group-hover:border-sophis-blue rounded-[2.5rem] p-12 lg:p-16 flex flex-col items-center gap-6 transition-all duration-500 shadow-2xl shadow-blue-500/5 group-hover:scale-[1.01]"
                      >
                        <div className="w-20 h-20 bg-sophis-blue/10 rounded-2xl flex items-center justify-center">
                          <Upload className="w-10 h-10 text-sophis-blue" />
                        </div>
                        <div className="text-center space-y-2">
                          <h3 className="text-2xl font-bold tracking-tight">Drop your notes here</h3>
                          <p className="text-sophis-text-dim uppercase tracking-widest text-[10px] font-bold">Supports PDF, PNG, JPG</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full pb-12">
                     <FeatureCard 
                      title="Intelligent Editor"
                      desc="Fluid text editing with automatic formatting preservation."
                     />
                     <FeatureCard 
                      title="A4 Dimensions"
                      desc="Strict adherence to global print standards for every export."
                     />
                     <FeatureCard 
                      title="Secure Archive"
                      desc="Local-first processing ensures your notes stay private."
                     />
                  </div>
                </div>
              </motion.section>
            )}

            {view === 'pdf-selection' && (
              <motion.section 
                key="pdf-selection"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden"
              >
                {/* Left Panel: File Info */}
                <div className="w-[320px] border-r border-sophis-border bg-sophis-bg p-8 flex flex-col gap-8 flex-shrink-0">
                  <div>
                    <h2 className="text-[10px] uppercase tracking-[0.2em] text-sophis-text-muted mb-4 font-bold">Selected File</h2>
                    <div className="bg-sophis-surface border border-sophis-border-light rounded-xl p-5 flex items-center gap-4">
                      <div className="text-red-500 bg-red-500/10 p-2 rounded-lg">
                        <FileText className="w-8 h-8" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate">{files[0]?.name}</p>
                        <p className="text-[10px] text-sophis-text-dim mt-1 font-mono uppercase">
                          {(files[0]?.size / 1024 / 1024).toFixed(1)} MB • {pdfPages.length} Pages
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex justify-between items-center mb-1 text-[10px] font-bold tracking-widest">
                      <h2 className="uppercase tracking-[0.2em] text-sophis-text-muted">Selection</h2>
                      <div className="flex gap-4">
                        <button 
                          onClick={() => setSelectedPages([])}
                          className="text-red-400 hover:text-red-300 transition-colors"
                        >
                          DESELECT ALL
                        </button>
                        <button 
                          onClick={() => setSelectedPages(pdfPages.map(p => p.index))}
                          className="text-sophis-blue hover:text-blue-400 transition-colors"
                        >
                          SELECT ALL
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-center gap-3 mb-4 bg-sophis-surface/50 p-2 rounded-lg border border-sophis-border-light">
                      <span className={cn("text-[8px] font-bold tracking-widest transition-colors", !autoCorrect ? "text-white" : "text-sophis-text-muted")}>VERBATIM</span>
                      <button 
                        onClick={() => setAutoCorrect(!autoCorrect)}
                        className="w-8 h-4 bg-sophis-panel border border-sophis-border rounded-full p-0.5 transition-all relative"
                      >
                        <div className={cn("w-2.5 h-2.5 rounded-full transition-all bg-sophis-blue", autoCorrect ? "translate-x-4" : "translate-x-0")} />
                      </button>
                      <span className={cn("text-[8px] font-bold tracking-widest transition-colors", autoCorrect ? "text-sophis-blue" : "text-sophis-text-muted")}>CORRECTION</span>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar grid grid-cols-2 gap-4 auto-rows-max">
                      {pdfPages.map(page => (
                        <div 
                          key={page.index}
                          onClick={() => togglePageSelection(page.index)}
                          className={cn(
                            "relative aspect-[3/4] bg-sophis-surface rounded-lg p-2 cursor-pointer transition-all border-2",
                            selectedPages.includes(page.index) ? "border-sophis-blue " : "border-sophis-border-light"
                          )}
                        >
                          <div className={cn(
                            "w-4 h-4 rounded absolute top-2 left-2 flex items-center justify-center border transition-all",
                            selectedPages.includes(page.index) ? "bg-sophis-blue border-sophis-blue" : "border-sophis-border-light"
                          )}>
                            {selectedPages.includes(page.index) && <CheckCircle2 className="w-3 h-3 text-white" />}
                          </div>
                          <img src={page.thumbnail} alt={`Page ${page.index}`} className="w-full h-full object-cover rounded opacity-80" />
                          <div className="absolute bottom-2 left-0 right-0 text-[9px] font-bold text-center text-sophis-text-dim">
                            PAGE {String(page.index).padStart(2, '0')}
                          </div>
                        </div>
                      ))}
                    </div>

                    <button 
                      onClick={processSelectedPdfPages}
                      disabled={selectedPages.length === 0}
                      className="mt-8 w-full py-5 bg-sophis-blue text-white font-bold rounded-xl shadow-xl shadow-blue-500/20 uppercase tracking-widest text-xs disabled:opacity-30 transition-all hover:translate-y-[-2px]"
                    >
                      Run OCR on Selection
                    </button>
                  </div>
                </div>

                {/* Right Panel: Large Preview (Optional or empty space) */}
                <div className="flex-1 bg-sophis-panel flex items-center justify-center p-12">
                   <div className="text-center space-y-4">
                     <FileText className="w-20 h-20 text-sophis-border-light mx-auto" />
                     <p className="text-sophis-text-dim text-sm tracking-widest uppercase font-bold italic">Preview Mode</p>
                   </div>
                </div>
              </motion.section>
            )}

            {view === 'editor' && (
              <motion.section 
                key="editor"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex overflow-hidden"
              >
                {/* Left Panel: Actions */}
                <div className="w-[320px] border-r border-sophis-border bg-sophis-bg p-8 flex flex-col gap-10 flex-shrink-0">
                  <div className="space-y-6">
                    <div>
                      <h2 className="text-[10px] uppercase tracking-[0.2em] text-sophis-text-muted mb-4 font-bold">Document</h2>
                      <h1 className="font-serif text-3xl italic">Transcribed Text</h1>
                    </div>
                    
                    <div className="space-y-4">
                      <button 
                        onClick={() => exportToPDF(transcribedText)}
                        className="w-full py-4 bg-white text-black font-bold rounded-xl text-xs uppercase tracking-[0.2em] hover:bg-sophis-text transition-colors shadow-lg"
                      >
                        Export PDF
                      </button>
                      <button 
                        onClick={() => exportToWord(transcribedText)}
                        className="w-full py-4 bg-sophis-surface border border-sophis-border-light text-white font-bold rounded-xl text-xs uppercase tracking-[0.2em] hover:bg-sophis-border-light transition-colors"
                      >
                        Save as Word
                      </button>
                    </div>
                  </div>

                  <div className="bg-sophis-panel p-6 rounded-2xl border border-sophis-border space-y-4">
                    <p className="text-[10px] text-sophis-text-dim leading-relaxed uppercase tracking-tighter italic">
                      "Professional OCR utilizes neural networks to interpret script. Manual review is recommended for academic integrity."
                    </p>
                    <button 
                      onClick={() => setTranscribedText('')}
                      className="text-[10px] font-bold text-red-400 tracking-widest uppercase hover:text-red-300 transition-colors"
                    >
                      CLEAR BUFFER
                    </button>
                  </div>

                  <div className="mt-auto">
                    <div className="flex gap-4 text-sophis-text-dim text-[10px] uppercase font-bold tracking-widest border-t border-sophis-border pt-6">
                      <span>English • EN</span>
                      <span>Confidence 98%</span>
                    </div>
                  </div>
                </div>

                {/* Main Workspace: A4 Editor */}
                <div className="flex-1 bg-sophis-panel p-10 flex flex-col overflow-hidden items-center relative">
                  {isProcessing ? (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-sophis-panel/90 backdrop-blur-sm">
                      <div className="text-center space-y-8">
                        <div className="w-16 h-16 border-4 border-sophis-blue border-t-transparent rounded-full animate-spin mx-auto"></div>
                        <div className="space-y-2">
                          <h3 className="text-2xl font-serif italic">Synthesizing Notes</h3>
                          <p className="text-sophis-text-muted uppercase tracking-[0.3em] font-bold text-xs">{Math.round(processProgress)}% Completed</p>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <div className="w-full max-w-4xl h-full flex flex-col bg-sophis-bg rounded-2xl border border-sophis-border shadow-2xl relative overflow-hidden">
                    {/* Toolbar */}
                    <div className="h-12 border-b border-sophis-border bg-sophis-surface flex items-center px-6 gap-8 flex-shrink-0">
                      <div className="flex bg-sophis-bg p-1 rounded-lg border border-sophis-border-light">
                        <button 
                          onClick={() => setShowPreview(false)}
                          className={cn("px-3 py-1 rounded-md text-[10px] font-bold transition-all", !showPreview ? "bg-sophis-border-light text-white" : "text-sophis-text-muted hover:text-white")}
                        >
                          EDIT
                        </button>
                        <button 
                          onClick={() => setShowPreview(true)}
                          className={cn("px-3 py-1 rounded-md text-[10px] font-bold transition-all", showPreview ? "bg-sophis-border-light text-white" : "text-sophis-text-muted hover:text-white")}
                        >
                          PREVIEW
                        </button>
                      </div>
                      <div className="h-4 w-[1px] bg-sophis-border"></div>
                      <button 
                        onClick={handleCopy}
                        disabled={!transcribedText}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border",
                          isCopied 
                            ? "bg-green-500/20 border-green-500/50 text-green-400" 
                            : "bg-sophis-surface border-sophis-border hover:border-sophis-blue hover:text-white text-sophis-text-muted"
                        )}
                        title="Copy polished text"
                      >
                        {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {isCopied ? "COPIED!" : "COPY TEXT"}
                      </button>
                      <div className="h-4 w-[1px] bg-sophis-border"></div>
                      <span className="text-[10px] text-sophis-text-muted font-bold uppercase tracking-widest">A4 Layout • 11pt</span>
                      <div className="ml-auto flex items-center gap-2 text-[9px] text-sophis-text-dim font-mono uppercase">
                        <span className="w-2 h-2 rounded-full bg-green-500"></span> Live Synced
                      </div>
                    </div>

                    {/* Scrollable A4 Preview */}
                    <div className="flex-1 overflow-y-auto p-16 custom-scrollbar flex justify-center bg-sophis-panel">
                      <div className="w-[210mm] min-h-[297mm] bg-white text-[#1a1a1a] shadow-inner p-20 flex flex-col shadow-2xl">
                         {showPreview ? (
                           <div className="markdown-content prose prose-sm max-w-none">
                             <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                               {transcribedText || "_No text transcribed yet..._"}
                             </ReactMarkdown>
                           </div>
                         ) : (
                           <textarea 
                            value={transcribedText}
                            onChange={(e) => setTranscribedText(e.target.value)}
                            placeholder="Transcribed academic text will materialize here..."
                            className="w-full flex-1 resize-none outline-none font-sans text-[11.5pt] leading-[1.8] tracking-tight placeholder:text-gray-300"
                          />
                         )}
                        <div className="mt-12 pt-8 border-t border-gray-100 flex justify-between items-center text-[9px] text-gray-400 font-serif italic">
                           <span>NoteScript OCR Engine Generated Output</span>
                           <span>{new Date().toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.section>
            )}
          </AnimatePresence>
        </main>
      </div>

      {/* Footer Status Bar */}
      <footer className="h-8 bg-sophis-panel border-t border-sophis-border px-8 flex items-center justify-between text-[9px] text-sophis-text-dim font-mono flex-shrink-0">
        <div className="flex gap-8 uppercase tracking-widest">
          <span>Engine Status: <span className="text-green-500">Operational</span></span>
          <span className="hidden sm:inline">Neural Processing: <span className="text-white">Active</span></span>
        </div>
        <div>SCRIPTO SYSTEMS © 2026</div>
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc }: { title: string, desc: string }) {
  return (
    <div className="p-8 bg-sophis-surface border border-sophis-border rounded-[2rem] transition-all hover:bg-sophis-panel hover:border-sophis-blue group">
      <h3 className="text-xl font-bold mb-3 tracking-tight">{title}</h3>
      <p className="text-sm text-sophis-text-muted leading-relaxed group-hover:text-sophis-text transition-colors">{desc}</p>
    </div>
  );
}
