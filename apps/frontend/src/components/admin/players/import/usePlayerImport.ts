import { useState } from "react";
import { API_BASE_URL, AUTH, LS_KEYS } from "@/common/consts";

interface ImportOptions {
  dry_run: boolean;
  conflict: "skip" | "update" | "error";
  slot_strategy: "lookup" | "create" | "ignore";
}

interface RowError {
  row: number;
  field?: string;
  message: string;
}

interface ConflictDetail {
  row: number;
  reason: string;
}

interface PlayerSample {
  name: string;
  team: string;
  points: number;
  status: string;
  slot?: string;
}

export interface ImportResponse {
  dry_run: boolean;
  format: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created: number;
  updated: number;
  skipped: number;
  conflicts: ConflictDetail[];
  errors: RowError[];
  samples: PlayerSample[];
  has_more_errors: boolean;
  job_id?: string;
}

export function usePlayerImport(onSuccess?: () => void) {
  const [file, setFile] = useState<File | null>(null);
  const [options, setOptions] = useState<ImportOptions>({
    dry_run: true,
    conflict: "skip",
    slot_strategy: "lookup",
  });
  const [loading, setLoading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const extension = selectedFile.name.split(".").pop()?.toLowerCase();
      if (extension !== "xlsx" && extension !== "csv") {
        setError("Invalid file type. Please upload .xlsx or .csv file");
        return;
      }
      setFile(selectedFile);
      setResult(null);
      setError(null);
    }
  };

  const downloadTemplate = async (format: "xlsx" | "csv") => {
    try {
      setDownloadingTemplate(true);
      setError(null);

      const apiUrl = API_BASE_URL;
      const url = `${apiUrl}/api/admin/players/import/template?format=${format}`;

      const response = await fetch(url, {
        headers: {
          [AUTH.HEADER]: `${AUTH.BEARER_PREFIX}${localStorage.getItem(LS_KEYS.ACCESS_TOKEN) || ""}`,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to download template");
      }

      const blob = await response.blob();
      const url2 = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url2;
      a.download = `players_import_template.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url2);
      document.body.removeChild(a);
    } catch (err: unknown) {
      console.error("Error downloading template:", err);
      if (err instanceof Error) {
        setError(err.message || "Failed to download template");
      } else {
        setError("Failed to download template");
      }
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleImport = async (overrideDryRun?: boolean) => {
    if (!file) return;

    const isDryRun = overrideDryRun !== undefined ? overrideDryRun : options.dry_run;

    try {
      setLoading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("dry_run", String(isDryRun));
      formData.append("conflict", options.conflict);
      formData.append("slot_strategy", options.slot_strategy);
      formData.append("header_row", "1");

      const token = localStorage.getItem(LS_KEYS.ACCESS_TOKEN);
      const apiUrl = API_BASE_URL;
      const response = await fetch(`${apiUrl}/api/admin/players/import`, {
        method: "POST",
        headers: {
          [AUTH.HEADER]: `${AUTH.BEARER_PREFIX}${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Import failed");
      }

      const data: ImportResponse = await response.json();
      setResult(data);

      // If dry run succeeded with no errors, user can proceed
      // If actual import succeeded, call onSuccess
      if (!data.dry_run && data.invalid_rows === 0 && onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err: unknown) {
      console.error("Error importing:", err);
      if (err instanceof Error) {
        setError(err.message || "Failed to import players");
      } else {
        setError("Failed to import players");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmImport = () => {
    setOptions(prev => ({ ...prev, dry_run: false }));
    handleImport(false);
  };

  const updateConflictOption = (conflict: "skip" | "update" | "error") => {
    setOptions({ ...options, conflict });
  };

  const updateSlotStrategy = (
    slot_strategy: "lookup" | "create" | "ignore"
  ) => {
    setOptions({ ...options, slot_strategy });
  };

  return {
    // State
    file,
    options,
    loading,
    downloadingTemplate,
    result,
    error,

    // Actions
    handleFileChange,
    downloadTemplate,
    handleImport,
    handleConfirmImport,
    updateConflictOption,
    updateSlotStrategy,
  };
}
