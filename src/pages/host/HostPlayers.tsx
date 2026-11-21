import {
  Check,
  Edit3,
  Grid2X2,
  List,
  Loader2,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CornerBrackets } from '../../components/ui/CornerBrackets';
import { FormField, INPUT_BASE_CLASS } from '../../components/ui/FormField';
import { Modal } from '../../components/ui/Modal';
import { Tag } from '../../components/ui/Tag';
import {
  getCategoryInfo,
  getSkillInfo,
  PLAYER_CATEGORIES,
  PLAYER_CATEGORY_MAP,
  type PlayerCategory,
} from '../../data/categories';
import { formatLakhs } from '../../lib/format';
import { supabase } from '../../lib/supabase';
import { useHostRoom } from '../../store/hostRoom';
import { useToastStore } from '../../store/toast';
import type { RoomPlayerStatus, RoomPlayerWithPlayer } from '../../types/database';

type CategoryTab = 'All' | PlayerCategory;

function formatRateStat(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return '-';
  }
  return value.toFixed(2);
}

function getStatusBadge(status: RoomPlayerStatus): {
  label: string;
  tone: 'neutral' | 'cyan' | 'gold' | 'danger';
} {
  if (status === 'live') return { label: 'LIVE', tone: 'cyan' };
  if (status === 'sold') return { label: 'SOLD', tone: 'gold' };
  if (status === 'unsold') return { label: 'UNSOLD', tone: 'danger' };
  return { label: 'PENDING', tone: 'neutral' };
}

function RoleChip({ skill }: { skill: string | null | undefined }) {
  if (!skill) return null;
  const info = getSkillInfo(skill);
  return (
    <span
      className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap shrink-0 ${
        info?.chipClass ?? 'border-white/15 bg-[#0E1524] text-[#8B95AA]'
      }`}
    >
      {skill}
    </span>
  );
}

function CategoryChip({ category }: { category: string | null | undefined }) {
  if (!category) return null;
  const info = getCategoryInfo(category);
  return (
    <span
      className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] whitespace-nowrap shrink-0 ${
        info?.chipClass ?? 'border-white/15 bg-[#141C2F] text-[#8B95AA]'
      }`}
    >
      {info?.label ?? category}
    </span>
  );
}

function PlayerCardVisual({
  rp,
  large = false,
}: {
  rp: RoomPlayerWithPlayer;
  large?: boolean;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const p = rp.players;
  const fullName = p ? `${p.first_name} ${p.last_name}`.trim() : 'Unknown Player';
  const imageUrl = p?.card_image_url?.trim() || '';
  const showFallback = !imageUrl || imgFailed;
  const categoryInfo = getCategoryInfo(p?.category);

  return (
    <div className="relative aspect-[687/1024] w-full overflow-hidden rounded-[4px] border border-[#F5B921]/70 bg-[#070B14]">
      {!showFallback ? (
        <img
          src={imageUrl}
          alt={fullName}
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="relative flex h-full w-full flex-col justify-between bg-[#070B14] p-3.5 hero-gold-diagonal">
          <CornerBrackets tone="gold" size="sm" />

          <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#F5B921]">
              {p?.player_code || `#${p?.serial ?? '—'}`}
            </span>
            <span
              className={`font-mono text-[10px] uppercase tracking-[0.08em] ${
                categoryInfo?.textClass ?? 'text-[#22D3EE]'
              }`}
            >
              {categoryInfo?.label ?? p?.category ?? 'PLAYER'}
            </span>
          </div>

          <div className="my-auto flex flex-col items-center py-2 text-center">
            <p
              className={`font-display leading-none tracking-wide text-[#E8ECF4] ${
                large ? 'text-4xl' : 'text-2xl'
              }`}
            >
              {fullName}
            </p>
            {p?.skill && (
              <div className="mt-2.5">
                <RoleChip skill={p.skill} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-1.5 border-t border-white/[0.08] pt-2.5 font-mono text-[10px] tabular-nums">
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">MAT</span>
              <span className="text-[#E8ECF4]">{p?.matches ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">RUNS</span>
              <span className="text-[#E8ECF4]">{p?.runs ?? 0}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">SR</span>
              <span className="text-[#E8ECF4]">{formatRateStat(p?.strike_rate)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#8B95AA]">WKTS</span>
              <span className="text-[#E8ECF4]">{p?.wickets ?? 0}</span>
            </div>
            <div className="col-span-2 flex justify-between border-t border-white/[0.06] pt-1">
              <span className="text-[#8B95AA]">ECON</span>
              <span className="text-[#F5B921]">{formatRateStat(p?.economy)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function HostPlayers() {
  const room = useHostRoom((s) => s.room);
  const roomPlayers = useHostRoom((s) => s.roomPlayers);
  const refreshRoomPlayers = useHostRoom((s) => s.refreshRoomPlayers);
  const showToast = useToastStore((s) => s.showToast);

  const [activeCategory, setActiveCategory] = useState<CategoryTab>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Inline base price editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLakhs, setEditLakhs] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Category bulk base price modal
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [categoryLakhs, setCategoryLakhs] = useState('50');
  const [savingCategory, setSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Player detail modal
  const [detailPlayer, setDetailPlayer] = useState<RoomPlayerWithPlayer | null>(null);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: roomPlayers.length };
    for (const cat of PLAYER_CATEGORIES) {
      counts[cat.value] = 0;
    }
    for (const rp of roomPlayers) {
      const cat = rp.players?.category;
      if (cat && cat in counts) {
        counts[cat] += 1;
      }
    }
    return counts as Record<CategoryTab, number>;
  }, [roomPlayers]);

  const filteredPlayers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return roomPlayers.filter((rp) => {
      const p = rp.players;
      if (!p) return false;

      if (activeCategory !== 'All' && p.category !== activeCategory) {
        return false;
      }

      if (!q) return true;
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      const code = (p.player_code || '').toLowerCase();
      const team = (p.ipl_team || '').toLowerCase();
      const nat = (p.nationality || '').toLowerCase();
      return (
        fullName.includes(q) ||
        code.includes(q) ||
        team.includes(q) ||
        nat.includes(q)
      );
    });
  }, [roomPlayers, activeCategory, searchQuery]);

  const startInlineEdit = (rp: RoomPlayerWithPlayer) => {
    if (rp.status !== 'pending') return;
    setEditingId(rp.id);
    setEditLakhs(String(rp.base_price_lakhs));
  };

  const handleSaveInlinePrice = async (rpId: string) => {
    if (!supabase) return;
    const lakhs = Number(editLakhs);
    if (!Number.isFinite(lakhs) || lakhs <= 0) {
      showToast({
        title: 'Invalid base price',
        description: 'Enter a positive amount in lakhs.',
        tone: 'error',
      });
      return;
    }

    setSavingEdit(true);
    try {
      const { error } = await supabase.rpc('set_base_price', {
        p_room_player_id: rpId,
        p_lakhs: Math.round(lakhs),
      });

      if (error) {
        showToast({
          title: 'Failed to update price',
          description: error.message,
          tone: 'error',
        });
        return;
      }

      await refreshRoomPlayers();
      setEditingId(null);
      showToast({
        title: 'Base price updated',
        description: `Set to ${formatLakhs(Math.round(lakhs))}.`,
        tone: 'success',
      });
    } catch (err) {
      showToast({
        title: 'Error updating price',
        description: err instanceof Error ? err.message : 'Request failed.',
        tone: 'error',
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSaveCategoryPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !room || activeCategory === 'All') return;

    setCategoryError(null);
    const lakhs = Number(categoryLakhs);
    if (!Number.isFinite(lakhs) || lakhs <= 0) {
      setCategoryError('Enter a valid amount in lakhs (greater than 0).');
      return;
    }

    setSavingCategory(true);
    try {
      const { data, error } = await supabase.rpc('set_category_base_price', {
        p_room: room.id,
        p_category: activeCategory,
        p_lakhs: Math.round(lakhs),
      });

      if (error) {
        setCategoryError(error.message || 'Could not update category base price.');
        return;
      }

      const updatedCount = typeof data === 'number' ? data : Number(data ?? 0);
      const label = PLAYER_CATEGORY_MAP[activeCategory]?.label ?? activeCategory;
      await refreshRoomPlayers();
      setCategoryModalOpen(false);
      showToast({
        title: `Updated ${Number.isFinite(updatedCount) ? updatedCount : 0} players`,
        description: `${label} pending players set to ${formatLakhs(Math.round(lakhs))}.`,
        tone: 'success',
      });
    } catch (err) {
      setCategoryError(
        err instanceof Error ? err.message : 'Failed to update category price.',
      );
    } finally {
      setSavingCategory(false);
    }
  };

  if (!room) return null;

  const parsedInline = Number(editLakhs);
  const parsedCategory = Number(categoryLakhs);
  const activeCategoryInfo =
    activeCategory !== 'All' ? PLAYER_CATEGORY_MAP[activeCategory] : null;
  const detailCategoryInfo = getCategoryInfo(detailPlayer?.players?.category);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-white/[0.08] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#22D3EE]">
            AUCTION POOL // {roomPlayers.length} PLAYERS
          </p>
          <h1 className="mt-1.5 font-display text-4xl sm:text-5xl tracking-wide text-[#E8ECF4]">
            PLAYERS CATALOG
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeCategory !== 'All' && (
            <Button
              variant="gold"
              size="sm"
              onClick={() => {
                setCategoryError(null);
                setCategoryModalOpen(true);
              }}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Set base price for this category</span>
            </Button>
          )}

          {/* Grid / Table Toggle */}
          <div
            role="group"
            aria-label="View mode"
            className="inline-flex rounded-[4px] border border-white/10 bg-[#0E1524] p-0.5"
          >
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-pressed={viewMode === 'grid'}
              className={`inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                viewMode === 'grid'
                  ? 'bg-[#22D3EE] font-semibold text-[#070B14]'
                  : 'text-[#8B95AA] hover:text-[#E8ECF4]'
              }`}
            >
              <Grid2X2 className="h-3.5 w-3.5" />
              <span>Grid</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              aria-pressed={viewMode === 'table'}
              className={`inline-flex items-center gap-1.5 rounded-[2px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                viewMode === 'table'
                  ? 'bg-[#22D3EE] font-semibold text-[#070B14]'
                  : 'text-[#8B95AA] hover:text-[#E8ECF4]'
              }`}
            >
              <List className="h-3.5 w-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>
      </div>

      {/* Category Tabs + Search */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div
          role="tablist"
          aria-label="Player category filter"
          className="flex flex-wrap items-center gap-1.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'All'}
            onClick={() => setActiveCategory('All')}
            className={`inline-flex items-center gap-2 rounded-[4px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors whitespace-nowrap shrink-0 ${
              activeCategory === 'All'
                ? 'border-[#F5B921] bg-[#F5B921] font-semibold text-[#070B14]'
                : 'border-white/10 bg-[#0E1524] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4]'
            }`}
          >
            <span>All</span>
            <span
              className={`tabular-nums ${
                activeCategory === 'All' ? 'text-[#070B14]/80' : 'text-[#8B95AA]'
              }`}
            >
              {categoryCounts.All}
            </span>
          </button>

          {PLAYER_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.value;
            return (
              <button
                key={cat.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveCategory(cat.value)}
                className={`inline-flex items-center gap-2 rounded-[4px] border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? `${cat.activeTabClass} font-semibold`
                    : 'border-white/10 bg-[#0E1524] text-[#8B95AA] hover:border-white/25 hover:text-[#E8ECF4]'
                }`}
              >
                <span className={isActive ? 'text-[#070B14]/70' : cat.textClass}>
                  S{cat.setNo}
                </span>
                <span>{cat.label}</span>
                <span
                  className={`tabular-nums ${
                    isActive ? 'text-[#070B14]/80' : 'text-[#8B95AA]'
                  }`}
                >
                  {categoryCounts[cat.value]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full lg:w-72 shrink-0">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8B95AA]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search name, code, IPL team, nationality"
            aria-label="Search players"
            className={`${INPUT_BASE_CLASS} pl-9 py-2 text-xs`}
          />
        </div>
      </div>

      {/* Empty State */}
      {filteredPlayers.length === 0 ? (
        <Card className="p-10 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-[#8B95AA]">
            NO PLAYERS MATCH CURRENT FILTER
          </p>
        </Card>
      ) : viewMode === 'grid' ? (
        /* Grid View */
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {filteredPlayers.map((rp) => {
            const p = rp.players!;
            const fullName = `${p.first_name} ${p.last_name}`.trim();
            const statusChip = getStatusBadge(rp.status);
            const isEditing = editingId === rp.id;

            return (
              <div
                key={rp.id}
                style={{ contentVisibility: 'auto' }}
                className="flex flex-col rounded-[4px] border border-white/[0.08] bg-[#0E1524] p-3"
              >
                <button
                  type="button"
                  onClick={() => setDetailPlayer(rp)}
                  className="block w-full text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22D3EE]"
                >
                  <PlayerCardVisual rp={rp} />
                </button>

                <div className="mt-3 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setDetailPlayer(rp)}
                      className="text-left font-sans text-sm font-semibold leading-snug text-[#E8ECF4] hover:text-[#22D3EE]"
                    >
                      {fullName}
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    <RoleChip skill={p.skill} />
                    {p.is_overseas && <Tag accent="gold">OVERSEAS</Tag>}
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="truncate font-mono text-[#8B95AA]">
                      {p.nationality}
                    </span>
                    {p.player_code && (
                      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-[#F5B921] shrink-0">
                        {p.player_code}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <Badge tone={statusChip.tone}>{statusChip.label}</Badge>
                    <span className="font-mono text-[10px] text-[#8B95AA] tabular-nums">
                      SET {rp.set_no}
                    </span>
                  </div>
                </div>

                {/* Base Price & Inline Edit */}
                <div className="mt-3 border-t border-white/[0.08] pt-2.5">
                  {isEditing ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={editLakhs}
                          disabled={savingEdit}
                          onChange={(e) => setEditLakhs(e.target.value)}
                          aria-label={`Base price in lakhs for ${fullName}`}
                          className="w-full rounded-[2px] border border-[#22D3EE] bg-[#070B14] px-2 py-1 font-mono text-xs text-[#E8ECF4] tabular-nums focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => void handleSaveInlinePrice(rp.id)}
                          aria-label="Save base price"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] bg-[#22D3EE] text-[#070B14] hover:bg-[#38E0FA]"
                        >
                          {savingEdit ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => setEditingId(null)}
                          aria-label="Cancel editing"
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-white/15 bg-[#070B14] text-[#8B95AA] hover:text-[#E8ECF4]"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <p className="font-mono text-[10px] text-[#22D3EE] tabular-nums">
                        {Number.isFinite(parsedInline) && parsedInline > 0
                          ? `Preview: ${formatLakhs(Math.round(parsedInline))}`
                          : 'Enter lakhs'}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="font-mono text-[10px] uppercase text-[#8B95AA]">
                          BASE
                        </p>
                        <p className="font-mono text-xs font-semibold text-[#F5B921] tabular-nums">
                          {formatLakhs(rp.base_price_lakhs)}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={rp.status !== 'pending'}
                        onClick={() => startInlineEdit(rp)}
                        title={
                          rp.status === 'pending'
                            ? 'Edit base price'
                            : 'Only pending players can be edited'
                        }
                        aria-label={`Edit base price for ${fullName}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-white/10 bg-[#070B14] text-[#8B95AA] transition-colors hover:border-[#F5B921]/50 hover:text-[#F5B921] disabled:cursor-not-allowed disabled:opacity-35"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1140px] border-collapse text-left">
              <thead>
                <tr className="border-b border-white/[0.08] bg-[#141C2F] font-mono text-[10px] uppercase tracking-[0.1em] text-[#8B95AA]">
                  <th className="px-3 py-3">Serial</th>
                  <th className="px-3 py-3">Code</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Category</th>
                  <th className="px-3 py-3">Role</th>
                  <th className="px-3 py-3">Nationality</th>
                  <th className="px-3 py-3 text-right">Matches</th>
                  <th className="px-3 py-3 text-right">Runs</th>
                  <th className="px-3 py-3 text-right">SR</th>
                  <th className="px-3 py-3 text-right">Econ</th>
                  <th className="px-3 py-3 text-right">Wkts</th>
                  <th className="px-3 py-3 text-right">Base Price</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] text-xs">
                {filteredPlayers.map((rp) => {
                  const p = rp.players!;
                  const fullName = `${p.first_name} ${p.last_name}`.trim();
                  const statusChip = getStatusBadge(rp.status);
                  const isEditing = editingId === rp.id;

                  return (
                    <tr
                      key={rp.id}
                      className="transition-colors hover:bg-[#141C2F]/40"
                    >
                      <td className="px-3 py-2.5 font-mono text-[#8B95AA] tabular-nums">
                        {p.serial}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.06em] text-[#F5B921] whitespace-nowrap">
                        {p.player_code || '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => setDetailPlayer(rp)}
                          className="font-medium text-[#E8ECF4] hover:text-[#22D3EE]"
                        >
                          {fullName}
                        </button>
                      </td>
                      <td className="px-3 py-2.5">
                        <CategoryChip category={p.category} />
                      </td>
                      <td className="px-3 py-2.5">
                        <RoleChip skill={p.skill} />
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[#E8ECF4]">{p.nationality}</span>
                        {p.is_overseas && (
                          <Tag accent="gold" className="ml-1.5">
                            OS
                          </Tag>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {p.matches}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {p.runs}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatRateStat(p.strike_rate)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {formatRateStat(p.economy)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {p.wickets}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              min={1}
                              value={editLakhs}
                              disabled={savingEdit}
                              onChange={(e) => setEditLakhs(e.target.value)}
                              className="w-16 rounded-[2px] border border-[#22D3EE] bg-[#070B14] px-1.5 py-0.5 text-right text-xs text-[#E8ECF4]"
                            />
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={() => void handleSaveInlinePrice(rp.id)}
                              className="rounded-[2px] bg-[#22D3EE] p-1 text-[#070B14]"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              disabled={savingEdit}
                              onClick={() => setEditingId(null)}
                              className="rounded-[2px] border border-white/15 p-1 text-[#8B95AA]"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <span className="font-semibold text-[#F5B921]">
                              {formatLakhs(rp.base_price_lakhs)}
                            </span>
                            <button
                              type="button"
                              disabled={rp.status !== 'pending'}
                              onClick={() => startInlineEdit(rp)}
                              aria-label={`Edit base price for ${fullName}`}
                              className="text-[#8B95AA] hover:text-[#F5B921] disabled:cursor-not-allowed disabled:opacity-30"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge tone={statusChip.tone}>{statusChip.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Set Base Price for Category Modal */}
      <Modal
        open={categoryModalOpen}
        onClose={() => !savingCategory && setCategoryModalOpen(false)}
        eyebrow={
          activeCategoryInfo
            ? `SET ${activeCategoryInfo.setNo} // BULK BASE PRICE`
            : 'BULK BASE PRICE'
        }
        title={`SET ${(activeCategoryInfo?.label ?? activeCategory).toUpperCase()} BASE PRICE`}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveCategoryPrice} className="space-y-4">
          <p className="text-sm text-[#8B95AA]">
            Updates the base price for all pending players in the{' '}
            <span className={activeCategoryInfo?.textClass ?? 'text-[#E8ECF4]'}>
              {activeCategoryInfo?.label ?? activeCategory}
            </span>{' '}
            category.
          </p>

          <FormField
            id="category-base-lakhs"
            label="Base price (Lakhs)"
            hint={
              Number.isFinite(parsedCategory) && parsedCategory > 0
                ? formatLakhs(Math.round(parsedCategory))
                : 'LAKHS'
            }
            required
          >
            <input
              id="category-base-lakhs"
              type="number"
              min={1}
              value={categoryLakhs}
              disabled={savingCategory}
              onChange={(e) => setCategoryLakhs(e.target.value)}
              className={`${INPUT_BASE_CLASS} font-mono tabular-nums`}
            />
          </FormField>

          {categoryError && (
            <p role="alert" className="text-xs text-red-400">
              {categoryError}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={savingCategory}
              onClick={() => setCategoryModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="gold"
              size="sm"
              disabled={savingCategory}
            >
              {savingCategory ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <span>Apply to category</span>
              )}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Player Detail Modal */}
      <Modal
        open={Boolean(detailPlayer)}
        onClose={() => setDetailPlayer(null)}
        eyebrow={
          detailPlayer?.players
            ? `${detailPlayer.players.player_code} // SERIAL #${detailPlayer.players.serial}`
            : 'PLAYER PROFILE'
        }
        title={
          detailPlayer?.players
            ? `${detailPlayer.players.first_name} ${detailPlayer.players.last_name}`.trim()
            : 'PLAYER'
        }
        maxWidthClass="max-w-2xl"
        footer={
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setDetailPlayer(null)}>
              Close
            </Button>
          </div>
        }
      >
        {detailPlayer?.players && (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-12">
            <div className="sm:col-span-5">
              <PlayerCardVisual rp={detailPlayer} large />
            </div>

            <div className="space-y-4 sm:col-span-7">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={getStatusBadge(detailPlayer.status).tone}>
                  {detailPlayer.status.toUpperCase()}
                </Badge>
                <CategoryChip category={detailPlayer.players.category} />
                <RoleChip skill={detailPlayer.players.skill} />
                {detailPlayer.players.is_overseas && <Tag accent="gold">OVERSEAS</Tag>}
                <Tag accent="cyan">SET {detailPlayer.set_no}</Tag>
              </div>

              <div className="grid grid-cols-2 gap-3 rounded-[4px] border border-white/[0.08] bg-[#070B14] p-4 text-xs">
                <div>
                  <p className="font-mono text-[10px] uppercase text-[#8B95AA]">
                    PLAYER CODE
                  </p>
                  <p className="mt-0.5 font-mono font-medium text-[#F5B921]">
                    {detailPlayer.players.player_code || '—'}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase text-[#8B95AA]">ROLE</p>
                  <p className="mt-0.5 font-medium text-[#E8ECF4]">
                    {detailPlayer.players.skill}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase text-[#8B95AA]">
                    NATIONALITY
                  </p>
                  <p className="mt-0.5 font-medium text-[#E8ECF4]">
                    {detailPlayer.players.nationality}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase text-[#8B95AA]">
                    AUCTION SET
                  </p>
                  <p
                    className={`mt-0.5 font-mono font-medium ${
                      detailCategoryInfo?.textClass ?? 'text-[#E8ECF4]'
                    }`}
                  >
                    Set {detailCategoryInfo?.setNo ?? detailPlayer.set_no} ·{' '}
                    {detailCategoryInfo?.label ?? detailPlayer.players.category}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase text-[#8B95AA]">
                    IPL TEAM
                  </p>
                  <p className="mt-0.5 font-medium text-[#E8ECF4]">
                    {detailPlayer.players.ipl_team || '—'}
                  </p>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase text-[#8B95AA]">
                    IPL SEASON
                  </p>
                  <p className="mt-0.5 font-medium text-[#E8ECF4]">
                    {detailPlayer.players.ipl_season || '—'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 font-mono text-xs tabular-nums">
                <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3">
                  <p className="text-[10px] text-[#8B95AA]">MATCHES</p>
                  <p className="mt-1 text-base font-semibold text-[#E8ECF4]">
                    {detailPlayer.players.matches}
                  </p>
                </div>
                <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3">
                  <p className="text-[10px] text-[#8B95AA]">RUNS</p>
                  <p className="mt-1 text-base font-semibold text-[#E8ECF4]">
                    {detailPlayer.players.runs}
                  </p>
                </div>
                <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3">
                  <p className="text-[10px] text-[#8B95AA]">STRIKE RATE</p>
                  <p className="mt-1 text-base font-semibold text-[#E8ECF4]">
                    {formatRateStat(detailPlayer.players.strike_rate)}
                  </p>
                </div>
                <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3">
                  <p className="text-[10px] text-[#8B95AA]">WICKETS</p>
                  <p className="mt-1 text-base font-semibold text-[#E8ECF4]">
                    {detailPlayer.players.wickets}
                  </p>
                </div>
                <div className="rounded-[4px] border border-white/[0.08] bg-[#070B14] p-3">
                  <p className="text-[10px] text-[#8B95AA]">ECONOMY</p>
                  <p className="mt-1 text-base font-semibold text-[#E8ECF4]">
                    {formatRateStat(detailPlayer.players.economy)}
                  </p>
                </div>
                <div className="rounded-[4px] border border-[#F5B921]/35 bg-[#070B14] p-3">
                  <p className="text-[10px] text-[#8B95AA]">BASE PRICE</p>
                  <p className="mt-1 text-base font-semibold text-[#F5B921]">
                    {formatLakhs(detailPlayer.base_price_lakhs)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
