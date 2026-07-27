import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { toast } from '@/components/ui/Toast';
import api from '@/lib/api';
import { ShieldCheck, Box, TrendingUp, ArrowRight, Lock, User } from 'lucide-react';

const loginSchema = z.object({
  email: z.string().min(1, 'Email or Username is required'),
  password: z.string().min(1, 'Password is required'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', {
        email: data.email.trim(),
        password: data.password,
      });
      
      const { token, user } = res.data;
      login(
        {
          id: user.id,
          name: user.full_name || user.email,
          full_name: user.full_name,
          email: user.email,
          role: user.role,
        },
        token
      );
      
      toast.success('Welcome back to NexWare Enterprise');
      navigate('/dashboard');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500/30">
      {/* Left Panel - Premium Brand Showcase */}
      <div className="hidden lg:flex w-7/12 relative overflow-hidden bg-gradient-to-br from-[#001712] via-[#002e22] to-[#011425] flex-col justify-between p-14 border-r border-emerald-500/10">
        {/* Ambient Glowing Orbs */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-emerald-500/20 rounded-full blur-[120px] pointer-events-none animate-pulse duration-700" />
        <div className="absolute bottom-1/3 right-1/4 w-[350px] h-[350px] bg-teal-400/15 rounded-full blur-[100px] pointer-events-none" />

        <div />

        {/* Center Content */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="relative z-10 my-auto space-y-8 max-w-xl"
        >
          <div className="flex items-center gap-4">
            <div className="flex-shrink-0">
              <svg width="52" height="52" viewBox="0 0 40 40" fill="none" className="drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]">
                <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="#064e3b"/>
                <path d="M14 12L20 24L26 12M14 28V12M26 12V28" stroke="#80bea6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
                NexWare
              </h1>
              <p className="text-emerald-400/90 font-medium text-sm mt-1">Next-Gen Supply & Market Intelligence</p>
            </div>
          </div>

          <p className="text-lg leading-relaxed text-slate-300 font-normal">
            Orchestrate warehouse picking efficiency, real-time commodity pricing, and automated inventory sync with AI-powered predictive precision.
          </p>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/15 backdrop-blur-sm hover:border-emerald-400/30 transition-all duration-300 shadow-sm">
              <Box className="w-6 h-6 text-emerald-400 mb-2" />
              <h3 className="text-sm font-semibold text-slate-200">Smart Picking</h3>
              <p className="text-xs text-slate-400 mt-1">Automated pallet allocation and routing</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/15 backdrop-blur-sm hover:border-emerald-400/30 transition-all duration-300 shadow-sm">
              <TrendingUp className="w-6 h-6 text-teal-400 mb-2" />
              <h3 className="text-sm font-semibold text-slate-200">Live Prices</h3>
              <p className="text-xs text-slate-400 mt-1">Dubai & International FOB market feeds</p>
            </div>
            <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/15 backdrop-blur-sm hover:border-emerald-400/30 transition-all duration-300 shadow-sm">
              <ShieldCheck className="w-6 h-6 text-emerald-300 mb-2" />
              <h3 className="text-sm font-semibold text-slate-200">Zero Variance</h3>
              <p className="text-xs text-slate-400 mt-1">Enterprise-grade audit and stock protection</p>
            </div>
          </div>
        </motion.div>

        {/* Footer info */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-400/70 border-t border-emerald-500/10 pt-6">
          <p>© 2026 NexWare Enterprise. All rights reserved.</p>
        </div>
      </div>

      {/* Right Panel - Interactive Form */}
      <div className="w-full lg:w-5/12 bg-[#000d0a] flex items-center justify-center p-6 sm:p-12 relative overflow-hidden">
        {/* Subtle right glow */}
        <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="w-full max-w-md bg-[#001712]/90 p-8 sm:p-10 rounded-3xl shadow-2xl border border-emerald-500/20 backdrop-blur-xl relative z-10"
        >
          {/* Mobile brand header */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <svg width="36" height="36" viewBox="0 0 40 40" fill="none">
              <path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="#064e3b"/>
              <path d="M14 12L20 24L26 12M14 28V12M26 12V28" stroke="#80bea6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-2xl font-extrabold tracking-tight text-white">NexWare</span>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white tracking-tight mb-2 flex items-center gap-2">
              Welcome back
            </h2>
            <p className="text-sm text-slate-400">
              Sign in with your enterprise credentials to access the terminal.
            </p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-200">Email or Username</label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 pointer-events-none text-slate-400 flex items-center justify-center">
                  <User className="h-4 w-4 text-emerald-400" />
                </div>
                <input
                  type="text"
                  placeholder="admin@nexware.com"
                  className="w-full h-11 pl-11 pr-4 bg-[#00211a] border border-emerald-500/30 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 rounded-xl text-sm transition-all shadow-inner font-medium"
                  {...register('email')}
                />
              </div>
              {errors.email && <span className="text-xs text-red-400 block">{errors.email.message}</span>}
            </div>
            
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-200">Password</label>
              <div className="relative flex items-center">
                <div className="absolute left-3.5 pointer-events-none text-slate-400 flex items-center justify-center">
                  <Lock className="h-4 w-4 text-emerald-400" />
                </div>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full h-11 pl-11 pr-4 bg-[#00211a] border border-emerald-500/30 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 rounded-xl text-sm transition-all shadow-inner font-medium"
                  {...register('password')}
                />
              </div>
              {errors.password && <span className="text-xs text-red-400 block">{errors.password.message}</span>}
            </div>

            <div className="pt-2">
              <Button 
                type="submit" 
                className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-semibold shadow-lg shadow-emerald-600/20 transition-all duration-300 flex items-center justify-center gap-2 group text-base"
                isLoading={isLoading}
              >
                <span>Sign In to Terminal</span>
                {!isLoading && <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />}
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

