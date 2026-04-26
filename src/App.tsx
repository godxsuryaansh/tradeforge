import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import ProfileView from './components/ProfileView';
import { Sword, LayoutDashboard, Shield, Bot, Layout as LayoutIcon, MessageSquare, List, Activity } from 'lucide-react';

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans flex flex-col">
      {/* Header Navigation */}
      <header className="h-16 border-b border-white/10 bg-[#0A0A0A] flex items-center justify-between px-8 z-20 shrink-0">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <div className="w-8 h-8 bg-orange-600 rounded flex items-center justify-center font-bold text-black italic text-xl">TF</div>
          <span className="text-xl font-bold tracking-tight uppercase italic text-orange-500">TradeForge <span className="text-white">Bot</span></span>
        </Link>
        <div className="hidden md:flex gap-6 items-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400">
          <Link to="/" className="text-orange-500 hover:text-orange-400">Dashboard</Link>
          <span className="cursor-not-allowed opacity-50">Escrow</span>
          <span className="cursor-not-allowed opacity-50">Moderation</span>
          <span className="cursor-not-allowed opacity-50">Logging</span>
          <div className="h-4 w-[1px] bg-white/20"></div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <span className="text-[10px] text-zinc-500">24ms</span>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Commands Panel */}
        <aside className="hidden lg:flex w-64 bg-[#0A0A0A] border-r border-white/10 p-6 flex-col gap-6 shrink-0">
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 font-bold">Management</p>
            <ul className="space-y-2">
              <li className="flex items-center gap-3 p-2 bg-white/5 border border-white/10 rounded cursor-pointer group">
                <div className="w-1 h-4 bg-orange-500 group-hover:h-5 transition-all"></div>
                <span className="text-xs font-mono text-zinc-300">/setup-profile-panel</span>
              </li>
              <li className="flex items-center gap-3 p-2 text-zinc-500 hover:text-white cursor-pointer group transition-colors">
                <div className="w-1 h-4 bg-transparent group-hover:bg-orange-500/50 group-hover:h-5 transition-all"></div>
                <span className="text-xs font-mono">/setlogchannel</span>
              </li>
              <li className="flex items-center gap-3 p-2 text-zinc-500 hover:text-white cursor-pointer group transition-colors">
                <div className="w-1 h-4 bg-transparent group-hover:bg-orange-500/50 group-hover:h-5 transition-all"></div>
                <span className="text-xs font-mono">/anti-raid toggle</span>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-3 font-bold">System Status</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-zinc-900/50 border border-white/5 p-3 rounded hover:bg-zinc-900 transition-colors">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">Servers</p>
                <p className="text-lg font-bold font-mono">1,248</p>
              </div>
              <div className="bg-zinc-900/50 border border-white/5 p-3 rounded hover:bg-zinc-900 transition-colors">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-tighter">Uptime</p>
                <p className="text-lg font-bold font-mono">99.9%</p>
              </div>
            </div>
          </div>
          <div className="mt-auto">
            <div className="bg-orange-600/10 border border-orange-500/20 p-4 rounded-xl">
              <p className="text-[10px] text-orange-500 font-bold uppercase tracking-widest mb-1">Node v20.x</p>
              <p className="text-[9px] text-zinc-500 font-mono tracking-tighter uppercase">Discord.js v14.12.0</p>
            </div>
          </div>
        </aside>

        {/* Main Content Viewport */}
        <main className="flex-1 bg-gradient-to-br from-[#0A0A0A] to-[#050505] relative overflow-y-auto overflow-x-hidden">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-orange-600/5 rounded-full blur-[120px] pointer-events-none -z-10 animate-pulse"></div>
          {children}
        </main>
      </div>
    </div>
  );
}

function Home() {
  return (
    <div className="p-8 lg:p-12 min-h-full flex flex-col items-center justify-center">
      <div className="max-w-3xl w-full text-center space-y-12">
        <div className="relative inline-block">
          <div className="mx-auto w-24 h-24 bg-orange-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-orange-600/30 relative z-10 italic">
            <Sword size={48} className="text-black" />
          </div>
          <div className="absolute inset-0 bg-orange-600/20 blur-3xl -z-10 rounded-full scale-150"></div>
        </div>
        
        <div>
          <h1 className="text-6xl md:text-7xl font-light tracking-tighter mb-4 uppercase">
            TRADE<span className="font-bold text-orange-500 italic">FORGE</span>
          </h1>
          <p className="text-lg text-zinc-400 font-medium max-w-xl mx-auto leading-relaxed uppercase tracking-wide">
            The next generation <span className="text-white">Discord ecosystem</span>. Professional-grade escrow, unified trust metrics, and global reputation.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-12">
          <div className="p-6 bg-white/[0.02] rounded-xl border border-white/5 text-left hover:bg-white/[0.04] transition-colors group">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center mb-4 border border-white/5">
              <LayoutDashboard size={20} className="text-orange-500" />
            </div>
            <h3 className="font-bold text-xs uppercase tracking-widest mb-2 text-white">Advanced Profiles</h3>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-medium uppercase tracking-tight">Public reputation boards with real-time vouch tracking.</p>
          </div>
          <div className="p-6 bg-white/[0.02] rounded-xl border border-white/5 text-left hover:bg-white/[0.04] transition-colors group text-orange-500/80">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center mb-4 border border-white/5 text-orange-500">
              <Shield size={20} />
            </div>
            <h3 className="font-bold text-xs uppercase tracking-widest mb-2 text-white">Military Security</h3>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-medium uppercase tracking-tight">Built-in escrow and scam link detection logic.</p>
          </div>
          <div className="p-6 bg-white/[0.02] rounded-xl border border-white/5 text-left hover:bg-white/[0.04] transition-colors group">
            <div className="w-10 h-10 rounded-lg bg-zinc-900 flex items-center justify-center mb-4 border border-white/5">
              <Bot size={20} className="text-orange-500" />
            </div>
            <h3 className="font-bold text-xs uppercase tracking-widest mb-2 text-white">Forge AI</h3>
            <p className="text-[11px] text-zinc-500 leading-relaxed font-medium uppercase tracking-tight">AI assistant to help you verify deals and calculate value.</p>
          </div>
        </div>

        <div className="pt-12 flex flex-col items-center gap-4">
           <div className="h-[1px] w-24 bg-white/10"></div>
           <div className="flex items-center gap-8 text-[11px] text-zinc-600 font-mono tracking-widest uppercase">
             <span>Auto-Mod: Active</span>
             <span>Escrow Pool: $12k+</span>
             <span>Uptime: 99.9%</span>
           </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/user/:userId" element={<ProfileView />} />
        </Routes>
      </Layout>
    </Router>
  );
}

