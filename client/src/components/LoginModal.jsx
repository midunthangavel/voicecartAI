import React, { useState } from 'react';
import { ShieldCheck, Lock, Mail, AlertCircle, KeyRound, Sparkles } from 'lucide-react';
import { login } from '../services/apiClient';

export default function LoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState('admin@annapoorna.com');
  const [password, setPassword] = useState('Annapoorna@123');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleQuickLogin = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email, password);
      setLoading(false);
      if (onLoginSuccess) onLoginSuccess(result.user);
      if (onClose) onClose();
    } catch (err) {
      setLoading(false);
      setError(err.message || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-100">
        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Staff Authentication</h2>
            <p className="text-xs text-slate-400">Secure role-based access for VoiceCart AI</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-950/40 border border-red-800/50 flex items-center space-x-2 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                placeholder="staff@restaurant.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800/80 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 transition"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold py-2.5 rounded-xl transition flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            {loading ? (
              <span className="text-xs">Authenticating...</span>
            ) : (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Sign In to Dashboard</span>
              </>
            )}
          </button>
        </form>

        {/* Demo Quick Logins */}
        <div className="mt-6 pt-4 border-t border-slate-800">
          <div className="flex items-center space-x-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
            <Sparkles className="w-3 h-3 text-amber-400" />
            <span>Demo Quick Roles</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin@annapoorna.com', 'Annapoorna@123')}
              className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-center transition"
            >
              <div className="font-semibold text-emerald-400">Admin</div>
              <div className="text-[10px] text-slate-400">Full Access</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('kitchen@annapoorna.com', 'Kitchen@123')}
              className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-center transition"
            >
              <div className="font-semibold text-amber-400">Kitchen</div>
              <div className="text-[10px] text-slate-400">KDS Only</div>
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('staff@annapoorna.com', 'Staff@123')}
              className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-200 text-center transition"
            >
              <div className="font-semibold text-blue-400">Staff</div>
              <div className="text-[10px] text-slate-400">Orders & Calls</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
