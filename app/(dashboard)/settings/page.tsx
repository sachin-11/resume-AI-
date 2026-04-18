"use client";
import { useEffect, useState } from "react";
import { Loader2, Save, Plus, X, ShieldCheck, KeyRound, Eye, EyeOff, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneOtpVerifier } from "@/components/auth/phone-otp";

interface UserSettings {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phoneVerified: boolean;
  targetRole: string | null;
  techStack: string[];
  experienceYears: number | null;
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [newTech, setNewTech] = useState("");

  // Password change state
  const [pwForm, setPwForm] = useState({ current: "", newPw: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);

  // Account deletion state
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.user))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    if (!settings) return;
    setSaving(true);
    setSaveError("");

    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: settings.name,
        targetRole: settings.targetRole,
        techStack: settings.techStack,
        experienceYears: settings.experienceYears,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setSaveError("Failed to save. Please try again.");
    }
  }

  async function handlePasswordChange() {
    if (!pwForm.current || !pwForm.newPw) { setPwError("All fields required"); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwError("Passwords do not match"); return; }
    if (pwForm.newPw.length < 8) { setPwError("New password must be at least 8 characters"); return; }
    setPwSaving(true); setPwError("");
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.newPw }),
    });
    const data = await res.json();
    setPwSaving(false);
    if (res.ok) {
      setPwSuccess(true);
      setPwForm({ current: "", newPw: "", confirm: "" });
      setTimeout(() => setPwSuccess(false), 3000);
    } else {
      setPwError(data.error ?? "Failed to change password");
    }
  }

  async function handleDelete() {
    if (!deletePassword) { setDeleteError("Password required"); return; }
    setDeleting(true); setDeleteError("");
    const res = await fetch("/api/user/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: deletePassword }),
    });
    const data = await res.json();
    if (res.ok) {
      window.location.href = "/login";
    } else {
      setDeleteError(data.error ?? "Failed to delete account");
      setDeleting(false);
    }
  }

  function addTech() {
    if (!newTech.trim() || !settings) return;
    if (!settings.techStack.includes(newTech.trim())) {
      setSettings({ ...settings, techStack: [...settings.techStack, newTech.trim()] });
    }
    setNewTech("");
  }

  function removeTech(tech: string) {
    if (!settings) return;
    setSettings({ ...settings, techStack: settings.techStack.filter((t) => t !== tech) });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage your profile and preferences</p>
      </div>

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Your personal information</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Full Name</Label>
            <Input
              value={settings.name ?? ""}
              onChange={(e) => setSettings({ ...settings, name: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={settings.email} disabled className="opacity-60" />
            <p className="text-xs text-muted-foreground">Email cannot be changed</p>
          </div>
        </CardContent>
      </Card>

      {/* Career Preferences */}
      <Card>
        <CardHeader>
          <CardTitle>Career Preferences</CardTitle>
          <CardDescription>Used to personalize your interview questions</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Target Role</Label>
            <Input
              placeholder="e.g. Senior Full Stack Developer"
              value={settings.targetRole ?? ""}
              onChange={(e) => setSettings({ ...settings, targetRole: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Years of Experience</Label>
            <Select
              value={settings.experienceYears !== null && settings.experienceYears !== undefined ? String(settings.experienceYears) : "none"}
              onValueChange={(v) => setSettings({ ...settings, experienceYears: v === "none" ? null : Number(v) })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select experience level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select experience level</SelectItem>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y === 0 ? "Less than 1 year" : `${y}+ years`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Tech Stack</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Add technology (e.g. React)"
                value={newTech}
                onChange={(e) => setNewTech(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addTech()}
              />
              <Button variant="outline" size="icon" onClick={addTech}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {settings.techStack.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {settings.techStack.map((tech) => (
                  <Badge key={tech} variant="secondary" className="gap-1">
                    {tech}
                    <button onClick={() => removeTech(tech)} className="hover:text-red-400">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Phone Verification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-violet-500" />
            Phone Verification
          </CardTitle>
          <CardDescription>Verify your phone number for added security</CardDescription>
        </CardHeader>
        <CardContent>
          {settings.phoneVerified && settings.phone ? (
            <div className="flex items-center gap-3 rounded-lg bg-green-500/10 border border-green-500/20 px-4 py-3">
              <ShieldCheck className="h-5 w-5 text-green-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-green-400">Phone verified</p>
                <p className="text-xs text-muted-foreground">{settings.phone}</p>
              </div>
              <Badge variant="success" className="ml-auto">Verified</Badge>
            </div>
          ) : (
            <PhoneOtpVerifier onVerified={(phone) => setSettings({ ...settings, phone, phoneVerified: true })} />
          )}
        </CardContent>
      </Card>

      {/* Password Change */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-violet-500" /> Change Password
          </CardTitle>
          <CardDescription>Update your account password</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pwError && <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{pwError}</div>}
          {pwSuccess && <div className="rounded-lg bg-green-500/10 border border-green-500/20 px-3 py-2 text-sm text-green-400">✓ Password changed successfully</div>}
          <div className="space-y-2">
            <Label>Current Password</Label>
            <div className="relative">
              <Input type={showPw ? "text" : "password"} placeholder="••••••••"
                value={pwForm.current} onChange={(e) => setPwForm({ ...pwForm, current: e.target.value })} />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" placeholder="Min. 8 characters"
                value={pwForm.newPw} onChange={(e) => setPwForm({ ...pwForm, newPw: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" placeholder="Repeat new password"
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                className={pwForm.confirm && pwForm.newPw !== pwForm.confirm ? "border-red-500" : ""} />
            </div>
          </div>
          <Button onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.newPw} variant="outline">
            {pwSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            {pwSaving ? "Changing…" : "Change Password"}
          </Button>
        </CardContent>
      </Card>

      {/* GDPR / Data & Privacy */}
      <Card className="border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="h-4 w-4 text-blue-400" /> Data & Privacy
          </CardTitle>
          <CardDescription>GDPR rights — export or delete your data</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Export */}
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Export My Data</p>
              <p className="text-xs text-muted-foreground">Download all your interviews, feedback, and profile data as JSON</p>
            </div>
            <a href="/api/user/export" download
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent transition-colors shrink-0">
              <Download className="h-3.5 w-3.5" /> Export
            </a>
          </div>

          {/* Delete account */}
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-red-400 flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5" /> Delete Account
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all data. This cannot be undone.</p>
            </div>
            {!deleteConfirm ? (
              <button onClick={() => setDeleteConfirm(true)}
                className="text-xs text-red-400 hover:text-red-300 underline underline-offset-2">
                I want to delete my account
              </button>
            ) : (
              <div className="space-y-2">
                {deleteError && <p className="text-xs text-red-400">{deleteError}</p>}
                <Input type="password" placeholder="Enter your password to confirm"
                  value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)}
                  className="border-red-500/30 h-8 text-sm" />
                <div className="flex gap-2">
                  <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting || !deletePassword}>
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {deleting ? "Deleting…" : "Delete Forever"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setDeleteConfirm(false); setDeletePassword(""); setDeleteError(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Button className="w-full" onClick={handleSave} disabled={saving}>
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saved ? "Saved!" : "Save Changes"}
      </Button>
      {saveError && <p className="text-center text-sm text-red-400">{saveError}</p>}
    </div>
  );
}
