import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const GlassCard = ({ children, className, ...props }) => (
  <div
    className={cn(
      "relative overflow-hidden rounded-2xl border border-white/10 bg-[#151921]/60 backdrop-blur-xl shadow-2xl transition-all duration-300",
      "hover:border-white/20 hover:bg-[#151921]/80 hover:shadow-purple-500/10",
      className
    )}
    {...props}
  >
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent opacity-50" />
    <div className="relative z-10 h-full">{children}</div>
  </div>
);

export const NeonButton = ({ children, variant = "primary", className, disabled, loading, icon: Icon, iconPosition = "left", ...props }) => {
  const variants = {
    primary: "bg-gradient-to-r from-purple-600 to-cyan-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] border-none",
    secondary: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:bg-cyan-500/30",
    ghost: "bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 hover:text-white hover:border-white/30 backdrop-blur-md",
    danger: "bg-rose-950/30 border border-rose-900/50 text-rose-200 hover:bg-rose-900/50 hover:border-rose-500/50 shadow-[0_0_15px_rgba(244,63,94,0.2)]",
    success: "bg-emerald-950/30 border border-emerald-900/50 text-emerald-200 hover:bg-emerald-900/50 hover:border-emerald-500/50 shadow-[0_0_15px_rgba(16,185,129,0.2)]",
  };

  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 10 }}
      className={cn(
        "relative inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors duration-300 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none",
        variants[variant],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {!loading && Icon && iconPosition === "left" && <Icon className="h-4 w-4" />}
      {children}
      {!loading && Icon && iconPosition === "right" && <Icon className="h-4 w-4" />}
    </motion.button>
  );
};

export const StatusBadge = ({ status, children, className }) => {
  const styles = {
    success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]",
    warning: "bg-amber-500/10 text-amber-400 border-amber-500/20 shadow-[0_0_10px_rgba(245,158,11,0.1)]",
    error: "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]",
    info: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_10px_rgba(6,182,212,0.1)]",
    pending: "bg-slate-500/10 text-slate-400 border-slate-500/20",
    active: "bg-purple-500/10 text-purple-400 border-purple-500/20 shadow-[0_0_10px_rgba(168,85,247,0.1)]",
    neutral: "bg-slate-800/50 text-slate-300 border-slate-700/50"
  };

  const variant = styles[status] || styles.neutral;

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium backdrop-blur-sm whitespace-nowrap",
      variant,
      className
    )}>
      {children}
    </span>
  );
};

export const TabButton = ({ active, children, onClick, count }) => (
  <button
    onClick={onClick}
    className={cn(
      "relative px-4 py-2 text-sm font-medium transition-colors duration-200",
      active ? "text-cyan-400" : "text-slate-400 hover:text-slate-200"
    )}
  >
    {children}
    {count !== undefined && (
      <span className={cn(
        "ml-2 rounded-full px-1.5 py-0.5 text-[10px]",
        active ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-800 text-slate-400"
      )}>
        {count}
      </span>
    )}
    {active && (
      <motion.div
        layoutId="activeTab"
        className="absolute inset-x-0 bottom-0 h-0.5 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.5)]"
      />
    )}
  </button>
);

export const GlassInput = ({ className, error, icon: Icon, ...props }) => (
  <div className="relative group">
    {Icon && (
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors pointer-events-none">
        <Icon className="w-4 h-4" />
      </div>
    )}
    <input
      className={cn(
        "w-full rounded-xl border bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none transition-all placeholder:text-slate-500",
        "border-white/10 hover:bg-white/10 focus:bg-slate-950/50",
        "focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20",
        error ? "border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20" : "",
        Icon && "pl-10",
        className
      )}
      {...props}
    />
  </div>
);

export const GlassSelect = ({ className, children, icon: Icon, error, ...props }) => (
  <div className="relative group">
    {Icon && (
      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 group-focus-within:text-cyan-400 transition-colors pointer-events-none">
        <Icon className="w-4 h-4" />
      </div>
    )}
    <select
      className={cn(
        "w-full appearance-none rounded-xl border bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none transition-all",
        "border-white/10 hover:bg-white/10 focus:bg-slate-950/50",
        "focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/20",
        error ? "border-rose-500/50 focus:border-rose-500 focus:ring-rose-500/20" : "",
        Icon && "pl-10",
        className
      )}
      {...props}
    >
      {children}
    </select>
    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none group-focus-within:text-cyan-400 transition-colors">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </div>
  </div>
);

