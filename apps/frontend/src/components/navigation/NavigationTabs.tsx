import * as React from "react";
import { useState } from "react";

interface Tab {
  id: string;
  label: string;
  icon?: React.ReactNode;
  badge?: number;
}

interface NavigationTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
}

const NavigationTabs: React.FC<NavigationTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className = "",
}) => {
  return (
    <nav
      className={`bg-white shadow-lg rounded-2xl mx-2 sm:mx-4 mt-4 p-1.5 sm:p-2 ${className}`}
    >
      <div className="flex space-x-1 overflow-x-auto scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`
              flex items-center space-x-1.5 sm:space-x-2 px-3 sm:px-4 py-2 sm:py-3 rounded-xl font-medium transition-all relative whitespace-nowrap text-sm sm:text-base
              ${
                activeTab === tab.id
                  ? "bg-gradient-primary text-white shadow-lg transform scale-105"
                  : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              }
            `}
            onClick={() => onTabChange(tab.id)}
          >
            {tab.icon && (
              <span
                className={`${
                  activeTab === tab.id ? "text-white" : "text-gray-500"
                } w-4 h-4 sm:w-5 sm:h-5`}
              >
                {tab.icon}
              </span>
            )}
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.label.split(" ")[0]}</span>
            {tab.badge && tab.badge > 0 && (
              <span
                className={`
                inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-xs font-bold rounded-full
                ${
                  activeTab === tab.id
                    ? "bg-white/20 text-white"
                    : "bg-primary-100 text-primary-600"
                }
              `}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>
    </nav>
  );
};

// Top Navigation Bar Component
interface TopNavigationProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
}

const TopNavigation: React.FC<TopNavigationProps> = ({
  title,
  subtitle,
  actions,
  className = "",
}) => {
  return (
    <header
      className={`bg-white shadow-sm border-b border-gray-200 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold font-heading text-gray-900">
              {title}
            </h1>
            {subtitle && <p className="text-gray-600 mt-1">{subtitle}</p>}
          </div>
          {actions && (
            <div className="flex items-center space-x-3">{actions}</div>
          )}
        </div>
      </div>
    </header>
  );
};

// Breadcrumb Navigation
interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className = "" }) => {
  return (
    <nav className={`flex ${className}`} aria-label="Breadcrumb">
      <ol className="flex items-center space-x-2">
        {items.map((item, index) => (
          <li key={index} className="flex items-center">
            {index > 0 && (
              <svg
                className="w-4 h-4 text-gray-400 mx-2"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span
              className={`
              text-sm
              ${
                item.current
                  ? "text-gray-900 font-medium"
                  : "text-gray-600 hover:text-gray-900 cursor-pointer"
              }
            `}
            >
              {item.label}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export { NavigationTabs, TopNavigation, Breadcrumb };
export type { Tab, NavigationTabsProps, TopNavigationProps, BreadcrumbItem };
