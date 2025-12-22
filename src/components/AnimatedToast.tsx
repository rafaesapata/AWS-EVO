import { CheckCircle2, XCircle, Info, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface AnimatedToastProps {
  type: ToastType;
  message: string;
  onClose: () => void;
}

export default function AnimatedToast({ type, message, onClose }: AnimatedToastProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300);
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const config = {
    success: {
      icon: CheckCircle2,
      gradient: "from-green-500 to-emerald-500",
      bgColor: "bg-green-500/10",
      borderColor: "border-green-500/50",
    },
    error: {
      icon: XCircle,
      gradient: "from-red-500 to-rose-500",
      bgColor: "bg-red-500/10",
      borderColor: "border-red-500/50",
    },
    warning: {
      icon: AlertTriangle,
      gradient: "from-yellow-500 to-orange-500",
      bgColor: "bg-yellow-500/10",
      borderColor: "border-yellow-500/50",
    },
    info: {
      icon: Info,
      gradient: "from-blue-500 to-cyan-500",
      bgColor: "bg-blue-500/10",
      borderColor: "border-blue-500/50",
    },
  };

  const { icon: Icon, gradient, bgColor, borderColor } = config[type];

  return (
    <div
      className={`fixed top-4 right-4 z-[100] transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${bgColor} ${borderColor} backdrop-blur-sm shadow-lg max-w-md`}>
        <div className={`p-2 rounded-full bg-gradient-to-br ${gradient} animate-bounce-subtle`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <p className="text-sm font-medium flex-1">{message}</p>
        <button
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
          className="hover:scale-110 transition-transform"
        >
          <XCircle className="h-4 w-4 opacity-50 hover:opacity-100" />
        </button>
      </div>
    </div>
  );
}
