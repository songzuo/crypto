import React from "react";

interface StatsCardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "increase" | "decrease" | "neutral";
  icon: string;
  iconBgColor: string;
  iconColor: string;
}

const StatsCard: React.FC<StatsCardProps> = ({
  title,
  value,
  change,
  changeType = "neutral",
  icon,
  iconBgColor,
  iconColor,
}) => {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-6">
      <div className="flex justify-between items-start">
        <div>
          <p className="text-slate-500 dark:text-slate-400 text-sm">{title}</p>
          <h2 className="text-2xl font-semibold mt-1">{value}</h2>
          {change && (
            <div
              className={`flex items-center mt-2 ${
                changeType === "increase"
                  ? "text-emerald-500"
                  : changeType === "decrease"
                  ? "text-red-500"
                  : "text-slate-500 dark:text-slate-400"
              }`}
            >
              {changeType === "increase" && <i className="ri-arrow-up-line mr-1"></i>}
              {changeType === "decrease" && <i className="ri-arrow-down-line mr-1"></i>}
              <span className="text-sm">{change}</span>
            </div>
          )}
        </div>
        <div className={`p-2 ${iconBgColor} rounded-lg`}>
          <i className={`${icon} ${iconColor} text-xl`}></i>
        </div>
      </div>
    </div>
  );
};

export default StatsCard;
