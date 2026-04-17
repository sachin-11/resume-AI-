"use client";
import { useEffect, useState } from "react";
import { Loader2, Save, Plus, X, ShieldCheck } from "lucide-react";
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
