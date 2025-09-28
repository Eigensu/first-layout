import * as React from "react";
import { Card } from "../ui/Card";

interface StepProps {
  stepNumber: number;
  title: string;
  description: string;
  isActive: boolean;
  isCompleted: boolean;
  children: React.ReactNode;
  className?: string;
}

const StepCard: React.FC<StepProps> = ({
  stepNumber,
  title,
  description,
  isActive,
  isCompleted,
  children,
  className = "",
}) => {
  const getStepIcon = () => {
    if (isCompleted) {
      return (
        <svg
          className="w-5 h-5 text-white"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      );
    }
    return stepNumber;
  };

  return (
    <div className={`relative ${className}`}>
      {/* Step Indicator */}
      <div className="absolute -top-4 left-6 z-10">
        <div
          className={`
          w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-white
          ${
            isCompleted
              ? "bg-success-500 shadow-lg"
              : isActive
                ? "bg-primary-500 shadow-lg shadow-primary-200"
                : "bg-gray-400"
          }
        `}
        >
          {getStepIcon()}
        </div>
      </div>

      {/* Step Card */}
      <Card
        className={`
          border-2 transition-all duration-300
          ${
            isActive
              ? "border-primary-300 shadow-glow bg-gradient-to-br from-white to-primary-50"
              : isCompleted
                ? "border-success-300 shadow-medium bg-gradient-to-br from-white to-success-50"
                : "border-gray-200 hover:border-gray-300"
          }
        `}
      >
        <div className="p-6 pt-8">
          <div className="mb-4">
            <h3
              className={`
              text-xl font-semibold font-heading mb-2
              ${isActive || isCompleted ? "text-gray-900" : "text-gray-700"}
            `}
            >
              {title}
            </h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              {description}
            </p>
          </div>
          {children}
        </div>
      </Card>
    </div>
  );
};

// Progress Indicator for Multi-Step Process
interface ProgressIndicatorProps {
  currentStep: number;
  totalSteps: number;
  className?: string;
}

const ProgressIndicator: React.FC<ProgressIndicatorProps> = ({
  currentStep,
  totalSteps,
  className = "",
}) => {
  const progressPercentage = (currentStep / totalSteps) * 100;

  return (
    <div className={`w-full ${className}`}>
      <div className="flex justify-between text-sm text-gray-600 mb-2">
        <span>
          Step {currentStep} of {totalSteps}
        </span>
        <span>{Math.round(progressPercentage)}% Complete</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-gradient-primary h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
    </div>
  );
};

// Step Navigation
interface StepNavigationProps {
  currentStep: number;
  totalSteps: number;
  onNext?: () => void;
  onPrev?: () => void;
  onFinish?: () => void;
  nextLabel?: string;
  prevLabel?: string;
  finishLabel?: string;
  isNextDisabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

const StepNavigation: React.FC<StepNavigationProps> = ({
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onFinish,
  nextLabel = "Next Step",
  prevLabel = "Previous",
  finishLabel = "Complete Team",
  isNextDisabled = false,
  isLoading = false,
  className = "",
}) => {
  const isLastStep = currentStep === totalSteps;
  const isFirstStep = currentStep === 1;

  return (
    <div
      className={`flex justify-between items-center pt-6 border-t border-gray-200 ${className}`}
    >
      <div>
        {!isFirstStep && onPrev && (
          <button
            onClick={onPrev}
            disabled={isLoading}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4 mr-2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {prevLabel}
          </button>
        )}
      </div>

      <div>
        {isLastStep
          ? onFinish && (
              <button
                onClick={onFinish}
                disabled={isNextDisabled || isLoading}
                className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:shadow-glow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading && (
                  <div className="w-4 h-4 mr-2 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                {finishLabel}
              </button>
            )
          : onNext && (
              <button
                onClick={onNext}
                disabled={isNextDisabled || isLoading}
                className="inline-flex items-center px-6 py-2 text-sm font-medium text-white bg-gradient-primary rounded-lg hover:shadow-glow focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {nextLabel}
                <svg
                  className="w-4 h-4 ml-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            )}
      </div>
    </div>
  );
};

export { StepCard, ProgressIndicator, StepNavigation };
export type { StepProps, ProgressIndicatorProps, StepNavigationProps };
