interface PlayerSample {
  name: string;
  team: string;
  points: number;
  status: string;
  slot?: string;
  cricheroes_player_id?: number | null;
}

interface ImportSampleTableProps {
  samples: PlayerSample[];
}

export function ImportSampleTable({ samples }: ImportSampleTableProps) {
  if (samples.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">
        Sample Players
      </h4>
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Team
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Points
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Slot
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CricHeroes ID
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {samples.map((sample, idx) => (
              <tr key={idx} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm text-gray-900">
                  {sample.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {sample.team}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {sample.status}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">
                  {sample.points}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {sample.slot || "-"}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {sample.cricheroes_player_id ?? "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
