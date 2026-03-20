import { useEffect, useMemo, useState, useCallback } from "react";
import type { Sponsor } from "@/types/sponsor";
import { getSponsors } from "@/lib/api/sponsors";
import { getErrorMessage } from "@/lib/api/client";
import {
  createSponsor,
  uploadSponsorLogo,
  updateSponsor,
  deleteSponsor,
  getAvailablePriorities,
} from "@/lib/api/admin/sponsors";

export type SponsorFormState = {
  name: string;
  logo: string; // optional URL; file upload can replace this
  description: string;
  website: string;
  featured: boolean;
  active: boolean;
  priority: number;
};

export function useSponsorsSection() {
  const [searchQuery, setSearchQuery] = useState("");
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [form, setForm] = useState<SponsorFormState>({
    name: "",
    logo: "",
    description: "",
    website: "",
    featured: false,
    active: true,
    priority: 0,
  });
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [availableFeatured, setAvailableFeatured] = useState<{ gaps: number[]; next: number } | null>(null);
  const [availableNonFeatured, setAvailableNonFeatured] = useState<{ gaps: number[]; next: number } | null>(null);

  // Edit modal state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    name: string;
    description: string;
    featured: boolean;
    active: boolean;
    priority: number;
  }>({ name: "", description: "", featured: false, active: true, priority: 1 });
  const [editLogoFile, setEditLogoFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const fetchSponsors = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSponsors({ active: true });
      setSponsors(data);
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await getSponsors({ active: true });
        if (mounted) setSponsors(data);
      } catch (e: unknown) {
        if (mounted) setError(getErrorMessage(e));
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleDelete = async (id: string) => {
    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteSponsor(id);
      await fetchSponsors();
    } catch (e: unknown) {
      setDeleteError(getErrorMessage(e));
    } finally {
      setDeletingId(null);
    }
  };

  const openEdit = (s: Sponsor) => {
    setEditError(null);
    setEditLogoFile(null);
    setEditingId(s.id);
    setEditForm({
      name: s.name ?? "",
      description: s.description ?? "",
      featured: !!s.featured,
      active: !!s.active,
      priority: s.priority ?? 1,
    });
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    setEditError(null);
    setEditing(true);
    try {
      await updateSponsor(editingId, {
        name: editForm.name.trim(),
        description: editForm.description.trim(),
        featured: editForm.featured,
        active: editForm.active,
        priority: Number(editForm.priority) || undefined,
      });
      if (editLogoFile) {
        await uploadSponsorLogo(editingId, editLogoFile);
      }
      await fetchSponsors();
      setEditLogoFile(null);
      setIsEditOpen(false);
    } catch (e: unknown) {
      setEditError(getErrorMessage(e));
    } finally {
      setEditing(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return sponsors;
    return sponsors.filter((s) =>
      [s.name, s.tier, s.description, s.website]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q))
    );
  }, [sponsors, searchQuery]);

  const titleCase = (t: string) =>
    t ? t.charAt(0).toUpperCase() + t.slice(1) : t;

  const resetForm = () => {
    setForm({
      name: "",
      logo: "",
      description: "",
      website: "",
      featured: false,
      active: true,
      priority: 0,
    });
    setLogoFile(null);
    setAvailableFeatured(null);
    setAvailableNonFeatured(null);
    setPriorityTouched(false);
  };

  const handleCreate = async () => {
    setCreateError(null);
    setCreating(true);
    try {
      if (!logoFile && !form.logo.trim()) {
        throw new Error("Please provide a logo URL or upload a logo image.");
      }

      const created = await createSponsor({
        name: form.name.trim(),
        logo: form.logo.trim() || "pending",
        tier: "bronze",
        description: form.description.trim(),
        website: form.website.trim(),
        featured: form.featured,
        active: form.active,
        priority: Number(form.priority) || undefined,
      });
      if (logoFile) {
        try {
          await uploadSponsorLogo(created.id, logoFile);
        } catch (uploadErr: unknown) {
          try {
            await deleteSponsor(created.id);
          } catch {
            // Best-effort cleanup only.
          }
          throw new Error(getErrorMessage(uploadErr));
        }
      }
      await fetchSponsors();
      setIsAddOpen(false);
      resetForm();
    } catch (err: unknown) {
      setCreateError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  // Fetch available priorities for both groups when add modal opens
  useEffect(() => {
    (async () => {
      if (!isAddOpen) return;
      try {
        const [feat, non] = await Promise.all([
          getAvailablePriorities(true),
          getAvailablePriorities(false),
        ]);
        setAvailableFeatured({ gaps: feat.gaps, next: feat.next });
        setAvailableNonFeatured({ gaps: non.gaps, next: non.next });
        // Prefill based on current featured toggle unless user already typed
        const current = form.featured ? feat : non;
        if (!priorityTouched) setForm((f) => ({ ...f, priority: current.next }));
      } catch (_) {
        // Ignore; UI will still allow manual input
      }
    })();
  }, [isAddOpen]);

  // Refetch relevant group when featured toggle changes to update next/gaps live
  useEffect(() => {
    (async () => {
      if (!isAddOpen) return;
      try {
        if (form.featured) {
          const res = await getAvailablePriorities(true);
          setAvailableFeatured({ gaps: res.gaps, next: res.next });
          // optional prefill when toggled
          if (!priorityTouched) setForm((f) => ({ ...f, priority: res.next }));
        } else {
          const res = await getAvailablePriorities(false);
          setAvailableNonFeatured({ gaps: res.gaps, next: res.next });
          if (!priorityTouched) setForm((f) => ({ ...f, priority: res.next }));
        }
      } catch (_) {}
    })();
  }, [form.featured, isAddOpen, priorityTouched]);

  return {
    // state
    searchQuery,
    sponsors,
    loading,
    error,
    isAddOpen,
    creating,
    createError,
    form,
    logoFile,
    filtered,
    isEditOpen,
    editing,
    editError,
    editForm,
    editLogoFile,
    editingId,
    deletingId,
    deleteError,
    availableFeatured,
    availableNonFeatured,
    priorityTouched,
    // setters
    setSearchQuery,
    setIsAddOpen,
    setForm,
    setLogoFile,
    setIsEditOpen,
    setEditForm,
    setEditLogoFile,
    setPriorityTouched,
    // actions
    handleCreate,
    fetchSponsors,
    openEdit,
    handleUpdate,
    handleDelete,
    // helpers
    titleCase,
  };
}
