import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { User, Shield, CheckCircle, Handshake, Calendar, MessageSquare, Activity } from 'lucide-react';
import { motion } from 'motion/react';

import AIAssistant from './AIAssistant';

interface ProfileData {
  profile: {
    userId: string;
    username: string;
    bio: string;
    totalVouches: number;
    totalDeals: number;
    trustLevel: string;
    joinDate: string;
  };
  vouches: any[];
}

export default function ProfileView() {
// ... existing state items ...
  const { userId } = useParams();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`/api/user/${userId}`);
        if (!res.ok) throw new Error('User not found');
        const json = await res.json();
        setData(json);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [userId]);

  if (loading) return (
    <div className="min-h-full flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-orange-500"></div>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-full flex flex-col items-center justify-center p-8 text-center py-20">
      <h1 className="text-6xl font-light tracking-tight text-white mb-4 italic">404</h1>
      <p className="text-zinc-500 uppercase tracking-[0.3em] font-bold text-xs">{error || 'Profile not found'}</p>
    </div>
  );

  const { profile, vouches } = data;

  return (
    <div className="p-8 lg:p-12">
      <div className="flex justify-between items-end mb-12">
        <div>
          <h1 className="text-4xl font-light tracking-tight">Profile <span className="font-bold">Preview</span></h1>
          <p className="text-zinc-500 mt-1 uppercase text-[10px] tracking-widest font-bold">Public view in channel #user-profiles</p>
        </div>
        <div className="hidden sm:flex gap-3">
          <button onClick={() => window.location.reload()} className="px-4 py-2 border border-white/20 rounded text-[10px] uppercase tracking-widest font-bold hover:bg-white hover:text-black transition-all">Refresh View</button>
          <button className="px-4 py-2 bg-orange-600 rounded text-[10px] uppercase tracking-widest font-bold text-black border border-orange-600 hover:bg-transparent hover:text-orange-500 transition-all">Export JSON</button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        {/* Discord Embed Simulation */}
        <div className="xl:col-span-8 flex flex-col gap-8">
          <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-[#0F0F0F] rounded-lg border-l-4 border-orange-500 shadow-2xl p-8 relative overflow-hidden"
          >
            {/* Background Decorative Element */}
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] pointer-events-none">
              <div className="w-64 h-64 bg-orange-500 rotate-45 transform translate-x-12 -translate-y-12"></div>
            </div>

            <div className="flex flex-col md:flex-row items-center md:items-start gap-8 mb-8 relative z-10">
              <div className="w-24 h-24 bg-zinc-800 rounded-full border-2 border-orange-500 flex items-center justify-center shrink-0 shadow-lg shadow-orange-500/10 overflow-hidden">
                 <div className="w-full h-full bg-gradient-to-tr from-zinc-700 to-zinc-900 flex items-center justify-center">
                    <User size={48} className="text-zinc-500" />
                 </div>
              </div>
              <div className="flex-1 text-center md:text-left">
                <div className="flex flex-col md:flex-row items-center gap-3 mb-2">
                  <h2 className="text-3xl font-bold tracking-tight">{profile.username}</h2>
                  <span className="bg-blue-600/20 text-blue-400 text-[9px] px-2 py-0.5 rounded border border-blue-500/30 font-bold uppercase tracking-wider">
                    Forge Partner
                  </span>
                </div>
                <p className="text-zinc-400 text-sm italic leading-relaxed max-w-xl">
                   "{profile.bio}"
                </p>
                <div className="mt-4 flex items-center justify-center md:justify-start gap-4 text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
                   <span className="flex items-center gap-1.5"><Calendar size={12} /> Joined {new Date(profile.joinDate).toLocaleDateString()}</span>
                   <span className="w-1 h-1 bg-zinc-800 rounded-full"></span>
                   <span className="text-orange-500/70">Verified Identity</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="border border-white/5 bg-white/[0.02] p-6 rounded-xl text-center hover:bg-white/[0.04] transition-colors group">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-[0.2em] mb-2">Total Deals</p>
                <p className="text-3xl font-mono text-orange-500 group-hover:scale-110 transition-transform">{profile.totalDeals}</p>
              </div>
              <div className="border border-white/5 bg-white/[0.02] p-6 rounded-xl text-center hover:bg-white/[0.04] transition-colors group">
                <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-[0.2em] mb-2">Vouches</p>
                <p className="text-3xl font-mono text-orange-500 group-hover:scale-110 transition-transform">{profile.totalVouches}</p>
              </div>
              <div className="border border-white/10 bg-orange-500/5 p-6 rounded-xl text-center">
                <p className="text-[10px] text-orange-500/80 uppercase font-bold tracking-[0.2em] mb-2">Trust Level</p>
                <p className="text-3xl font-mono text-white tracking-widest">{profile.trustLevel}</p>
              </div>
            </div>

            {/* Recent Vouch Snippet */}
            <div className="mb-10">
               <p className="text-[10px] text-zinc-600 uppercase font-black mb-4 border-b border-white/5 pb-2 tracking-[0.2em]">Latest Feedback</p>
               <div className="space-y-3">
                 {vouches.slice(0, 3).map((v, i) => (
                   <div key={i} className="flex gap-4 items-center text-sm bg-white/[0.02] border border-white/5 p-4 rounded-lg hover:border-orange-500/30 transition-colors">
                     <span className="font-bold text-orange-500 text-xs shrink-0 font-mono tracking-tighter">@{v.fromUserId.substring(0,6)}:</span>
                     <span className="text-zinc-300 italic text-xs leading-relaxed">"{v.message}"</span>
                   </div>
                 ))}
                 {vouches.length === 0 && (
                   <div className="text-zinc-600 text-xs italic p-4 bg-white/[0.01] border border-dashed border-white/10 rounded-lg text-center">
                     Waiting for initial feedback loop...
                   </div>
                 )}
               </div>
            </div>

            {/* Bot Interaction Buttons Simulation */}
            <div className="flex gap-2 flex-wrap pt-4 border-t border-white/5">
              <button disabled className="px-6 py-3 bg-[#4F545C] text-zinc-300 text-[10px] uppercase font-bold tracking-widest rounded transition-colors opacity-50 cursor-not-allowed">View My Profile</button>
              <button disabled className="px-6 py-3 bg-[#4F545C] text-zinc-300 text-[10px] uppercase font-bold tracking-widest rounded transition-colors opacity-50 cursor-not-allowed">View Vouches</button>
              <button className="px-6 py-3 bg-[#5865F2] hover:bg-[#4752C4] text-white text-[10px] uppercase font-bold tracking-widest rounded transition-colors shadow-lg shadow-blue-600/20">Share Profile</button>
              <button disabled className="px-6 py-3 border border-white/10 hover:bg-white/5 text-zinc-400 text-[10px] uppercase font-bold tracking-widest rounded transition-colors cursor-not-allowed">Edit Bio</button>
            </div>
          </motion.div>
        </div>

        {/* Sidebar: AI Assistant */}
        <div className="xl:col-span-4 flex flex-col gap-6">
          <div className="bg-[#0F0F0F] rounded-lg border border-white/10 p-6">
            <h3 className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
              <Activity size={14} className="text-orange-500" /> Security Analytics
            </h3>
            <div className="space-y-4">
               <div className="flex justify-between items-center bg-zinc-950 p-3 rounded border border-white/5">
                 <span className="text-[10px] text-zinc-400 uppercase tracking-tighter font-bold">Scam Risk</span>
                 <span className="text-xs font-mono text-green-500 font-bold tracking-widest uppercase">Negligible</span>
               </div>
               <div className="flex justify-between items-center bg-zinc-950 p-3 rounded border border-white/5">
                 <span className="text-[10px] text-zinc-400 uppercase tracking-tighter font-bold">Account Age</span>
                 <span className="text-xs font-mono text-white font-bold tracking-widest uppercase">Verified</span>
               </div>
            </div>
          </div>
          
          <AIAssistant />
          
          <div className="text-[10px] text-zinc-600 font-mono tracking-widest uppercase text-center mt-4">
             forge_id: {userId?.substring(0,16)}
          </div>
        </div>
      </div>
    </div>
  );
}


