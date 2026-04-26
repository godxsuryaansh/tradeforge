import { useState } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Bot, Send, User, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export default function AIAssistant() {
  const [messages, setMessages] = useState<{ role: 'user' | 'bot', text: string }[]>([
    { role: 'bot', text: 'Welcome to the TradeForge Assistant. How can I help you with your trades today?' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userMsg,
        config: {
          systemInstruction: "You are the TradeForge AI Assistant. You help users with Discord trading, evaluating item values, spotting potential scams, and explaining the TradeForge ecosystem (Vouches, Escrow, Trust Levels: LOW, MEDIUM, HIGH). Keep responses concise and use a professional, slightly technical tone.",
        }
      });

      const botText = response.text || "I'm sorry, I couldn't process that.";
      setMessages(prev => [...prev, { role: 'bot', text: botText }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'bot', text: 'An error occurred. Please check your AI configuration.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0F0F0F] rounded-lg border border-white/10 flex flex-col h-[500px] shadow-2xl overflow-hidden">
      <div className="p-4 bg-white/5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bot size={16} className="text-orange-500" />
          <span className="font-bold text-[10px] tracking-[0.2em] uppercase text-zinc-400">Forge AI Analysis</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></div>
          <span className="text-[10px] font-mono text-zinc-600 uppercase">Active</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-zinc-950/20">
        <AnimatePresence>
          {messages.map((m, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, x: m.role === 'user' ? 10 : -10 }}
              animate={{ opacity: 1, x: 0 }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] p-4 rounded-xl text-xs leading-relaxed ${
                m.role === 'user' 
                  ? 'bg-orange-600/10 text-orange-400 border border-orange-500/20 font-medium' 
                  : 'bg-white/[0.03] text-zinc-300 border border-white/5'
              }`}>
                {m.text}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white/[0.03] p-4 rounded-xl border border-white/5 flex gap-1.5 items-center">
              <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce [animation-delay:0s]"></div>
              <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1 h-1 bg-orange-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 border-t border-white/5 bg-zinc-950">
        <div className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="SYSTEM_QUERY_INPUT..."
            className="w-full bg-black border border-white/10 rounded-lg py-3 pl-4 pr-12 text-[11px] font-mono uppercase tracking-tight focus:outline-none focus:border-orange-500/50 transition-colors text-white placeholder:text-zinc-700"
          />
          <button 
            onClick={handleSend}
            disabled={loading}
            className="absolute right-2 top-2 p-1.5 text-orange-500 hover:bg-orange-500/10 rounded transition-colors disabled:opacity-30"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

