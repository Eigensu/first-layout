"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import {
  Player,
  PlayerCreate,
  PlayerUpdate,
  playersApi,
} from "@/lib/api/admin/players";
import { getErrorMessage } from "@/lib/api/client";

interface PlayerFormModalProps {
  mode: "add" | "edit";
  player?: Player | null;
  slotOptions: { id: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}

const STATUS_OPTIONS = ["Active", "Inactive", "Injured"];

export function PlayerFormModal({
  mode,
  player,
  slotOptions,
  onClose,
  onSaved,
}: PlayerFormModalProps) {
  const labelClass = "block text-sm font-medium text-text-main";
  const inputClass =
    "mt-1 w-full px-3 py-2 border border-border-subtle rounded-md bg-bg-card text-text-main placeholder:text-text-muted focus:ring-2 focus:ring-orange-500 focus:border-transparent";

  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const [points, setPoints] = useState("0");
  const [price, setPrice] = useState("8");
  const [status, setStatus] = useState("Active");
  const [slot, setSlot] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";

  useEffect(() => {
    if (isEdit && player) {
      setName(player.name ?? "");
      setTeam(player.team ?? "");
      setPoints(String(player.points ?? 0));
      setPrice(String(player.price ?? 8));
      setStatus(player.status || "Active");
      setSlot(player.slot ?? "");
      setImageUrl(player.image_url ?? "");
      return;
    }

    setName("");
    setTeam("");
    setPoints("0");
    setPrice("8");
    setStatus("Active");
    setSlot("");
    setImageUrl("");
  }, [isEdit, player]);

  const title = useMemo(
    () => (isEdit ? "Edit Player" : "Add New Player"),
    [isEdit],
  );

  const handleSubmit = async () => {
    try {
      setError(null);

      const trimmedName = name.trim();
      const trimmedTeam = team.trim();
      if (!trimmedName || !trimmedTeam) {
        setError("Name and Team are required");
        return;
      }

      const pointsValue = Number(points);
      const priceValue = Number(price);
      if (Number.isNaN(pointsValue) || Number.isNaN(priceValue)) {
        setError("Points and Price must be valid numbers");
        return;
      }

      setSaving(true);

      if (isEdit && player) {
        const payload: PlayerUpdate = {
          name: trimmedName,
          team: trimmedTeam,
          points: pointsValue,
          price: priceValue,
          status,
          slot: slot || undefined,
          image_url: imageUrl.trim() || undefined,
        };
        await playersApi.updatePlayer(player.id, payload);
      } else {
        const payload: PlayerCreate = {
          name: trimmedName,
          team: trimmedTeam,
          points: pointsValue,
          price: priceValue,
          status,
          slot: slot || undefined,
          image_url: imageUrl.trim() || undefined,
        };
        await playersApi.createPlayer(payload);
      }

      onSaved();
      onClose();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader className="p-4 border-b border-border-subtle">
          <h3 className="text-lg font-semibold text-text-main">{title}</h3>
          {isEdit && player ? (
            <p className="text-sm text-text-muted">Editing: {player.name}</p>
          ) : null}
        </CardHeader>
        <CardBody className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className={labelClass}>
              Name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Team
              <input
                type="text"
                value={team}
                onChange={(e) => setTeam(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Points
              <input
                type="number"
                step="0.1"
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Price
              <input
                type="number"
                step="0.1"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className={inputClass}
              />
            </label>

            <label className={labelClass}>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>

            <label className={labelClass}>
              Slot
              <select
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
                className={inputClass}
              >
                <option value="">No slot</option>
                {slotOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={labelClass}>
            Image URL
            <input
              type="url"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </label>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={saving}>
              {saving
                ? "Saving..."
                : isEdit
                  ? "Update Player"
                  : "Create Player"}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
