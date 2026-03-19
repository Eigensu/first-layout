import { Edit, Trash2 } from "lucide-react";
import { Player } from "@/lib/api/admin/players";

interface PlayerTableRowProps {
  player: Player;
  slotMap: Record<string, string>;
  onDelete: (playerId: string) => void;
  onEditPoints: (player: Player) => void;
}

export function PlayerTableRow({
  player,
  slotMap,
  onDelete,
  onEditPoints,
}: PlayerTableRowProps) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center">
          {player.image_url ? (
            <img
              src={player.image_url}
              alt={player.name}
              className="w-10 h-10 rounded-lg object-cover"
              onError={(e) => {
                // Fallback to initial if image fails to load
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
          ) : null}
          <div
            className={`w-10 h-10 bg-gradient-to-br from-orange-400 to-orange-600 rounded-lg flex items-center justify-center text-white font-semibold ${
              player.image_url ? "hidden" : ""
            }`}
          >
            {player.name.charAt(0)}
          </div>
          <div className="ml-4">
            <div className="text-sm font-medium text-gray-900">
              {player.name}
            </div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {player.team}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
        {player.slot ? slotMap[player.slot] || player.slot : "-"}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
        {(player.points ?? 0).toFixed(1)}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full ${
            player.status === "Active"
              ? "bg-green-100 text-green-800"
              : player.status === "Injured"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-800"
          }`}
        >
          {player.status}
        </span>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
        <div className="flex justify-end gap-2">
          <button
            onClick={() => onEditPoints(player)}
            className="text-blue-600 hover:text-blue-900"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(player.id)}
            className="text-red-600 hover:text-red-900"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
