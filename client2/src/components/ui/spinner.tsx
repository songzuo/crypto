import { cn } from "@/lib/utils";

interface SpinnerProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

const Spinner = ({ size = "medium", className }: SpinnerProps) => {
  const sizeClasses = {
    small: "w-4 h-4 border-2",
    medium: "w-8 h-8 border-2",
    large: "w-12 h-12 border-3",
  };

  return (
    <div 
      className={cn(
        "animate-spin rounded-full border-solid border-primary border-r-transparent",
        sizeClasses[size],
        className
      )}
    />
  );
};

export default Spinner;