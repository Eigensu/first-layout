"use client";

import { useState, useEffect } from "react";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Settings, Save, Loader2 } from "lucide-react";
import { adminSettingsApi } from "@/lib/api/admin/settings";
import { showToast } from "@/components";

export function GeneralSettingsSection() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    min_players_per_team: 1,
    max_players_per_team: 7,
  });

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const data = await adminSettingsApi.getSettings();
        setForm({
          min_players_per_team: data.min_players_per_team,
          max_players_per_team: data.max_players_per_team,
        });
      } catch (err: any) {
        console.error("Failed to fetch settings:", err);
        setError("Failed to load settings. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (form.min_players_per_team > form.max_players_per_team) {
      showToast({
        message: "Min players cannot be greater than max players.",
        variant: "error",
      });
      return;
    }

    try {
      setSaving(true);
      await adminSettingsApi.updateSettings(form);
      showToast({
        message: "Settings updated successfully!",
        variant: "success",
      });
    } catch (err: any) {
      console.error("Failed to update settings:", err);
      showToast({
        message: "Failed to update settings. Please try again.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin mb-4" />
        <p className="text-gray-500">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-orange-100 rounded-lg">
          <Settings className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900">General Settings</h2>
          <p className="text-sm text-gray-500">
            Configure global fantasy team constraints and rules.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      <Card className="bg-white border-gray-200 shadow-sm overflow-hidden">
        <CardBody className="p-0">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label
                  htmlFor="min_players"
                  className="block text-sm font-semibold text-gray-700"
                >
                  Min Players Per Team
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Minimum number of players a user must select from each real-world team.
                </p>
                <input
                  id="min_players"
                  type="number"
                  min={0}
                  max={11}
                  value={form.min_players_per_team}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      min_players_per_team: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="max_players"
                  className="block text-sm font-semibold text-gray-700"
                >
                  Max Players Per Team
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Maximum number of players a user can select from a single real-world team.
                </p>
                <input
                  id="max_players"
                  type="number"
                  min={1}
                  max={11}
                  value={form.max_players_per_team}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_players_per_team: parseInt(e.target.value) || 0,
                    })
                  }
                  className="w-full px-4 py-2 bg-white text-gray-900 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none transition-all"
                />
              </div>
            </div>
          </div>

          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between border-t border-gray-100">
            <p className="text-xs text-gray-500 italic max-w-sm">
              * These settings override constraints globally across all active contests.
            </p>
            <Button
              variant="primary"
              onClick={handleSave}
              disabled={saving}
              className="px-6 flex items-center whitespace-nowrap"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
