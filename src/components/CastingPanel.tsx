import AssetTypeBadge from "@/components/AssetTypeBadge";
import Link from "next/link";

type AssignedItem = {
  assignmentId: number;
  assetName: string;
  assetType: string;
  removeAction: () => Promise<void>;
};

type AvailableAsset = {
  id: number;
  name: string;
  type: string;
};

type Props = {
  assignedItems: AssignedItem[];
  availableAssets: AvailableAsset[];
  projectId: number;
  assignAction: (formData: FormData) => Promise<void>;
};

const TYPE_LABEL: Record<string, string> = {
  character: "Character",
  environment: "Environment",
  prop: "Prop",
  vehicle: "Vehicle",
  crowd: "Crowd",
  other: "Other",
};

export default function CastingPanel({
  assignedItems,
  availableAssets,
  projectId,
  assignAction,
}: Props) {
  const totalProjectAssets = assignedItems.length + availableAssets.length;

  return (
    <div className="flex flex-col gap-4">
      {assignedItems.length > 0 && (
        <div className="flex flex-col gap-1">
          {assignedItems.map((item) => (
            <div key={item.assignmentId} className="flex items-center gap-3 py-1">
              <AssetTypeBadge type={item.assetType} />
              <span className="text-sm text-[#a4abb2] flex-1">{item.assetName}</span>
              <form action={item.removeAction}>
                <button
                  type="submit"
                  className="text-sm text-[#4b5158] hover:text-[#cf7b6b] transition-colors px-1 leading-none"
                  aria-label={`Remove ${item.assetName}`}
                >
                  ×
                </button>
              </form>
            </div>
          ))}
        </div>
      )}

      {totalProjectAssets === 0 ? (
        <p className="text-sm text-[#6e767d]">
          No assets in project library yet.{" "}
          <Link
            href={`/projects/${projectId}/assets`}
            className="text-[#5b93d6] hover:text-[#8fbbe8] transition-colors"
          >
            Add assets →
          </Link>
        </p>
      ) : availableAssets.length === 0 ? (
        <p className="text-sm text-[#6e767d]">All project assets are assigned to this shot.</p>
      ) : (
        <form action={assignAction} className="flex items-center gap-2">
          <select
            name="assetId"
            className="flex-1 rounded border border-[#2c3035] bg-[#141618] text-sm text-[#a4abb2] px-2 py-1.5 focus:outline-none focus:border-[#3a4046]"
          >
            {availableAssets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                [{TYPE_LABEL[asset.type] ?? asset.type}] {asset.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-[#2c3035] text-[#a4abb2] px-3 py-1.5 text-sm hover:border-[#3a4046] hover:text-[#e7e9ec] transition-colors shrink-0"
          >
            Assign
          </button>
        </form>
      )}
    </div>
  );
}
