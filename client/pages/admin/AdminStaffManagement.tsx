import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  CheckCircle,
  Clock,
  Edit2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { format } from "date-fns";

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  role: "reviewer" | "admin" | "super_admin";
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  reviews_assigned?: number;
  reviews_completed?: number;
  avg_review_time?: number;
}

const ROLES = [
  {
    value: "reviewer",
    label: "Reviewer",
    icon: Shield,
    color: "text-blue-600",
  },
  {
    value: "admin",
    label: "Admin",
    icon: ShieldCheck,
    color: "text-green-600",
  },
  {
    value: "super_admin",
    label: "Super Admin",
    icon: ShieldAlert,
    color: "text-purple-600",
  },
];

export default function AdminStaffManagement() {
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);

  const [formEmail, setFormEmail] = useState("");
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("reviewer");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchStaff();
  }, []);

  const fetchStaff = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("staff_users")
        .select("*")
        .order("full_name");

      if (error) throw error;

      const { data: workload } = await supabase
        .from("v_staff_workload")
        .select("*");

      const staffWithWorkload = (data || []).map((staffMember: StaffUser) => {
        const wl = workload?.find((w: any) => w.staff_id === staffMember.id);
        return {
          ...staffMember,
          reviews_assigned: wl?.reviews_assigned || 0,
          reviews_completed: wl?.reviews_completed || 0,
          avg_review_time: wl?.avg_review_time || 0,
        };
      });

      setStaff(staffWithWorkload);
    } catch (err) {
      console.error("Error fetching staff:", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredStaff = staff.filter((member) => {
    const matchesSearch =
      !search ||
      member.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      member.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = !roleFilter || member.role === roleFilter;
    const matchesStatus =
      !statusFilter ||
      (statusFilter === "active" && member.is_active) ||
      (statusFilter === "inactive" && !member.is_active);
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleAddStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    setFormError("");
    setSaving(true);

    try {
      const { data: existing } = await supabase
        .from("staff_users")
        .select("id")
        .eq("email", formEmail.toLowerCase().trim())
        .single();

      if (existing) {
        setFormError("A staff member with this email already exists");
        setSaving(false);
        return;
      }

      const { error } = await supabase.from("staff_users").insert({
        email: formEmail.toLowerCase().trim(),
        full_name: formName.trim(),
        role: formRole,
        is_active: true,
      });

      if (error) throw error;

      setShowAddModal(false);
      setFormEmail("");
      setFormName("");
      setFormRole("reviewer");
      fetchStaff();
    } catch (err: any) {
      setFormError(err.message || "Failed to add staff member");
    } finally {
      setSaving(false);
    }
  };

  const handleEditStaff = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingStaff) return;
    setFormError("");
    setSaving(true);

    try {
      const { error } = await supabase
        .from("staff_users")
        .update({
          full_name: formName.trim(),
          role: formRole,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingStaff.id);

      if (error) throw error;

      setShowEditModal(false);
      setEditingStaff(null);
      fetchStaff();
    } catch (err: any) {
      setFormError(err.message || "Failed to update staff member");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (staffMember: StaffUser) => {
    try {
      const { error } = await supabase
        .from("staff_users")
        .update({
          is_active: !staffMember.is_active,
          updated_at: new Date().toISOString(),
        })
        .eq("id", staffMember.id);

      if (error) throw error;
      fetchStaff();
    } catch (err) {
      console.error("Error toggling status:", err);
    }
  };

  const openEditModal = (staffMember: StaffUser) => {
    setEditingStaff(staffMember);
    setFormName(staffMember.full_name || "");
    setFormRole(staffMember.role);
    setFormError("");
    setShowEditModal(true);
  };

  const getRoleInfo = (role: string) => {
    return ROLES.find((r) => r.value === role) || ROLES[0];
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-teal-600" />
            Staff Management
          </h1>
          <p className="text-gray-500 mt-1">
            {staff.length} staff member{staff.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => {
            setFormEmail("");
            setFormName("");
            setFormRole("reviewer");
            setFormError("");
            setShowAddModal(true);
          }}
          className="bg-teal-600 text-white px-4 py-2 rounded-lg hover:bg-teal-700 flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Staff
        </button>
      </div>

      <div className="bg-white rounded-lg border p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or email..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <select
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="">All Roles</option>
            {ROLES.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-teal-600 mx-auto" />
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No staff members found
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Name
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Email
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Role
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Status
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Last Login
                </th>
                <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">
                  Reviews
                </th>
                <th className="text-right px-4 py-3 text-sm font-medium text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredStaff.map((member) => {
                const roleInfo = getRoleInfo(member.role);
                const RoleIcon = roleInfo.icon;
                return (
                  <tr key={member.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">
                      {member.full_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{member.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 ${roleInfo.color}`}
                      >
                        <RoleIcon className="w-4 h-4" />
                        {roleInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                          member.is_active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {member.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {member.last_login_at
                        ? format(
                            new Date(member.last_login_at),
                            "MMM d, yyyy h:mm a",
                          )
                        : "Never"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="text-gray-600">
                        {member.reviews_completed || 0} completed
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openEditModal(member)}
                          className="p-1 text-gray-400 hover:text-teal-600"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleActive(member)}
                          className={`p-1 ${
                            member.is_active
                              ? "text-gray-400 hover:text-red-600"
                              : "text-gray-400 hover:text-green-600"
                          }`}
                          title={member.is_active ? "Deactivate" : "Reactivate"}
                        >
                          {member.is_active ? (
                            <UserX className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Add Staff Member</h2>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddStaff} className="p-4">
              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={formEmail}
                    onChange={(event) => setFormEmail(event.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <select
                    value={formRole}
                    onChange={(event) => setFormRole(event.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? "Adding..." : "Add Staff"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && editingStaff && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Edit Staff Member</h2>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleEditStaff} className="p-4">
              {formError && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  {formError}
                </div>
              )}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={editingStaff.email}
                    disabled
                    className="w-full px-3 py-2 border rounded-lg bg-gray-50 text-gray-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role *
                  </label>
                  <select
                    value={formRole}
                    onChange={(event) => setFormRole(event.target.value)}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  >
                    {ROLES.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
