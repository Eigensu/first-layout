"use client";

import { Button } from "@/components/ui/Button";
import { Card, CardBody } from "@/components/ui/Card";
import {
  Upload,
  Download,
  AlertCircle,
  CheckCircle2,
  Loader2,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { usePlayerImport } from "./usePlayerImport";
import { ImportSummary } from "./ImportSummary";
import { ImportErrors } from "./ImportErrors";
import { ImportConflicts } from "./ImportConflicts";
import { ImportSampleTable } from "./ImportSampleTable";

interface PlayerImportProps {
  onSuccess?: () => void;
  onClose?: () => void;
}

export function PlayerImport({ onSuccess, onClose }: PlayerImportProps) {
  const {
    file,
    options,
    loading,
    downloadingTemplate,
    result,
    error,
    handleFileChange,
    downloadTemplate,
    handleImport,
    handleConfirmImport,
    updateConflictOption,
    updateSlotStrategy,
  } = usePlayerImport(onSuccess);

  return (
    <div className="space-y-6 p-6 bg-gray-50 rounded-lg">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import Players</h2>
          <p className="text-sm text-gray-600 mt-1">
            Upload an Excel or CSV file to bulk import players
          </p>
        </div>
        {onClose && (
          <Button variant="ghost" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Download Template */}
      <Card>
        <CardBody>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Download Template
              </h3>
              <p className="text-sm text-gray-600">
                Start with our template to ensure correct formatting
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("xlsx")}
                disabled={downloadingTemplate}
                className="bg-white hover:bg-gray-50"
              >
                {downloadingTemplate ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-2" />
                )}
                Excel (.xlsx)
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadTemplate("csv")}
                disabled={downloadingTemplate}
                className="bg-white hover:bg-gray-50"
              >
                <Download className="w-4 h-4 mr-2" />
                CSV (.csv)
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>

      {/* Upload File */}
      <Card>
        <CardBody>
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Upload File
          </h3>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors bg-white">
            <input
              type="file"
              id="file-upload"
              accept=".xlsx,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-sm text-gray-600 mb-2">
                {file ? (
                  <span className="font-medium text-blue-600">{file.name}</span>
                ) : (
                  <>
                    <span className="text-blue-600 font-medium">
                      Click to upload
                    </span>{" "}
                    or drag and drop
                  </>
                )}
              </p>
              <p className="text-xs text-gray-500">
                Excel (.xlsx) or CSV (.csv) up to 5MB
              </p>
            </label>
          </div>
        </CardBody>
      </Card>

      {/* Import Options */}
      {file && (
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Import Options
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Conflict Policy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Duplicate Names
                </label>
                <select
                  value={options.conflict}
                  onChange={(e) =>
                    updateConflictOption(
                      e.target.value as "skip" | "update" | "error",
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="skip">Skip</option>
                  <option value="update">Update</option>
                  <option value="error">Error</option>
                </select>
              </div>

              {/* Slot Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Slot Mapping
                </label>
                <select
                  value={options.slot_strategy}
                  onChange={(e) =>
                    updateSlotStrategy(
                      e.target.value as "lookup" | "create" | "ignore",
                    )
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="lookup">Lookup Only</option>
                  <option value="create">Create if Missing</option>
                  <option value="ignore">Ignore</option>
                </select>
              </div>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-red-800">Error</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Results Display */}
      {result && (
        <Card>
          <CardBody>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {result.dry_run ? "Preview Results" : "Import Complete"}
            </h3>

            {/* Summary Stats */}
            <div className="mb-6">
              <ImportSummary result={result} />
            </div>

            {/* Errors */}
            {result.errors.length > 0 && (
              <div className="mb-6">
                <ImportErrors
                  errors={result.errors}
                  hasMore={result.has_more_errors}
                />
              </div>
            )}

            {/* Conflicts */}
            {result.conflicts.length > 0 && (
              <div className="mb-6">
                <ImportConflicts conflicts={result.conflicts} />
              </div>
            )}

            {/* Sample Preview */}
            {result.samples.length > 0 && (
              <ImportSampleTable samples={result.samples} />
            )}
          </CardBody>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3">
        {result?.dry_run && result.invalid_rows === 0 && (
          <Button
            variant="primary"
            onClick={handleConfirmImport}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <CheckCircle2 className="w-4 h-4 mr-2" />
            )}
            Confirm & Import
          </Button>
        )}
        {!result && file && (
          <Button
            variant="primary"
            onClick={() => handleImport()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin mr-2" />
            ) : (
              <Upload className="w-4 h-4 mr-2" />
            )}
            Preview Import
          </Button>
        )}
      </div>
    </div>
  );
}
