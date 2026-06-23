"use client";

import ThumbnailHoverPreview from "@/components/ThumbnailHoverPreview";

export type ImagePickerItem = {
  id: string;
  imagePath: string;
  label: string;
};

export type ImagePickerGroup = {
  groupLabel: string;
  items: ImagePickerItem[];
};

type Props = {
  items?: ImagePickerItem[];
  groups?: ImagePickerGroup[];
  selectedId: string;
  onSelect: (id: string) => void;
};

function PickerCard({
  item,
  isSelected,
  onSelect,
}: {
  item: ImagePickerItem;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item.id)}
      title={item.label}
      className={[
        "relative flex flex-col w-full rounded overflow-hidden text-left transition-colors",
        isSelected
          ? "border-2 border-[#5b93d6] bg-[#141e2b]"
          : "border-2 border-[#232629] bg-[#1a1d20] hover:border-[#3a4046] hover:bg-[#212529]",
      ].join(" ")}
    >
      <div className="aspect-square w-full bg-[#141618] flex items-center justify-center overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/${item.imagePath}`}
          alt={item.label}
          className="w-full h-full object-contain"
        />
      </div>
      <div className="px-1 pt-0.5 pb-1">
        <p className="text-[10px] text-[#6e767d] truncate leading-snug">{item.label}</p>
      </div>
      {isSelected && (
        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#5b93d6] flex items-center justify-center">
          <svg width="8" height="6" viewBox="0 0 8 6" fill="none" aria-hidden="true">
            <path d="M1 3L3 5L7 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      )}
    </button>
  );
}

function PickerGrid({
  items,
  selectedId,
  onSelect,
}: {
  items: ImagePickerItem[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {items.map((item) => (
        <ThumbnailHoverPreview
          key={item.id}
          src={`/${item.imagePath}`}
          alt={item.label}
          previewSize={640}
          className="w-full"
        >
          <PickerCard
            item={item}
            isSelected={selectedId === item.id}
            onSelect={onSelect}
          />
        </ThumbnailHoverPreview>
      ))}
    </div>
  );
}

export default function ImageSourcePicker({ items, groups, selectedId, onSelect }: Props) {
  if (groups) {
    return (
      <div className="flex flex-col gap-3">
        {groups.map((group) =>
          group.items.length === 0 ? null : (
            <div key={group.groupLabel} className="flex flex-col gap-1.5">
              <p className="text-[10px] font-medium uppercase tracking-wider text-[#4b5158]">
                {group.groupLabel}
              </p>
              <PickerGrid items={group.items} selectedId={selectedId} onSelect={onSelect} />
            </div>
          )
        )}
      </div>
    );
  }

  return <PickerGrid items={items ?? []} selectedId={selectedId} onSelect={onSelect} />;
}
